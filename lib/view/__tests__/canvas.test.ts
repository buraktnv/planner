import { describe, expect, it } from "vitest";
import type { KnowledgeNote } from "@/lib/core/types";
import type { CanvasFile } from "@/lib/core/canvas";
import type { CardModel, SubModel } from "../workspace";
import { buildNoteCanvas, buildTaskCanvas, canvasNote, noteProgress,
  CORE_H,
  CORE_REF,
  CORE_W,
  buildCoreNode,
  coreMarkdown,
} from "../canvas";

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

describe("buildTaskCanvas", () => {
  const sub = (id: string, extra: Partial<SubModel> = {}): SubModel => ({
    id,
    title: `Sub ${id}`,
    done: false,
    size: "S",
    section: "backlog",
    hasDetail: false,
    subs: [],
    ...extra,
  });

  const card = (id: string, extra: Partial<CardModel> = {}): CardModel => ({
    key: `project/bot/${id}`,
    type: "project",
    slug: "bot",
    charterName: "Bot",
    color: "#1",
    tint: "#2",
    id,
    title: `Task ${id}`,
    size: "M",
    lane: "deep",
    section: "backlog",
    done: false,
    blocked: false,
    hasDetail: false,
    overdue: false,
    pct: 0,
    subDone: 0,
    subTotal: 0,
    subs: [],
    priority: "P1",
    ...extra,
  });

  const charter = (cards: CardModel[], mvpScope: string[] = []) => ({
    id: "bot",
    name: "Bot",
    type: "project" as const,
    color: "#1",
    tint: "#2",
    mvpScope,
    cards,
  });

  it("flattens branches and every subtask beneath them", () => {
    const model = buildTaskCanvas(
      charter([card("T-001", { subs: [sub("T-001.1", { subs: [sub("T-001.1.1")] })] })]),
      empty,
    );
    expect(model.nodes.map((n) => n.id)).toEqual(["T-001", "T-001.1", "T-001.1.1"]);
  });

  it("links each subtask to its parent", () => {
    const model = buildTaskCanvas(charter([card("T-001", { subs: [sub("T-001.1")] })]), empty);
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0]).toMatchObject({ from: "T-001", to: "T-001.1", source: "derived" });
  });

  it("draws a waits: dependency between two cards", () => {
    const model = buildTaskCanvas(
      charter([card("T-001"), card("T-002", { waitsOn: "T-001" })]),
      empty,
    );
    const dep = model.edges.find((e) => e.kind === "requires");
    expect(dep).toMatchObject({ from: "T-001", to: "T-002", label: "waits on" });
  });

  it("draws no arrow for free-text waits, which is not a card", () => {
    const model = buildTaskCanvas(charter([card("T-001", { waitsOn: "the clinic" })]), empty);
    expect(model.edges).toEqual([]);
  });

  it("groups by the milestone the task's target belongs to", () => {
    const scope = ["### M1 — Prove it", "- [ ] G-001 | First"];
    const model = buildTaskCanvas(charter([card("T-001", { target: "G-001" })], scope), empty);
    expect(model.nodes[0].groupKey).toBe("M1 — Prove it");
  });

  it("falls back to the task's section when it has no target", () => {
    const model = buildTaskCanvas(
      charter([
        card("T-001"),
        card("T-002", { section: "in-progress" }),
        card("T-003", { done: true, section: "done" }),
      ]),
      empty,
    );
    expect(model.nodes.map((n) => n.groupKey)).toEqual(["Backlog", "In progress", "Done"]);
  });

  it("links a card to its own task page", () => {
    const model = buildTaskCanvas(charter([card("T-001", { subs: [sub("T-001.1")] })]), empty);
    expect(model.nodes[0].href).toBe("/projects/bot/tasks/T-001");
    expect(model.nodes[1].href).toBe("/projects/bot/tasks/T-001.1");
  });

  it("carries no body, because task detail is a file per task", () => {
    expect(buildTaskCanvas(charter([card("T-001")]), empty).nodes[0].body).toBeNull();
  });

  it("honours a saved position", () => {
    const model = buildTaskCanvas(
      charter([card("T-001")]),
      file({ nodes: [{ ref: "T-001", x: 700, y: 500, extra: [] }] }),
    );
    expect(model.nodes[0]).toMatchObject({ x: 700, y: 500, placed: "saved" });
  });

  it("reports a stored task that no longer exists", () => {
    const model = buildTaskCanvas(
      charter([card("T-001")]),
      file({ nodes: [{ ref: "T-404", x: 0, y: 0, extra: [] }] }),
    );
    expect(model.orphans).toEqual(["T-404"]);
  });

  it("survives a charter with no tasks", () => {
    const model = buildTaskCanvas(charter([]), empty);
    expect(model.nodes).toEqual([]);
    expect(model.bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("noteProgress", () => {
  const tasks = [
    { note: "K-020", done: true },
    { note: "K-020", done: false },
    { note: "K-020", done: false },
    { note: "K-021", done: true },
    { done: false },
  ];

  it("counts the tasks that name the component", () => {
    expect(noteProgress("K-020", tasks)).toEqual({ done: 1, total: 3, pct: 33, linked: true });
  });

  it("reports nothing linked rather than a misleading zero", () => {
    expect(noteProgress("K-099", tasks)).toEqual({ done: 0, total: 0, pct: 0, linked: false });
  });

  it("reaches 100 percent without closing the component", () => {
    expect(noteProgress("K-021", tasks)).toMatchObject({ pct: 100, linked: true });
  });
});

describe("delegation progress on cards", () => {
  it("is null unless tasks are supplied, so the knowledge canvas stays clean", () => {
    expect(buildNoteCanvas([note({ id: "K-001" })], empty).nodes[0].progress).toBeNull();
  });

  it("shows the work delegated from a component", () => {
    const model = buildNoteCanvas([note({ id: "K-001" })], empty, {
      tasks: [
        { note: "K-001", done: true },
        { note: "K-001", done: false },
      ],
    });
    expect(model.nodes[0].progress).toEqual({ done: 1, total: 2, pct: 50, linked: true });
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

describe("coreMarkdown", () => {
  it("leads with the motivation", () => {
    expect(coreMarkdown("Because the BT needs eyes.", [])).toBe("Because the BT needs eyes.");
  });

  it("re-emits targets as a task list, not their stored pipe form", () => {
    const out = coreMarkdown("Why.", [
      "### M1 — first light",
      "- [ ] G-001 | Camera control — by 30 SEP",
      "- [x] G-002 | YOLO nano",
    ]);
    expect(out).toContain("### M1 — first light");
    expect(out).toContain("- [ ] Camera control — by 30 SEP");
    expect(out).toContain("- [x] YOLO nano");
    expect(out).not.toContain("|");
    expect(out).not.toContain("G-001");
  });

  it("omits the scope heading when there are no targets", () => {
    expect(coreMarkdown("Why.", [])).not.toContain("What done looks like");
  });

  it("survives an empty charter without throwing", () => {
    expect(coreMarkdown("", [])).toBe("");
  });
});

describe("buildCoreNode", () => {
  const core = {
    title: "Responsive-Bot",
    why: "The bot has to see.\nSecond line.",
    mvpScope: [],
    href: "/projects/responsive-bot",
    color: "#123456",
    tint: "#abcdef",
  };

  it("uses a group: ref, so it is never pruned and never an orphan", () => {
    expect(CORE_REF.startsWith("group:")).toBe(true);
    expect(buildCoreNode(core, { nodes: [], edges: [], unknown: [] }).id).toBe(CORE_REF);
  });

  it("centres itself on the origin when nothing is stored", () => {
    const n = buildCoreNode(core, { nodes: [], edges: [], unknown: [] });
    expect(n).toMatchObject({ x: -CORE_W / 2, y: -CORE_H / 2, w: CORE_W, h: CORE_H });
    expect(n.placed).toBe("auto");
  });

  it("prefers a stored position and size", () => {
    const n = buildCoreNode(core, {
      nodes: [{ ref: CORE_REF, x: 40, y: 50, w: 600, h: 400, extra: [] }],
      edges: [],
      unknown: [],
    });
    expect(n).toMatchObject({ x: 40, y: 50, w: 600, h: 400, placed: "saved" });
  });

  it("previews the first real line of the why", () => {
    expect(buildCoreNode(core, { nodes: [], edges: [], unknown: [] }).preview).toBe(
      "The bot has to see.",
    );
  });
});

describe("buildNoteCanvas with a core", () => {
  const core = {
    title: "Responsive-Bot",
    why: "Why it exists.",
    mvpScope: [],
    href: "/projects/responsive-bot",
    color: "#123456",
    tint: "#abcdef",
  };
  const empty = { nodes: [], edges: [], unknown: [] };

  function n(id: string, over: Partial<KnowledgeNote> = {}): KnowledgeNote {
    return {
      id,
      title: id,
      summary: "s",
      scope: ["responsive-bot"],
      tags: [],
      created: "2026-01-01",
      updated: "2026-01-01",
      body: "",
      ...over,
    };
  }

  it("puts the core first, so it is the card everything reads from", () => {
    const m = buildNoteCanvas([n("K-001")], empty, { core });
    expect(m.nodes[0].id).toBe(CORE_REF);
  });

  it("draws no group bands: a charter map is one scope by definition", () => {
    expect(buildNoteCanvas([n("K-001"), n("K-002")], empty, { core }).groups).toEqual([]);
  });

  it("still has usable bounds with no groups", () => {
    const m = buildNoteCanvas([n("K-001")], empty, { core });
    expect(m.bounds.w).toBeGreaterThan(0);
    expect(m.bounds.h).toBeGreaterThan(0);
  });

  it("branches every root off the core", () => {
    const m = buildNoteCanvas([n("K-001"), n("K-002")], empty, { core });
    const fromCore = m.edges.filter((e) => e.from === CORE_REF).map((e) => e.to);
    expect(fromCore.sort()).toEqual(["K-001", "K-002"]);
  });

  it("skips a note something else already points at", () => {
    const notes = [n("K-001", { body: "see [[K-002]]" }), n("K-002")];
    const m = buildNoteCanvas(notes, empty, { core });
    const fromCore = m.edges.filter((e) => e.from === CORE_REF).map((e) => e.to);
    expect(fromCore).toEqual(["K-001"]);
  });

  it("falls back to every note when the links form a cycle", () => {
    const notes = [n("K-001", { body: "[[K-002]]" }), n("K-002", { body: "[[K-001]]" })];
    const m = buildNoteCanvas(notes, empty, { core });
    const fromCore = m.edges.filter((e) => e.from === CORE_REF).map((e) => e.to);
    expect(fromCore.sort()).toEqual(["K-001", "K-002"]);
  });

  it("never places a note on top of the core", () => {
    const notes = Array.from({ length: 14 }, (_, i) => n(`K-${100 + i}`));
    const m = buildNoteCanvas(notes, empty, { core });
    const c = m.nodes.find((x) => x.id === CORE_REF)!;
    for (const node of m.nodes) {
      if (node.id === CORE_REF) continue;
      const hit =
        node.x < c.x + c.w && c.x < node.x + node.w && node.y < c.y + c.h && c.y < node.y + node.h;
      expect(hit).toBe(false);
    }
  });

  it("is unchanged without a core, so the knowledge canvas keeps its bands", () => {
    const m = buildNoteCanvas([n("K-001")], empty, {});
    expect(m.nodes.map((x) => x.id)).toEqual(["K-001"]);
    expect(m.groups.length).toBe(1);
  });
});
