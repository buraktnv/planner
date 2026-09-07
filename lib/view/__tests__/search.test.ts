import { describe, expect, it } from "vitest";
import type { SearchItem, SearchKind } from "@/lib/core/types";
import {
  KIND_ORDER,
  KIND_WEIGHT,
  hrefOf,
  rankSearch,
  scoreItem,
  searchTerms,
  snippetOf,
  termStrength,
} from "../search";

function item(patch: Partial<SearchItem> & { key: string }): SearchItem {
  return {
    kind: "note",
    title: "Untitled",
    subtitle: "",
    body: "",
    tags: [],
    updated: "2026-09-01",
    ...patch,
  };
}

describe("termStrength", () => {
  it("ranks exact above prefix above substring", () => {
    const tokens = ["knowledge"];
    expect(termStrength(tokens, "knowledge")).toBe(1);
    expect(termStrength(tokens, "know")).toBe(0.7);
    expect(termStrength(tokens, "wled")).toBe(0.35);
    expect(termStrength(tokens, "knowledge")).toBeGreaterThan(termStrength(tokens, "know"));
    expect(termStrength(tokens, "know")).toBeGreaterThan(termStrength(tokens, "wled"));
  });

  it("does not match a two-character substring", () => {
    expect(termStrength(["knowledge"], "wl")).toBe(0);
  });

  it("misses entirely when nothing contains the term", () => {
    expect(termStrength(["knowledge"], "calendar")).toBe(0);
  });
});

describe("scoreItem field weights", () => {
  const terms = ["lentil"];

  it("keeps title above tags above subtitle above body", () => {
    const inTitle = scoreItem(item({ key: "a", title: "lentil" }), terms, "");
    const inTags = scoreItem(item({ key: "b", tags: ["lentil"] }), terms, "");
    const inSubtitle = scoreItem(item({ key: "c", subtitle: "lentil" }), terms, "");
    const inBody = scoreItem(item({ key: "d", body: "lentil" }), terms, "");
    expect(inTitle).toBeGreaterThan(inTags);
    expect(inTags).toBeGreaterThan(inSubtitle);
    expect(inSubtitle).toBeGreaterThan(inBody);
    expect(inBody).toBeGreaterThan(0);
  });

  it("a prefix match on the title still scores", () => {
    const hits = rankSearch([item({ key: "note:K-001", title: "Knowledge base" })], "know");
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Knowledge base");
  });

  it("is AND across terms", () => {
    const both = item({ key: "a", title: "lentil soup", body: "red" });
    const one = item({ key: "b", title: "lentil soup" });
    const hits = rankSearch([both, one], "lentil red");
    expect(hits.map((h) => h.key)).toEqual(["a"]);
  });

  it("uses the phrase bonus, starts-with above contains", () => {
    const starts = item({ key: "a", title: "Red lentils, dried" });
    const contains = item({ key: "b", title: "Dried red lentils" });
    const hits = rankSearch([contains, starts], "red lentils");
    expect(hits.map((h) => h.key)).toEqual(["a", "b"]);
  });

  it("scores the phrase alone when every token is dropped", () => {
    expect(scoreItem(item({ key: "note:K-009", title: "Knowledge base" }), [], "k-009")).toBeGreaterThan(0);
  });
});

