import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { addNote, byRecency, knowledgeSection, listNotes, nearDuplicateOf, similarity } from "../knowledge";
import type { KnowledgeNote } from "../types";

let tmp: string;
const prev = process.env.PLANNER_DATA_DIR;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "planner-conc-"));
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

function note(over: Partial<KnowledgeNote> = {}): KnowledgeNote {
  return {
    id: "K-001",
    title: "T",
    summary: "S",
    scope: [],
    tags: [],
    created: "2026-08-01",
    updated: "2026-08-01",
    body: "",
    ...over,
  };
}

describe("concurrent writes", () => {
  it("gives every simultaneous add a distinct id and leaves the base readable", async () => {
    await Promise.all([
      addNote({ summary: "First fact about the alpha subject." }),
      addNote({ summary: "Second fact about the beta subject." }),
      addNote({ summary: "Third fact about the gamma subject." }),
    ]);

    const notes = await listNotes();
    expect(notes).toHaveLength(3);
    expect(new Set(notes.map((n) => n.id)).size).toBe(3);

    const files = (await fs.readdir(path.join(tmp, "knowledge"))).filter((f) => f !== "index.md");
    expect(files).toHaveLength(3);
  });

  it("keeps the generated index in step with the notes", async () => {
    await Promise.all([
      addNote({ summary: "One distinct thing worth remembering." }),
      addNote({ summary: "Another entirely separate matter." }),
    ]);
    const index = await fs.readFile(path.join(tmp, "knowledge", "index.md"), "utf8");
    for (const n of await listNotes()) {
      expect(index).toContain(n.id);
    }
  });
});

describe("similarity and dedupe", () => {
  it("scores a rephrasing high and unrelated text low", () => {
    const a = { title: "Grid dies in trends", summary: "Fixed spacing cannot survive a breakout." };
    const b = { title: "Grid dies in trends", summary: "Fixed spacing cannot survive a breakout" };
    const c = { title: "Lentil ratios", summary: "Lentils need less water than the bag says." };
    expect(similarity(a, b)).toBeGreaterThan(0.8);
    expect(similarity(a, c)).toBeLessThan(0.2);
  });

  it("is zero when either side has no usable tokens", () => {
    expect(similarity({ title: "", summary: "" }, { title: "a", summary: "b" })).toBe(0);
  });

  it("finds a near duplicate above the threshold and ignores unrelated notes", () => {
    const existing = [
      note({ id: "K-001", title: "Cholesterol is high", summary: "Latest bloodwork came back high." }),
      note({ id: "K-002", title: "Lentil ratios", summary: "Lentils need less water." }),
    ];
    const hit = nearDuplicateOf(existing, {
      title: "Cholesterol is high",
      summary: "Latest bloodwork came back high.",
    });
    expect(hit?.id).toBe("K-001");
    expect(
      nearDuplicateOf(existing, { title: "Passport renewal", summary: "Appointment is booked." }),
    ).toBeNull();
  });
});

describe("byRecency", () => {
  it("orders newest first and breaks ties on id descending", () => {
    const rows = byRecency([
      note({ id: "K-001", updated: "2026-08-01" }),
      note({ id: "K-002", updated: "2026-08-09" }),
      note({ id: "K-003", updated: "2026-08-09" }),
    ]);
    expect(rows.map((n) => n.id)).toEqual(["K-003", "K-002", "K-001"]);
  });
});

describe("knowledgeSection recall", () => {
  it("caps a large scope newest-first rather than oldest-first", async () => {
    for (let i = 0; i < 42; i++) {
      await addNote({ summary: `Distinct fact number ${i} about widgets.`, scope: ["acme-app"] });
    }
    const section = await knowledgeSection("acme-app");
    expect(section).toContain("K-042");
    expect(section).not.toContain("K-001 ");
    expect(section).toContain("2 more in this scope");
  });

  it("surfaces notes that bear on the message even with no focus", async () => {
    await addNote({ summary: "Cholesterol came back high at the last blood test." });
    await addNote({ summary: "Lentils need less water than the bag says." });

    const section = await knowledgeSection(undefined, "what should I do about my cholesterol");
    expect(section).toContain("# Knowledge that may bear on this message");
    expect(section).toContain("Cholesterol");
    expect(section).not.toContain("Lentils");
  });

  it("does not repeat a note already listed under the focused scope", async () => {
    await addNote({ summary: "The retry loop needs a backoff.", scope: ["acme-app"] });
    const section = await knowledgeSection("acme-app", "retry loop backoff");
    expect(section).toContain("# Knowledge (scope acme-app)");
    expect(section).not.toContain("# Knowledge that may bear on this message");
  });

  it("falls back to the most recent notes when nothing matches", async () => {
    await addNote({ summary: "Something entirely unrelated to the query." });
    const section = await knowledgeSection(undefined, "zzzz nonexistent terminology");
    expect(section).toContain("# Knowledge (most recent)");
  });
});
