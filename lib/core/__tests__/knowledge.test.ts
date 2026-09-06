import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import {
  KnowledgeParseError,
  addNote,
  backlinksOf,
  filterByScope,
  indexLine,
  journalScopeOf,
  knowledgeSection,
  linksOf,
  listNotes,
  nextNoteId,
  noteFileName,
  parseNote,
  readNote,
  scoreNote,
  searchNotes,
  serializeIndex,
  serializeNote,
  slugifyTitle,
  splitAiSection,
  updateNote,
  withAiSection,
  AI_HEADING,
  aiStatusOf,
  humanHash,
} from "../knowledge";
import type { KnowledgeNote } from "../types";

const FULL = `---
id: K-014
title: Why I abandoned the grid strategy
summary: Fixed spacing cannot survive a breakout.
scope:
  - acme-app
  - area:research
tags:
  - strategy
  - postmortem
created: 2026-08-20
updated: 2026-08-28
source: journal 2026-08-21
---

Grid died on trending markets. See [[K-009]] for the backtest.
`;

const MINIMAL = `---
id: K-001
title: Plain note
summary: Nothing special here.
created: 2026-08-01
updated: 2026-08-01
---

Body text.
`;

function note(over: Partial<KnowledgeNote> = {}): KnowledgeNote {
  return {
    id: "K-001",
    title: "A note",
    summary: "A summary.",
    scope: [],
    tags: [],
    created: "2026-08-01",
    updated: "2026-08-01",
    body: "Body.",
    ...over,
  };
}

describe("parseNote", () => {
  it("parses every field", () => {
    const n = parseNote(FULL);
    expect(n.id).toBe("K-014");
    expect(n.title).toBe("Why I abandoned the grid strategy");
    expect(n.summary).toBe("Fixed spacing cannot survive a breakout.");
    expect(n.scope).toEqual(["acme-app", "area:research"]);
    expect(n.tags).toEqual(["strategy", "postmortem"]);
    expect(n.created).toBe("2026-08-20");
    expect(n.updated).toBe("2026-08-28");
    expect(n.source).toBe("journal 2026-08-21");
    expect(n.body).toBe("Grid died on trending markets. See [[K-009]] for the backtest.");
  });

  it("parses a note with no scope, tags or source", () => {
    const n = parseNote(MINIMAL);
    expect(n.scope).toEqual([]);
    expect(n.tags).toEqual([]);
    expect(n.source).toBeUndefined();
  });

  it("round-trips to identity", () => {
    const once = parseNote(FULL);
    const twice = parseNote(serializeNote(once));
    expect(twice).toEqual(once);
    expect(serializeNote(twice)).toBe(serializeNote(once));
  });

  it("round-trips a minimal note to identity", () => {
    const once = parseNote(MINIMAL);
    expect(serializeNote(parseNote(serializeNote(once)))).toBe(serializeNote(once));
  });

  it("survives a title containing a colon", () => {
    // "BT: avoid branch" written raw is invalid YAML, which used to make the
    // note unparseable and take down every page that lists notes.
    const note = { ...parseNote(MINIMAL), title: "BT: avoid branch" };
    const back = parseNote(serializeNote(note));
    expect(back.title).toBe("BT: avoid branch");
  });

  it("survives the other characters YAML treats as syntax", () => {
    const awkward = [
      "Decision: use X",
      "- leading dash",
      "#hashtag first",
      "quotes \"inside\" it",
      "a # comment marker",
      "{braces} and [brackets]",
      "ends with colon:",
    ];
    for (const title of awkward) {
      const note = { ...parseNote(MINIMAL), title, summary: title };
      const back = parseNote(serializeNote(note));
      expect(back.title).toBe(title);
      expect(back.summary).toBe(title);
    }
  });

  it("leaves an ordinary title unquoted, so files stay readable", () => {
    const note = { ...parseNote(MINIMAL), title: "Camera control" };
    expect(serializeNote(note)).toContain("title: Camera control\n");
  });

  it("tolerates CRLF line endings", () => {
    const n = parseNote(FULL.replace(/\n/g, "\r\n"));
    expect(n.id).toBe("K-014");
    expect(n.body).not.toContain("\r");
  });

  it("rejects an unknown frontmatter key", () => {
    const raw = MINIMAL.replace("created:", "colour: red\ncreated:");
    expect(() => parseNote(raw)).toThrow(KnowledgeParseError);
    expect(() => parseNote(raw)).toThrow(/unknown frontmatter key "colour"/);
  });

  it("rejects a bad id", () => {
    expect(() => parseNote(MINIMAL.replace("K-001", "N-1"))).toThrow(/invalid note id/);
  });

  it("rejects a missing summary", () => {
    const raw = MINIMAL.replace("summary: Nothing special here.\n", "");
    expect(() => parseNote(raw)).toThrow(/summary is required/);
  });

  it("rejects a non-ISO date", () => {
    expect(() => parseNote(MINIMAL.replace("created: 2026-08-01", "created: last tuesday"))).toThrow(
      /created must be an ISO date/,
    );
  });

  it("rejects an invalid scope entry", () => {
    const raw = MINIMAL.replace("created:", "scope:\n  - Not A Slug\ncreated:");
    expect(() => parseNote(raw)).toThrow(/invalid scope entry/);
  });

  it("reports the file name in the error", () => {
    expect(() => parseNote(MINIMAL.replace("K-001", "nope"), "K-007-x.md")).toThrow(/K-007-x\.md/);
  });
});