describe("rankSearch", () => {
  it("finds a note by its id although tokenize drops the one-character half", () => {
    expect(searchTerms("K-009")).toEqual(["009"]);
    const hits = rankSearch([item({ key: "note:K-009", title: "Knowledge base" })], "K-009");
    expect(hits.map((h) => h.key)).toEqual(["note:K-009"]);
  });

  it("finds a task by its id", () => {
    const task = item({
      key: "task:project/acme-bot/T-007",
      kind: "task",
      title: "Wire the retry",
      type: "project",
      slug: "acme-bot",
      taskId: "T-007",
    });
    const hits = rankSearch([task], "T-007");
    expect(hits.map((h) => h.key)).toEqual(["task:project/acme-bot/T-007"]);
  });

  it("returns nothing for an empty or whitespace query", () => {
    const items = [item({ key: "a", title: "anything" })];
    expect(rankSearch(items, "")).toEqual([]);
    expect(rankSearch(items, "   ")).toEqual([]);
  });

  it("respects the limit", () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      item({ key: `k${i}`, title: `lentil ${i}` }),
    );
    expect(rankSearch(items, "lentil", 3)).toHaveLength(3);
  });

  it("keeps an exact grocery below an exact note", () => {
    const note = item({ key: "note:K-001", kind: "note", title: "lentils" });
    const grocery = item({ key: "grocery:G-001", kind: "grocery", title: "lentils" });
    const hits = rankSearch([grocery, note], "lentils");
    expect(hits.map((h) => h.kind)).toEqual(["note", "grocery"]);
    expect(KIND_WEIGHT.grocery).toBeLessThan(KIND_WEIGHT.note);
  });

  it("breaks a tie by kind order, then recency, then key", () => {
    const older = item({ key: "note:K-002", kind: "note", title: "lentils", updated: "2026-01-01" });
    const newer = item({ key: "note:K-003", kind: "note", title: "lentils", updated: "2026-08-01" });
    const charter = item({
      key: "charter:project/acme-bot",
      kind: "charter",
      title: "lentils",
      updated: "2026-01-01",
      type: "project",
      slug: "acme-bot",
    });
    const hits = rankSearch([older, newer, charter], "lentils");
    // charter carries the higher kind weight, so it leads on score alone;
    // the two notes tie and split on `updated`.
    expect(hits.map((h) => h.key)).toEqual([
      "charter:project/acme-bot",
      "note:K-003",
      "note:K-002",
    ]);
    expect(rankSearch([newer, older, charter], "lentils").map((h) => h.key)).toEqual(
      hits.map((h) => h.key),
    );
  });

  it("never emits an empty title or href", () => {
    const items: SearchItem[] = KIND_ORDER.map((kind) =>
      item({
        key: `${kind}:x`,
        kind,
        title: `lentil ${kind}`,
        type: "project",
        slug: "acme-bot",
        taskId: "T-001",
        date: "2026-09-01",
      }),
    );
    for (const hit of rankSearch(items, "lentil", 100)) {
      expect(hit.title).not.toBe("");
      expect(hit.href).not.toBe("");
    }
  });
});

