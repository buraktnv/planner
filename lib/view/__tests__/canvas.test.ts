import { describe, expect, it } from "vitest";
import type { KnowledgeNote } from "@/lib/core/types";
import type { CanvasFile } from "@/lib/core/canvas";
import { buildNoteCanvas, canvasNote } from "../canvas";

function note(partial: Partial<KnowledgeNote> & { id: string }): KnowledgeNote {
  return {
    title: `Note ${partial.id}`,
    summary: `Summary of ${partial.id}`,
    scope: [],
    tags: [],
    created: "2026-08-01",
    updated: "2026-08-01",
    body: "",
    ...partial,
  };
}

const empty: CanvasFile = { nodes: [], edges: [], unknown: [] };
const file = (partial: Partial<CanvasFile>): CanvasFile => ({ ...empty, ...partial });

describe("buildNoteCanvas", () => {
  it("makes one card per note, with the summary as the card preview", () => {
    const model = buildNoteCanvas([note({ id: "K-001" }), note({ id: "K-002" })], empty);
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes[0].preview).toBe("Summary of K-001");
    expect(model.nodes[0].href).toBe("/knowledge/K-001");
  });

  it("carries the body through for the popup, since listNotes already loaded it", () => {
    const model = buildNoteCanvas([note({ id: "K-001", body: "the long text" })], empty);
    expect(model.nodes[0].body).toBe("the long text");
  });

  it("groups by the note's first scope and names it from the charter list", () => {
    const model = buildNoteCanvas(
      [note({ id: "K-001", scope: ["planner"] }), note({ id: "K-002", scope: ["area:health"] })],
      empty,
      { charterNames: { planner: "Planner", "area:health": "Health" } },
    );
    expect(model.nodes[0].groupLabel).toBe("Planner");
    expect(model.nodes[1].groupLabel).toBe("Health");
    expect(model.groups.map((g) => g.label).sort()).toEqual(["Health", "Planner"]);
  });

  it("labels a scopeless note Unfiled rather than leaving it blank", () => {
    const model = buildNoteCanvas([note({ id: "K-001" })], empty);
    expect(model.nodes[0].groupLabel).toBe("Unfiled");
    expect(model.nodes[0].groupKey).toBeNull();
  });

  it("filters to one charter when given a scope", () => {
    const notes = [
      note({ id: "K-001", scope: ["planner"] }),
      note({ id: "K-002", scope: ["responsive-bot"] }),
    ];
    const model = buildNoteCanvas(notes, empty, { scopeKey: "responsive-bot" });
    expect(model.nodes.map((n) => n.id)).toEqual(["K-002"]);
  });

  it("prefers a saved position and marks the rest as auto-placed", () => {
    const model = buildNoteCanvas(
      [note({ id: "K-001" }), note({ id: "K-002" })],
      file({ nodes: [{ ref: "K-001", x: 900, y: 800, extra: [] }] }),
    );
    const byId = Object.fromEntries(model.nodes.map((n) => [n.id, n]));
    expect(byId["K-001"]).toMatchObject({ x: 900, y: 800, placed: "saved" });
    expect(byId["K-002"].placed).toBe("auto");
  });

  it("honours a stored size and pin", () => {
    const model = buildNoteCanvas(
      [note({ id: "K-001" })],
      file({ nodes: [{ ref: "K-001", x: 0, y: 0, w: 400, h: 300, pin: true, extra: [] }] }),
    );
    expect(model.nodes[0]).toMatchObject({ w: 400, h: 300, pin: true });
  });
});