describe("pure helpers", () => {
  it("derives file names from id and title", () => {
    expect(noteFileName("K-014", "Why I abandoned the grid!")).toBe(
      "K-014-why-i-abandoned-the-grid.md",
    );
  });

  it("falls back when a title has no usable characters", () => {
    expect(slugifyTitle("!!!")).toBe("note");
  });

  it("increments the highest id", () => {
    expect(nextNoteId([note({ id: "K-001" }), note({ id: "K-009" })])).toBe("K-010");
    expect(nextNoteId([])).toBe("K-001");
  });

  it("keeps ids monotonic past three digits", () => {
    expect(nextNoteId([note({ id: "K-999" })])).toBe("K-1000");
  });

  it("derives the journal scope, stripping area:", () => {
    expect(journalScopeOf(["acme-app"])).toBe("acme-app");
    expect(journalScopeOf(["area:research"])).toBe("research");
    expect(journalScopeOf([])).toBe("knowledge");
  });

  it("renders an index line with dashes for empties", () => {
    expect(indexLine(note())).toBe("- K-001 | - | - | A note | A summary.");
  });

  it("renders the index header and a placeholder when empty", () => {
    expect(serializeIndex([])).toContain("(no notes)");
    expect(serializeIndex([])).toContain("do not edit");
  });

  it("finds links and backlinks", () => {
    const a = note({ id: "K-001", body: "see [[K-002]] and [[K-002]] again" });
    const b = note({ id: "K-002", body: "no links" });
    const c = note({ id: "K-003", body: "also [[K-002]]" });
    expect(linksOf(a)).toEqual(["K-002"]);
    expect(backlinksOf([a, b, c], "K-002")).toEqual(["K-001", "K-003"]);
    expect(backlinksOf([a, b, c], "K-001")).toEqual([]);
  });

  it("does not count a note as its own backlink", () => {
    const self = note({ id: "K-005", body: "[[K-005]]" });
    expect(backlinksOf([self], "K-005")).toEqual([]);
  });

  it("weights title above body", () => {
    const titled = note({ title: "grid strategy", body: "unrelated" });
    const bodied = note({ title: "unrelated", body: "grid" });
    expect(scoreNote(titled, ["grid"])).toBeGreaterThan(scoreNote(bodied, ["grid"]));
  });

  it("caps repeated body hits", () => {
    const many = note({ title: "x", summary: "y", body: "grid ".repeat(50) });
    expect(scoreNote(many, ["grid"])).toBe(5);
  });

  it("scores zero with no terms", () => {
    expect(scoreNote(note(), [])).toBe(0);
  });

  it("filters by scope", () => {
    const a = note({ id: "K-001", scope: ["acme-app"] });
    const b = note({ id: "K-002", scope: ["area:research"] });
    expect(filterByScope([a, b], "acme-app").map((n) => n.id)).toEqual(["K-001"]);
    expect(filterByScope([a, b], "area:research").map((n) => n.id)).toEqual(["K-002"]);
  });
});

