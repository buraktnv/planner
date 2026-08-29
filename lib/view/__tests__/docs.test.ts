import { describe, expect, it } from "vitest";
import { buildDocs, docsNote, PREFERRED_TAGS, UNFILED } from "../docs";
import type { KnowledgeNote } from "@/lib/core/types";

function note(over: Partial<KnowledgeNote> = {}): KnowledgeNote {
  return {
    id: "K-001",
    title: "A note",
    summary: "A summary.",
    scope: ["gamma"],
    tags: [],
    created: "2026-08-01",
    updated: "2026-08-01",
    body: "",
    ...over,
  };
}

describe("buildDocs scope filtering", () => {
  it("keeps only notes scoped to this charter", () => {
    const model = buildDocs(
      [
        note({ id: "K-001", scope: ["gamma"] }),
        note({ id: "K-002", scope: ["delta"] }),
        note({ id: "K-003", scope: [] }),
      ],
      "gamma",
      "Gamma",
    );
    expect(model.total).toBe(1);
    expect(model.groups.flatMap((g) => g.rows.map((r) => r.id))).toEqual(["K-001"]);
  });

  it("matches an area scope by its prefixed key", () => {
    const notes = [
      note({ id: "K-001", scope: ["area:health"] }),
      note({ id: "K-002", scope: ["health"] }),
    ];
    expect(buildDocs(notes, "area:health", "Health").total).toBe(1);
    expect(buildDocs(notes, "health", "Health").total).toBe(1);
  });

  it("includes a note scoped to several charters", () => {
    const model = buildDocs([note({ scope: ["gamma", "delta"] })], "delta", "Delta");
    expect(model.total).toBe(1);
  });

  it("returns an empty model when nothing is scoped here", () => {
    const model = buildDocs([note({ scope: ["delta"] })], "gamma", "Gamma");
    expect(model.total).toBe(0);
    expect(model.groups).toEqual([]);
    expect(model.tags).toEqual([]);
  });
});

describe("buildDocs grouping", () => {
  it("files a doc under its first tag only, once", () => {
    const model = buildDocs(
      [note({ id: "K-001", tags: ["architecture", "protocol", "runbook"] })],
      "gamma",
      "Gamma",
    );
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].tag).toBe("architecture");
    const appearances = model.groups.flatMap((g) => g.rows.filter((r) => r.id === "K-001"));
    expect(appearances).toHaveLength(1);
  });

  it("orders preferred tags first, in their declared order", () => {
    const notes = PREFERRED_TAGS.map((tag, i) =>
      note({ id: `K-00${i + 1}`, tags: [tag] }),
    ).reverse();
    const model = buildDocs(notes, "gamma", "Gamma");
    expect(model.groups.map((g) => g.tag)).toEqual(PREFERRED_TAGS);
  });

  it("sorts unknown tags alphabetically after the preferred ones", () => {
    const model = buildDocs(
      [
        note({ id: "K-001", tags: ["zebra"] }),
        note({ id: "K-002", tags: ["apple"] }),
        note({ id: "K-003", tags: ["runbook"] }),
      ],
      "gamma",
      "Gamma",
    );
    expect(model.groups.map((g) => g.tag)).toEqual(["runbook", "apple", "zebra"]);
  });

  it("puts untagged docs in a trailing Unfiled group", () => {
    const model = buildDocs(
      [note({ id: "K-001", tags: [] }), note({ id: "K-002", tags: ["zebra"] })],
      "gamma",
      "Gamma",
    );
    expect(model.groups.map((g) => g.tag)).toEqual(["zebra", UNFILED]);
    expect(model.groups[1].label).toBe("Unfiled");
  });

  it("sorts rows inside a group newest updated first", () => {
    const model = buildDocs(
      [
        note({ id: "K-001", tags: ["runbook"], updated: "2026-08-01" }),
        note({ id: "K-002", tags: ["runbook"], updated: "2026-08-20" }),
        note({ id: "K-003", tags: ["runbook"], updated: "2026-08-10" }),
      ],
      "gamma",
      "Gamma",
    );
    expect(model.groups[0].rows.map((r) => r.id)).toEqual(["K-002", "K-003", "K-001"]);
  });
});

describe("buildDocs tag facets", () => {
  it("counts every tag, not just the grouping one", () => {
    const model = buildDocs(
      [
        note({ id: "K-001", tags: ["architecture", "protocol"] }),
        note({ id: "K-002", tags: ["protocol"] }),
      ],
      "gamma",
      "Gamma",
    );
    expect(model.tags).toEqual([
      { tag: "protocol", count: 2 },
      { tag: "architecture", count: 1 },
    ]);
  });
});

describe("docsNote", () => {
  it("teaches what docs are for when there are none", () => {
    const text = docsNote(buildDocs([], "gamma", "Gamma"));
    expect(text).toContain("Gamma");
    expect(text.toLowerCase()).toContain("already built");
  });

  it("summarises the count and singular groups", () => {
    const text = docsNote(buildDocs([note({ tags: ["runbook"] })], "gamma", "Gamma"));
    expect(text).toContain("1 doc ");
    expect(text).toContain("runbook");
  });

  it("counts groups when there is more than one", () => {
    const text = docsNote(
      buildDocs(
        [note({ id: "K-001", tags: ["runbook"] }), note({ id: "K-002", tags: ["protocol"] })],
        "gamma",
        "Gamma",
      ),
    );
    expect(text).toContain("2 docs across 2 groups");
  });
});
