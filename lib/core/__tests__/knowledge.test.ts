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
  updateNote,
} from "../knowledge";
import type { KnowledgeNote } from "../types";

const FULL = `---
id: K-014
title: Why I abandoned the grid strategy
summary: Fixed spacing cannot survive a breakout.
scope:
  - ftbot
  - area:trading
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
    expect(n.scope).toEqual(["ftbot", "area:trading"]);
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
    expect(journalScopeOf(["ftbot"])).toBe("ftbot");
    expect(journalScopeOf(["area:trading"])).toBe("trading");
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
    const a = note({ id: "K-001", scope: ["ftbot"] });
    const b = note({ id: "K-002", scope: ["area:trading"] });
    expect(filterByScope([a, b], "ftbot").map((n) => n.id)).toEqual(["K-001"]);
    expect(filterByScope([a, b], "area:trading").map((n) => n.id)).toEqual(["K-002"]);
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
      scope: ["ftbot", "area:trading"],
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
    expect(index).toContain("- K-001 | ftbot,area:trading | strategy | Grid strategy postmortem |");

    const journalFiles = await fs.readdir(path.join(tmp, "journal"));
    const journal = await fs.readFile(path.join(tmp, "journal", journalFiles[0]), "utf8");
    expect(journal).toContain("[ftbot] K-001 note added: Grid strategy postmortem");

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
      scope: ["ftbot"],
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
    expect(await knowledgeSection("ftbot")).toBe("");
  });

  it("builds a scoped knowledge section and hides other scopes", async () => {
    await addNote({ title: "Scoped note", summary: "In scope.", scope: ["ftbot"] });
    await addNote({ title: "Other note", summary: "Out of scope.", scope: ["area:daily"] });

    const scoped = await knowledgeSection("ftbot");
    expect(scoped).toContain("# Knowledge (scope ftbot)");
    expect(scoped).toContain("Scoped note");
    expect(scoped).not.toContain("Other note");
    expect(scoped).toContain("2 notes in the knowledge base");

    const unfocused = await knowledgeSection();
    expect(unfocused).toContain("# Knowledge");
    expect(unfocused).not.toContain("Scoped note");

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