describe("the For the AI section", () => {
  const canonical = `Intro for people.\n\nMore.\n\n${AI_HEADING}\n\nTerse facts for the model.`;

  it("splits a canonical body and joins it back to the same bytes", () => {
    const parts = splitAiSection(canonical);
    expect(parts).toEqual({ human: "Intro for people.\n\nMore.", forAi: "Terse facts for the model." });
    expect(withAiSection(parts.human, parts.forAi)).toBe(canonical);
  });

  it("returns null when there is no section, and keeps the body as the human part", () => {
    expect(splitAiSection("Just a body.\n")).toEqual({ human: "Just a body.", forAi: null });
    expect(withAiSection("Just a body.", null)).toBe("Just a body.");
    expect(withAiSection("Just a body.", "")).toBe("Just a body.");
  });

  it("ignores a heading inside a fence", () => {
    const body = `Sample:\n\n\`\`\`md\n${AI_HEADING}\nnot a section\n\`\`\`\n\nEnd.`;
    expect(splitAiSection(body).forAi).toBeNull();
  });

  it("finds a section mid-body and moves it last only when joined", () => {
    const body = `Top.\n\n${AI_HEADING}\n\nFor the model.\n\n## Human again\n\nTail.`;
    const parts = splitAiSection(body);
    expect(parts.human).toBe("Top.\n\n## Human again\n\nTail.");
    expect(parts.forAi).toBe("For the model.");
    expect(withAiSection(parts.human, parts.forAi)).toBe(
      `Top.\n\n## Human again\n\nTail.\n\n${AI_HEADING}\n\nFor the model.`,
    );
  });

  it("emits the heading alone when the human part is empty", () => {
    expect(withAiSection("", "Only for the model.")).toBe(`${AI_HEADING}\n\nOnly for the model.`);
    expect(splitAiSection(`${AI_HEADING}\n\nOnly for the model.`)).toEqual({
      human: "",
      forAi: "Only for the model.",
    });
  });

  it("does not treat a ### heading as the end of the section", () => {
    const body = `${AI_HEADING}\n\nFacts.\n\n### Detail\n\nMore facts.`;
    expect(splitAiSection(body).forAi).toBe("Facts.\n\n### Detail\n\nMore facts.");
  });

  it("hashes the human part only, so editing the section alone does not flag it", () => {
    const a = humanHash(`Body.\n\n${AI_HEADING}\n\nOne.`);
    const b = humanHash(`Body.\n\n${AI_HEADING}\n\nTwo.`);
    const c = humanHash(`Body changed.\n\n${AI_HEADING}\n\nOne.`);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("parses and rejects ai_checked by shape", () => {
    const ok = parseNote(MINIMAL.replace("updated: 2026-08-01", 'updated: 2026-08-01\nai_checked: "0123456789abcdef"'));
    expect(ok.aiChecked).toBe("0123456789abcdef");
    expect(serializeNote(ok)).toContain('ai_checked: "0123456789abcdef"');
    // All digits, unquoted: YAML reads a number and the leading zero is gone.
    const digits = parseNote(MINIMAL.replace("updated: 2026-08-01", 'updated: 2026-08-01\nai_checked: "0000000000000001"'));
    expect(parseNote(serializeNote(digits)).aiChecked).toBe("0000000000000001");
    expect(() =>
      parseNote(MINIMAL.replace("updated: 2026-08-01", "updated: 2026-08-01\nai_checked: nope")),
    ).toThrow(/ai_checked/);
    expect(() =>
      parseNote(MINIMAL.replace("updated: 2026-08-01", "updated: 2026-08-01\nai_checked: 0000000000000001")),
    ).toThrow(/ai_checked/);
    expect(aiStatusOf({ body: "no section", aiChecked: "0123456789abcdef" })).toBe("none");
    expect(aiStatusOf({ body: `x\n\n${AI_HEADING}\n\ny` })).toBe("unchecked");
  });
});

describe("store", () => {
  let tmp: string;
  const prev = process.env.PLANNER_DATA_DIR;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "planner-knowledge-"));
    const git = simpleGit(tmp);
    await git.init();
    await git.addConfig("user.email", "test@example.com");
    await git.addConfig("user.name", "Test");
    process.env.PLANNER_DATA_DIR = tmp;
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.PLANNER_DATA_DIR;
    else process.env.PLANNER_DATA_DIR = prev;
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
  });

  it("returns an empty list when there is no knowledge directory", async () => {
    expect(await listNotes()).toEqual([]);
    expect(await searchNotes({ q: "anything" })).toEqual([]);
  });

  it("adds a note, writes the index, journals and commits", async () => {
    const added = await addNote({
      title: "Grid strategy postmortem",
      summary: "Fixed spacing cannot survive a breakout.",
      body: "Long form reasoning.",
      scope: ["acme-app", "area:research"],
      tags: ["strategy"],
      source: "journal 2026-08-21",
    });
    expect(added.id).toBe("K-001");
    expect(added.created).toBe(added.updated);

    const onDisk = await fs.readFile(
      path.join(tmp, "knowledge", "K-001-grid-strategy-postmortem.md"),
      "utf8",
    );
    expect(parseNote(onDisk)).toEqual(added);

    const index = await fs.readFile(path.join(tmp, "knowledge", "index.md"), "utf8");
    expect(index).toContain("- K-001 | acme-app,area:research | strategy | Grid strategy postmortem |");

    const journalFiles = await fs.readdir(path.join(tmp, "journal"));
    const journal = await fs.readFile(path.join(tmp, "journal", journalFiles[0]), "utf8");
    expect(journal).toContain("[acme-app] K-001 note added: Grid strategy postmortem");

    const log = await simpleGit(tmp).log();
    expect(log.latest?.message).toBe("note added: K-001 (Grid strategy postmortem)");
  });

  it("journals a scopeless note under knowledge", async () => {
    await addNote({ title: "Loose thought", summary: "No home yet." });
    const files = await fs.readdir(path.join(tmp, "journal"));
    const journal = await fs.readFile(path.join(tmp, "journal", files[0]), "utf8");
    expect(journal).toContain("[knowledge] K-001 note added");
  });

  it("assigns monotonic ids across adds", async () => {
    await addNote({ title: "One", summary: "First." });
    const second = await addNote({ title: "Two", summary: "Second." });
    expect(second.id).toBe("K-002");
    expect((await listNotes()).map((n) => n.id)).toEqual(["K-001", "K-002"]);
  });

  it("rejects an empty summary", async () => {
    await expect(addNote({ title: "T", summary: "  " })).rejects.toThrow(/non-empty summary/);
  });

  it("rejects a pipe-separated summary that would break the index", async () => {
    await expect(addNote({ title: "T", summary: "a | b" })).rejects.toThrow(/may not contain/);
  });

  it("rejects an invalid scope", async () => {
    await expect(
      addNote({ title: "T", summary: "S", scope: ["Not A Slug"] }),
    ).rejects.toThrow(/Invalid scope/);
  });

  it("keeps the file name stable when the title changes", async () => {
    const added = await addNote({ title: "Original title", summary: "S." });
    const updated = await updateNote(added.id, { title: "Renamed entirely" });
    expect(updated.title).toBe("Renamed entirely");
    const files = await fs.readdir(path.join(tmp, "knowledge"));
    expect(files).toContain("K-001-original-title.md");
    expect(files).not.toContain("K-001-renamed-entirely.md");
    expect((await readNote("K-001")).note.title).toBe("Renamed entirely");
  });

  it("updates only the fields passed and refreshes the index", async () => {
    const added = await addNote({
      title: "Keep me",
      summary: "Old summary.",
      body: "Old body.",
      tags: ["a"],
      source: "somewhere",
    });
    const updated = await updateNote(added.id, { summary: "New summary." });
    expect(updated.title).toBe("Keep me");
    expect(updated.body).toBe("Old body.");
    expect(updated.tags).toEqual(["a"]);
    expect(updated.source).toBe("somewhere");
    expect(updated.summary).toBe("New summary.");
    expect(updated.created).toBe(added.created);

    const index = await fs.readFile(path.join(tmp, "knowledge", "index.md"), "utf8");
    expect(index).toContain("New summary.");
    expect(index).not.toContain("Old summary.");
  });

  it("clears source when passed an empty string", async () => {
    const added = await addNote({ title: "T", summary: "S", source: "journal" });
    const updated = await updateNote(added.id, { source: "" });
    expect(updated.source).toBeUndefined();
  });

  it("refuses to update an unknown id", async () => {
    await expect(updateNote("K-404", { summary: "x" })).rejects.toThrow(/Note not found/);
  });

  it("writes forAi as a trailing section and leaves the human part byte-identical", async () => {
    const added = await addNote({ title: "T", summary: "S.", body: "Human text.\n\nSecond para." });
    const updated = await updateNote(added.id, { forAi: "Model text." });
    expect(updated.body).toBe(`Human text.\n\nSecond para.\n\n${AI_HEADING}\n\nModel text.`);
    const read = await readNote(added.id);
    expect(read.forAi).toBe("Model text.");
    expect(splitAiSection(read.note.body).human).toBe("Human text.\n\nSecond para.");

    const removed = await updateNote(added.id, { forAi: "" });
    expect(removed.body).toBe("Human text.\n\nSecond para.");
    expect((await readNote(added.id)).forAi).toBeNull();
  });

  it("treats body as the human part when forAi travels with it", async () => {
    const added = await addNote({ title: "T", summary: "S.", body: "Old.", forAi: "Old model." });
    expect(added.body).toBe(`Old.\n\n${AI_HEADING}\n\nOld model.`);
    const updated = await updateNote(added.id, {
      body: `New.\n\n${AI_HEADING}\n\nStale copy.`,
      forAi: "New model.",
    });
    expect(updated.body).toBe(`New.\n\n${AI_HEADING}\n\nNew model.`);
  });

  it("keeps the old contract: body alone replaces the whole body", async () => {
    const added = await addNote({ title: "T", summary: "S.", body: "Old.", forAi: "Model." });
    const updated = await updateNote(added.id, { body: "Replaced." });
    expect(updated.body).toBe("Replaced.");
  });

  it("tracks whether the AI section was confirmed against the body it sits under", async () => {
    const added = await addNote({ title: "T", summary: "S.", body: "One." });
    expect(aiStatusOf(added)).toBe("none");
    expect(added.aiChecked).toBeUndefined();

    const withAi = await updateNote(added.id, { forAi: "Model." });
    expect(withAi.aiChecked).toBe(humanHash(withAi.body));
    expect(aiStatusOf(withAi)).toBe("fresh");

    // The editor sends the body and the section together; an unchanged
    // section beside a changed body is exactly the case that must flag.
    const bodyMoved = await updateNote(added.id, { body: "Two.", forAi: "Model." });
    expect(bodyMoved.aiChecked).toBe(withAi.aiChecked);
    expect(aiStatusOf(bodyMoved)).toBe("unchecked");

    // The old contract: a whole body carrying its own section, sent alone.
    const wholeBody = await updateNote(added.id, { body: `Two b.\n\n${AI_HEADING}\n\nModel.` });
    expect(aiStatusOf(wholeBody)).toBe("unchecked");

    const confirmed = await updateNote(added.id, { confirmAi: true });
    expect(aiStatusOf(confirmed)).toBe("fresh");
    expect(confirmed.body).toBe(wholeBody.body);

    const both = await updateNote(added.id, { body: "Three.", forAi: "New model." });
    expect(aiStatusOf(both)).toBe("fresh");

    const removed = await updateNote(added.id, { forAi: "" });
    expect(removed.aiChecked).toBeUndefined();
    expect(aiStatusOf(removed)).toBe("none");

    const onDisk = await fs.readFile(path.join(tmp, "knowledge", "K-001-t.md"), "utf8");
    expect(onDisk).not.toContain("ai_checked");
    const again = await updateNote(added.id, { forAi: "Back." });
    const disk2 = await fs.readFile(path.join(tmp, "knowledge", "K-001-t.md"), "utf8");
    expect(disk2).toContain(`ai_checked: "${again.aiChecked}"`);
    expect(parseNote(disk2)).toEqual(again);
  });

  it("confirming a note with no section is a no-op", async () => {
    const added = await addNote({ title: "T", summary: "S.", body: "One." });
    const out = await updateNote(added.id, { confirmAi: true });
    expect(out.aiChecked).toBeUndefined();
  });

  it("returns links and backlinks from readNote", async () => {
    await addNote({ title: "Target", summary: "S." });
    await addNote({ title: "Pointer", summary: "S.", body: "see [[K-001]]" });
    const target = await readNote("K-001");
    expect(target.backlinks).toEqual(["K-002"]);
    expect(target.links).toEqual([]);
    const pointer = await readNote("K-002");
    expect(pointer.links).toEqual(["K-001"]);
  });

  it("ranks, filters by scope and snippets search results", async () => {
    await addNote({
      title: "Grid strategy postmortem",
      summary: "Spacing loses to breakouts.",
      body: "The grid died when the market trended for three weeks.",
      scope: ["acme-app"],
      tags: ["strategy"],
    });
    await addNote({
      title: "Unrelated cooking note",
      summary: "Lentils need less water than expected.",
      body: "Nothing about trading.",
      scope: ["area:daily"],
    });

    const hits = await searchNotes({ q: "grid" });
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("K-001");
    expect(hits[0].score).toBeGreaterThan(0);
    expect(hits[0].snippet.toLowerCase()).toContain("grid");

    expect(await searchNotes({ q: "grid", scope: "area:daily" })).toEqual([]);
    expect((await searchNotes({ q: "lentils" })).map((h) => h.id)).toEqual(["K-002"]);
    expect(await searchNotes({ q: "grid", tags: ["strategy"] })).toHaveLength(1);
    expect(await searchNotes({ q: "grid", tags: ["cooking"] })).toEqual([]);
  });

  it("respects the limit", async () => {
    for (const n of [1, 2, 3]) {
      await addNote({ title: `Note ${n}`, summary: "About widgets." });
    }
    expect(await searchNotes({ q: "widgets", limit: 2 })).toHaveLength(2);
  });

  it("lists everything when the query is empty", async () => {
    await addNote({ title: "One", summary: "S." });
    await addNote({ title: "Two", summary: "S." });
    const hits = await searchNotes({});
    expect(hits.map((h) => h.id)).toEqual(["K-001", "K-002"]);
    expect(hits[0].snippet).toBe("S.");
  });

  it("builds an empty knowledge section when there are no notes", async () => {
    expect(await knowledgeSection("acme-app")).toBe("");
  });

  it("builds a scoped knowledge section and hides other scopes", async () => {
    await addNote({ title: "Scoped note", summary: "In scope.", scope: ["acme-app"] });
    await addNote({ title: "Other note", summary: "Out of scope.", scope: ["area:daily"] });

    const scoped = await knowledgeSection("acme-app");
    expect(scoped).toContain("# Knowledge (scope acme-app)");
    expect(scoped).toContain("Scoped note");
    expect(scoped).not.toContain("Other note");
    expect(scoped).toContain("2 notes in the knowledge base");

    const unfocused = await knowledgeSection();
    expect(unfocused).toContain("# Knowledge (most recent)");
    expect(unfocused).toContain("Scoped note");
    expect(unfocused).toContain("Other note");

    const empty = await knowledgeSection("nothing-here");
    expect(empty).toContain("No notes scoped to nothing-here");
  });

  it("rebuilds a hand-corrupted index on the next write", async () => {
    await addNote({ title: "First", summary: "S." });
    const indexPath = path.join(tmp, "knowledge", "index.md");
    await fs.writeFile(indexPath, "garbage\n", "utf8");
    await addNote({ title: "Second", summary: "S." });
    const index = await fs.readFile(indexPath, "utf8");
    expect(index).not.toContain("garbage");
    expect(index).toContain("K-001");
    expect(index).toContain("K-002");
  });

  it("throws on a duplicate id across two files", async () => {
    await addNote({ title: "First", summary: "S." });
    const dir = path.join(tmp, "knowledge");
    const raw = await fs.readFile(path.join(dir, "K-001-first.md"), "utf8");
    await fs.writeFile(path.join(dir, "K-001-copy.md"), raw, "utf8");
    await expect(listNotes()).rejects.toThrow(/duplicate note id/);
  });

  it("ignores the index file when listing notes", async () => {
    await addNote({ title: "Only", summary: "S." });
    expect((await listNotes()).map((n) => n.id)).toEqual(["K-001"]);
  });
});
