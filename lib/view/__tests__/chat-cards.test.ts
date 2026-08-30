import { describe, expect, it } from "vitest";
import {
  readDaily,
  readNextActions,
  readNotes,
  readOneNote,
  readTargets,
  readTaskReceipt,
} from "../chat-cards";

/**
 * Each reader is run twice where it matters: once with an object, as the AI SDK
 * path delivers, and once with the JSON string the claude-subscription path
 * delivers after crossing the MCP boundary.
 */
const asString = (value: unknown) => JSON.stringify(value);

const NEXT = [
  {
    task: { id: "T-041", title: "Ship the exporter", lane: "deep", due: "2026-09-04" },
    charter: { id: "acme-app", name: "Acme App", type: "project" },
    blocked: false,
  },
  {
    task: { id: "H-1", title: "Book the clinic" },
    charter: { id: "admin", name: "Admin", type: "area" },
    blocked: true,
  },
];

describe("readNextActions", () => {
  it("reads the ranked list from either provider path", () => {
    for (const output of [NEXT, asString(NEXT)]) {
      const list = readNextActions(output);
      expect(list).toHaveLength(2);
      expect(list?.[0]).toEqual({
        id: "T-041",
        title: "Ship the exporter",
        charter: "Acme App",
        scope: "acme-app",
        lane: "deep",
        blocked: false,
        due: "2026-09-04",
      });
    }
  });

  it("builds an area scope in the form task links take", () => {
    expect(readNextActions(NEXT)?.[1].scope).toBe("area:admin");
  });

  it("drops rows with no id or title rather than rendering blanks", () => {
    const list = readNextActions([{ task: {}, charter: {} }, ...NEXT]);
    expect(list).toHaveLength(2);
  });

  it("ignores a lane that is not a board column", () => {
    const list = readNextActions([{ task: { id: "T-1", title: "x", lane: "urgent" } }]);
    expect(list?.[0].lane).toBeNull();
  });

  it("returns null for output that is not a list, rather than throwing", () => {
    expect(readNextActions({ nope: true })).toBeNull();
    expect(readNextActions("not json")).toBeNull();
    expect(readNextActions(null)).toBeNull();
  });
});

const DAILY = {
  habits: [{ id: "H-001", name: "Walk", goal: 4, unit: "× 15 min" }],
  rhythms: [{ id: "R-001", name: "Laundry", per: 3 }],
  meals: [{ id: "M-001", name: "Lentil soup", servings: 2 }],
  groceries: [
    { id: "G-001", name: "Red lentils", got: false },
    { id: "G-002", name: "Olive oil", got: true },
  ],
  log: [],
};

describe("readDaily", () => {
  it("reads habits, rhythms and meals from either path", () => {
    for (const output of [DAILY, asString(DAILY)]) {
      const data = readDaily(output);
      expect(data?.habits[0]).toEqual({ id: "H-001", name: "Walk", goal: 4, unit: "× 15 min" });
      expect(data?.rhythms[0]).toEqual({ id: "R-001", name: "Laundry", goal: 3, unit: null });
      expect(data?.meals[0]).toEqual({ id: "M-001", name: "Lentil soup", servings: 2 });
    }
  });

  it("counts only groceries still on the list", () => {
    expect(readDaily(DAILY)?.groceriesOpen).toBe(1);
  });

  it("copes with an empty day", () => {
    const data = readDaily({ habits: [], rhythms: [], meals: [], groceries: [], log: [] });
    expect(data).toEqual({ habits: [], rhythms: [], meals: [], groceriesOpen: 0 });
  });

  it("returns null when the shape is not a daily payload", () => {
    expect(readDaily([1, 2, 3])).toBeNull();
    expect(readDaily({ something: "else" })).toBeNull();
    expect(readDaily(null)).toBeNull();
  });
});

const TARGETS = [
  {
    charter: "Acme App",
    id: "G-001",
    title: "Ship the MVP",
    milestone: "M1",
    by: "30 SEP",
    done: false,
    pct: 62,
    linkedTasks: 8,
  },
];

describe("readTargets", () => {
  it("reads targets and their progress from either path", () => {
    for (const output of [TARGETS, asString(TARGETS)]) {
      expect(readTargets(output)?.[0]).toMatchObject({ id: "G-001", pct: 62, linkedTasks: 8 });
    }
  });

  it("keeps a target with no id, which simply cannot be linked", () => {
    const list = readTargets([{ ...TARGETS[0], id: null }]);
    expect(list?.[0].id).toBeNull();
    expect(list?.[0].title).toBe("Ship the MVP");
  });

  it("clamps a percentage that is out of range", () => {
    expect(readTargets([{ ...TARGETS[0], pct: 140 }])?.[0].pct).toBe(100);
    expect(readTargets([{ ...TARGETS[0], pct: -5 }])?.[0].pct).toBe(0);
    expect(readTargets([{ ...TARGETS[0], pct: "lots" }])?.[0].pct).toBe(0);
  });

  it("returns null for a non-list", () => {
    expect(readTargets({})).toBeNull();
  });
});

const HITS = [
  {
    id: "K-009",
    title: "Uploads are content-addressed",
    summary: "Re-uploading the same file is free.",
    scope: ["acme-app"],
    tags: ["architecture", "decision"],
    updated: "2026-08-01",
    score: 12,
    snippet: "…",
  },
];

describe("readNotes and readOneNote", () => {
  it("reads search hits from either path", () => {
    for (const output of [HITS, asString(HITS)]) {
      expect(readNotes(output)?.[0]).toEqual({
        id: "K-009",
        title: "Uploads are content-addressed",
        summary: "Re-uploading the same file is free.",
        scope: ["acme-app"],
        tags: ["architecture", "decision"],
      });
    }
  });

  /** read_note answers with { note, links, backlinks }, not a bare note. */
  it("unwraps the note read_note nests", () => {
    const output = { note: HITS[0], links: [], backlinks: [] };
    expect(readOneNote(output)?.id).toBe("K-009");
    expect(readOneNote(asString(output))?.id).toBe("K-009");
  });

  it("also accepts a bare note, in case the shape ever flattens", () => {
    expect(readOneNote(HITS[0])?.id).toBe("K-009");
  });

  it("drops non-string entries out of scope and tags", () => {
    const note = readNotes([{ ...HITS[0], scope: ["ok", 3, null], tags: "not a list" }]);
    expect(note?.[0].scope).toEqual(["ok"]);
    expect(note?.[0].tags).toEqual([]);
  });

  it("returns null rather than throwing on junk", () => {
    expect(readNotes({})).toBeNull();
    expect(readOneNote([])).toBeNull();
    expect(readOneNote(null)).toBeNull();
  });
});

describe("readTaskReceipt", () => {
  it("reads what a direct write actually did", () => {
    const output = { id: "T-052", title: "Ship the exporter", size: "M" };
    expect(readTaskReceipt(output, { project: "acme-app" })).toEqual({
      id: "T-052",
      title: "Ship the exporter",
      scope: "acme-app",
    });
  });

  it("takes the scope from the call's own input, which is where it lives", () => {
    expect(readTaskReceipt({ id: "T-1", title: "x" }, undefined)?.scope).toBeNull();
  });

  it("falls back to the id when there is no title", () => {
    expect(readTaskReceipt({ id: "T-1" })?.title).toBe("T-1");
  });

  it("returns null when nothing was written", () => {
    expect(readTaskReceipt({ ok: true })).toBeNull();
    expect(readTaskReceipt(null)).toBeNull();
  });
});