describe("edges", () => {
  it("draws an arrow for a [[K-nnn]] link in the note text", () => {
    const notes = [note({ id: "K-001", body: "see [[K-002]]" }), note({ id: "K-002" })];
    const model = buildNoteCanvas(notes, empty);
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({ from: "K-001", to: "K-002", source: "derived" });
  });

  it("ignores a link to a note that does not exist", () => {
    const model = buildNoteCanvas([note({ id: "K-001", body: "see [[K-404]]" })], empty);
    expect(model.edges).toEqual([]);
  });

  it("ignores a link inside code, because a plan quotes ids as samples", () => {
    const notes = [
      note({ id: "K-001", body: "```\n[[K-002]]\n```" }),
      note({ id: "K-002" }),
    ];
    expect(buildNoteCanvas(notes, empty).edges).toEqual([]);
  });

  it("keeps hand-drawn requires and triggers edges", () => {
    const notes = [note({ id: "K-001" }), note({ id: "K-002" })];
    const model = buildNoteCanvas(
      notes,
      file({
        edges: [
          { from: "K-001", to: "K-002", kind: "requires", extra: [] },
          { from: "K-002", to: "K-001", kind: "triggers", extra: [] },
        ],
      }),
    );
    expect(model.edges.map((e) => e.kind).sort()).toEqual(["requires", "triggers"]);
    expect(model.edges.every((e) => e.source === "canvas")).toBe(true);
  });

  it("drops a drawn rel edge that duplicates one already in the text", () => {
    const notes = [note({ id: "K-001", body: "see [[K-002]]" }), note({ id: "K-002" })];
    const model = buildNoteCanvas(
      notes,
      file({ edges: [{ from: "K-001", to: "K-002", kind: "rel", extra: [] }] }),
    );
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0].source).toBe("derived");
  });

  it("keeps a requires edge even when the same pair is linked in the text", () => {
    const notes = [note({ id: "K-001", body: "see [[K-002]]" }), note({ id: "K-002" })];
    const model = buildNoteCanvas(
      notes,
      file({ edges: [{ from: "K-001", to: "K-002", kind: "requires", extra: [] }] }),
    );
    expect(model.edges.map((e) => e.kind).sort()).toEqual(["rel", "requires"]);
  });

  it("drops an edge whose endpoint is not on this canvas", () => {
    const model = buildNoteCanvas(
      [note({ id: "K-001" })],
      file({ edges: [{ from: "K-001", to: "K-999", kind: "requires", extra: [] }] }),
    );
    expect(model.edges).toEqual([]);
  });

  it("gives every edge a path that starts away from the card centre", () => {
    const notes = [note({ id: "K-001", body: "[[K-002]]" }), note({ id: "K-002" })];
    const model = buildNoteCanvas(notes, empty);
    expect(model.edges[0].d.startsWith("M")).toBe(true);
    expect(model.edges[0].head.endsWith("Z")).toBe(true);
  });
});

describe("orphans", () => {
  it("reports a stored ref whose note is gone, without removing it", () => {
    const model = buildNoteCanvas(
      [note({ id: "K-001" })],
      file({
        nodes: [
          { ref: "K-001", x: 0, y: 0, extra: [] },
          { ref: "K-404", x: 0, y: 0, extra: [] },
        ],
      }),
    );
    expect(model.orphans).toEqual(["K-404"]);
    expect(model.nodes.map((n) => n.id)).toEqual(["K-001"]);
  });

  it("reports an edge endpoint that no longer exists", () => {
    const model = buildNoteCanvas(
      [note({ id: "K-001" })],
      file({ edges: [{ from: "K-001", to: "K-999", kind: "rel", extra: [] }] }),
    );
    expect(model.orphans).toEqual(["K-999"]);
  });

  it("does not count a group box as an orphan", () => {
    const model = buildNoteCanvas(
      [note({ id: "K-001" })],
      file({ nodes: [{ ref: "group:m1", x: 0, y: 0, extra: [] }] }),
    );
    expect(model.orphans).toEqual([]);
  });
});

describe("determinism and empty input", () => {
  it("gives byte-identical models for the same input", () => {
    const notes = [note({ id: "K-002", scope: ["b"] }), note({ id: "K-001", scope: ["a"] })];
    expect(JSON.stringify(buildNoteCanvas(notes, empty))).toBe(
      JSON.stringify(buildNoteCanvas(notes, empty)),
    );
  });

  it("does not depend on the order notes arrive in", () => {
    const a = note({ id: "K-001", scope: ["a"] });
    const b = note({ id: "K-002", scope: ["a"] });
    expect(JSON.stringify(buildNoteCanvas([a, b], empty))).toBe(
      JSON.stringify(buildNoteCanvas([b, a], empty)),
    );
  });

  it("survives no notes at all", () => {
    const model = buildNoteCanvas([], empty);
    expect(model.nodes).toEqual([]);
    expect(model.bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    expect(canvasNote(model)).toContain("Nothing to map yet");
  });
});

describe("canvasNote", () => {
  it("counts the notes and where the arrows came from", () => {
    const notes = [note({ id: "K-001", body: "[[K-002]]" }), note({ id: "K-002" })];
    const model = buildNoteCanvas(
      notes,
      file({ edges: [{ from: "K-002", to: "K-001", kind: "requires", extra: [] }] }),
    );
    const text = canvasNote(model);
    expect(text).toContain("2 notes");
    expect(text).toContain("1 from the text");
    expect(text).toContain("1 drawn here");
  });

  it("mentions stale references when there are some", () => {
    const model = buildNoteCanvas(
      [note({ id: "K-001" })],
      file({ nodes: [{ ref: "K-404", x: 0, y: 0, extra: [] }] }),
    );
    expect(canvasNote(model)).toContain("1 stale reference");
  });
});