describe("snippetOf", () => {
  it("centres on the first matching term", () => {
    const body = `${"padding ".repeat(30)}needle ${"tail ".repeat(30)}`;
    const snippet = snippetOf(item({ key: "a", body }), ["needle"]);
    expect(snippet).toContain("needle");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("falls back to the subtitle when the match is in the title", () => {
    const it0 = item({ key: "a", title: "needle", subtitle: "acme-bot · T-007", body: "nothing here" });
    expect(snippetOf(it0, ["needle"])).toBe("acme-bot · T-007");
  });

  it("falls back to the subtitle when there is no body", () => {
    expect(snippetOf(item({ key: "a", subtitle: "Habit · goal 4" }), ["walk"])).toBe(
      "Habit · goal 4",
    );
  });
});

describe("hrefOf", () => {
  it("is exhaustive over every SearchKind", () => {
    const seen = new Set<SearchKind>();
    for (const kind of KIND_ORDER) {
      seen.add(kind);
      const href = hrefOf(
        item({
          key: `${kind}:K-009`,
          kind,
          type: "project",
          slug: "acme-bot",
          taskId: "T-007",
          date: "2026-09-01",
        }),
      );
      expect(href.startsWith("/")).toBe(true);
    }
    // Every kind in the union is covered by KIND_ORDER, so the loop above is
    // a real exhaustiveness check rather than a sample.
    const all: SearchKind[] = [
      "note",
      "charter",
      "task",
      "description",
      "log",
      "event",
      "habit",
      "rhythm",
      "meal",
      "grocery",
      "journal",
    ];
    for (const kind of all) expect(seen.has(kind)).toBe(true);
  });

  it("links a note unscoped, an event to the calendar, a journal line to its day", () => {
    expect(hrefOf(item({ key: "note:K-009", kind: "note" }))).toBe("/knowledge/K-009");
    expect(hrefOf(item({ key: "event:E-001", kind: "event", date: "2026-09-01" }))).toBe(
      "/calendar",
    );
    expect(
      hrefOf(item({ key: "journal:2026-09-01/0", kind: "journal", date: "2026-09-01" })),
    ).toBe("/settings/activity#j-2026-09-01");
  });

  it("gives an area task an /areas path and keeps a dotted subtask id", () => {
    const href = hrefOf(
      item({
        key: "task:area/acme-health/T-007.2",
        kind: "task",
        type: "area",
        slug: "acme-health",
        taskId: "T-007.2",
      }),
    );
    expect(href).toBe("/areas/acme-health/tasks/T-007.2");
  });

  it("gives a charter its own page", () => {
    expect(
      hrefOf(
        item({
          key: "charter:project/acme-bot",
          kind: "charter",
          type: "project",
          slug: "acme-bot",
        }),
      ),
    ).toBe("/projects/acme-bot");
  });
});

describe("the id bonus does not leak the key's namespace", () => {
  // A key is namespaced by kind (note:K-009, task:project/acme-bot/T-007).
  // Matching the phrase against the whole key made every one of these ordinary
  // words return the entire base ahead of what was being looked for -- and,
  // because the bonus also lifts an item past the multi-term AND filter, it
  // did so even when the rest of the query matched nothing.
  const base = [
    item({ key: "note:K-009", title: "Grid strategy", body: "planning" }),
    item({ key: "note:K-010", title: "Passport renewal", body: "admin" }),
    item({
      key: "task:project/acme-bot/T-007",
      kind: "task",
      taskId: "T-007",
      type: "project",
      slug: "acme-bot",
      title: "Wire the laptop",
    }),
    item({
      key: "log:project/acme-bot/T-007/2026-09-01 14:22",
      kind: "log",
      taskId: "T-007",
      type: "project",
      slug: "acme-bot",
      title: "Tried the other adapter",
    }),
  ];

  for (const word of ["note", "task", "log", "project"]) {
    it(`does not return everything for "${word}"`, () => {
      expect(rankSearch(base, word)).toEqual([]);
    });
  }

  it("still answers a full id instantly", () => {
    expect(rankSearch(base, "K-009").map((h) => h.key)).toEqual(["note:K-009"]);
    expect(rankSearch(base, "T-007").map((h) => h.key)).toContain(
      "task:project/acme-bot/T-007",
    );
  });

  it("does not let a partial id through as an id", () => {
    // "K-0" is a prefix of two ids and an answer to neither.
    expect(rankSearch(base, "K-0")).toEqual([]);
  });

  it("puts the record named by an id above the rows that merely mention it", () => {
    // Found by using it: searching K-046 returned the journal lines about
    // K-046 first, because their titles begin with the id while the note's own
    // title does not contain it. Naming a record exactly has to win.
    const named = item({ key: "note:K-046", title: "The core card is the charter" });
    const mention = item({
      key: "journal:2026-09-07/67",
      kind: "journal",
      title: "K-046 note added: The core card is the charter",
      subtitle: "2026-09-07 · planner",
    });
    expect(rankSearch([mention, named], "K-046")[0].key).toBe("note:K-046");
  });

  it("keeps the AND filter honest when an id is one of several terms", () => {
    // T-007 exists, "banana" does not: the id must not drag the row through.
    expect(rankSearch(base, "T-007 banana")).toEqual([]);
  });
});

