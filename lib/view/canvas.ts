import type { KnowledgeNote } from "@/lib/core/types";
import type { CanvasEdgeKind, CanvasFile } from "@/lib/core/canvas";
import type { CardModel, SubModel } from "./workspace";
import { milestonesOf } from "./targets";
import { edgeKey } from "@/lib/core/canvas";
import { hueOf } from "@/lib/ui/momentum";
import { noteRefsIn } from "./doc";
import { taskHrefFromScope } from "./task";
import {
  arrowHead,
  autoLayout,
  boundsOf,
  CARD_H,
  CARD_W,
  DEFAULT_GRID,
  edgePath,
  packAround,
  type LayoutGrid,
  type Placeable,
  type Point,
  type Rect,
} from "./canvas-layout";

export interface CanvasNodeModel extends Rect {
  id: string;
  title: string;
  /** One line, shown on the card itself — depth 1 of three. */
  preview: string;
  /** Full text for the popup — depth 2. Already loaded for notes. */
  body: string | null;
  href: string;
  groupKey: string | null;
  groupLabel: string;
  color: string;
  tint: string;
  placed: "saved" | "auto";
  pin: boolean;
  tags: string[];
  /** Set on a system canvas: the work delegated from this component. */
  progress: { done: number; total: number; pct: number; linked: boolean } | null;
  /** The tasks naming this note, so the card can list and link them. */
  tasks: ComponentTask[];
}

export interface ComponentTask {
  id: string;
  title: string;
  done: boolean;
  href: string;
}

export interface CanvasEdgeModel {
  key: string;
  from: string;
  to: string;
  kind: CanvasEdgeKind;
  /** "derived" comes from the note text and cannot be deleted here. */
  source: "canvas" | "derived";
  label: string | null;
  d: string;
  head: string;
}

export interface CanvasGroupModel {
  key: string;
  label: string;
  color: string;
  rect: Rect;
}

export interface CanvasModel {
  nodes: CanvasNodeModel[];
  edges: CanvasEdgeModel[];
  groups: CanvasGroupModel[];
  bounds: Rect;
  /** Refs stored in the file whose note no longer exists. Never auto-pruned. */
  orphans: string[];
}

export interface NoteCanvasOptions {
  /** Limit to one charter's notes (a system canvas). Omit for the whole base. */
  scopeKey?: string | null;
  charterNames?: Record<string, string>;
  grid?: LayoutGrid;
  /** Charter tasks, so a component card can show the work delegated from it. */
  tasks?: NoteLinkable[];
  /** "<slug>" or "area:<slug>", used to build task links. */
  taskScope?: string;
  /** Present on a charter map: what the whole thing is for, in the middle. */
  core?: CanvasCore;
}

/**
 * The centre of a charter's map. Not a note and not a new record: it is the
 * charter's own Why and MVP scope, which already exist and are already edited
 * on the charter page.
 */
export interface CanvasCore {
  title: string;
  why: string;
  mvpScope: string[];
  href: string;
  color: string;
  tint: string;
}

/**
 * A group: ref, so it needs no id of its own, is never pruned, and is already
 * skipped by orphan detection — the same three properties that made group:
 * refs part of the grammar in the first place.
 */
export const CORE_REF = "group:core";
export const CORE_W = 400;
export const CORE_H = 280;

function firstLine(text: string): string {
  for (const line of (text ?? "").split("\n")) {
    const t = line.trim();
    if (t) return t.replace(/^#+\s*/, "");
  }
  return "";
}

/**
 * The centre card's body: the motivation, then what finishing looks like.
 * Targets are re-emitted as a markdown task list rather than their stored
 * pipe-delimited form, which is a storage format and reads like one.
 */
export function coreMarkdown(why: string, mvpScope: string[]): string {
  const parts: string[] = [];
  const w = (why ?? "").trim();
  if (w) parts.push(w);

  const lines: string[] = [];
  for (const m of milestonesOf(mvpScope ?? [])) {
    if (m.name) lines.push(`### ${m.name}`);
    for (const t of m.targets) {
      lines.push(`- [${t.done ? "x" : " "}] ${t.title}${t.by ? ` — by ${t.by}` : ""}`);
    }
  }
  if (lines.length > 0) parts.push(["## What done looks like", ...lines].join("\n"));

  return parts.join("\n\n");
}

export function buildCoreNode(core: CanvasCore, file: CanvasFile): CanvasNodeModel {
  const stored = file.nodes.find((n) => n.ref === CORE_REF);
  const w = stored?.w ?? CORE_W;
  const h = stored?.h ?? CORE_H;
  return {
    id: CORE_REF,
    title: core.title,
    preview: firstLine(core.why),
    body: coreMarkdown(core.why, core.mvpScope),
    href: core.href,
    groupKey: null,
    groupLabel: "Core",
    color: core.color,
    tint: core.tint,
    // Centred on the origin by default, so the ring around it is symmetric.
    x: stored?.x ?? -Math.round(w / 2),
    y: stored?.y ?? -Math.round(h / 2),
    w,
    h,
    placed: stored ? "saved" : "auto",
    pin: stored?.pin === true,
    tags: [],
    progress: null,
    tasks: [],
  };
}

function labelForScope(key: string | null, names: Record<string, string>): string {
  if (!key) return "Unfiled";
  return names[key] ?? (key.startsWith("area:") ? key.slice("area:".length) : key);
}

function groupPadding(grid: LayoutGrid) {
  return Math.round(grid.gap / 2);
}

export function buildNoteCanvas(
  notes: KnowledgeNote[],
  file: CanvasFile,
  opts: NoteCanvasOptions = {},
): CanvasModel {
  const grid = opts.grid ?? DEFAULT_GRID;
  const names = opts.charterNames ?? {};

  const visible = (
    opts.scopeKey ? notes.filter((n) => n.scope.includes(opts.scopeKey!)) : notes
  )
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));

  const savedByRef = new Map(file.nodes.map((n) => [n.ref, n]));
  const saved = new Map<string, Point>();
  const savedRects = new Map<string, Rect>();
  for (const n of visible) {
    const at = savedByRef.get(n.id);
    if (!at) continue;
    saved.set(n.id, { x: at.x, y: at.y });
    savedRects.set(n.id, {
      x: at.x,
      y: at.y,
      w: at.w ?? CARD_W,
      h: at.h ?? CARD_H,
    });
  }

  const core = opts.core ? buildCoreNode(opts.core, file) : null;

  const placeables: Placeable[] = visible.map((n, i) => ({
    id: n.id,
    groupKey: n.scope[0] ?? null,
    order: i,
    w: savedByRef.get(n.id)?.w,
    h: savedByRef.get(n.id)?.h,
  }));
  // A charter map rings its cards around the centre; the whole knowledge base
  // keeps the banded grid, where the bands are the charters themselves.
  const auto = core
    ? packAround(core, placeables, savedRects, grid)
    : autoLayout(placeables, saved, grid);

  const nodes: CanvasNodeModel[] = visible.map((n) => {
    const groupKey = n.scope[0] ?? null;
    const at = saved.get(n.id) ?? auto.get(n.id) ?? { x: 0, y: 0 };
    const stored = savedByRef.get(n.id);
    const tone = hueOf(groupKey ?? "unfiled");
    return {
      id: n.id,
      title: n.title,
      preview: n.summary,
      body: n.body,
      href: `/knowledge/${n.id}`,
      groupKey,
      groupLabel: labelForScope(groupKey, names),
      color: tone.color,
      tint: tone.tint,
      x: at.x,
      y: at.y,
      w: stored?.w ?? CARD_W,
      h: stored?.h ?? CARD_H,
      placed: saved.has(n.id) ? "saved" : "auto",
      pin: stored?.pin === true,
      tags: n.tags,
      progress: opts.tasks ? noteProgress(n.id, opts.tasks) : null,
      tasks: componentTasks(n.id, opts.tasks ?? [], opts.taskScope),
    };
  });

  if (core) nodes.unshift(core);

  const rectById = new Map(nodes.map((n) => [n.id, n]));

  const withGeometry = (
    from: string,
    to: string,
    kind: CanvasEdgeKind,
    source: "canvas" | "derived",
    label: string | null,
  ): CanvasEdgeModel | null => {
    const a = rectById.get(from);
    const b = rectById.get(to);
    if (!a || !b || from === to) return null;
    return {
      key: edgeKey({ from, to, kind }),
      from,
      to,
      kind,
      source,
      label,
      d: edgePath(a, b),
      head: arrowHead(a, b),
    };
  };

  const edges: CanvasEdgeModel[] = [];
  const seen = new Set<string>();

  // Everything on a charter map branches from the centre. Only the roots are
  // wired to it — a card that something else already points at is reached
  // through that arrow, so joining it to the core too would draw a starburst
  // over the structure rather than showing it.
  if (core) {
    const pointedAt = new Set<string>();
    for (const n of visible) for (const ref of noteRefsIn(n.body)) pointedAt.add(ref);
    for (const e of file.edges) if (e.kind !== "rel") pointedAt.add(e.to);
    const roots = visible.filter((n) => !pointedAt.has(n.id));
    for (const n of roots.length > 0 ? roots : visible) {
      const e = withGeometry(CORE_REF, n.id, "rel", "derived", null);
      if (e) edges.push(e);
    }
  }

  // Derived first: a link written into the note text wins over a hand-drawn
  // copy of the same relationship, so drawing one that already exists is a
  // visual no-op rather than a double line.
  for (const n of visible) {
    for (const ref of noteRefsIn(n.body)) {
      const e = withGeometry(n.id, ref, "rel", "derived", null);
      if (!e || seen.has(`${e.from}>${e.to}`)) continue;
      seen.add(`${e.from}>${e.to}`);
      edges.push(e);
    }
  }

  for (const raw of file.edges) {
    const pairKey = `${raw.from}>${raw.to}`;
    if (raw.kind === "rel" && seen.has(pairKey)) continue;
    const e = withGeometry(raw.from, raw.to, raw.kind, "canvas", raw.label ?? null);
    if (!e || edges.some((x) => x.key === e.key)) continue;
    if (raw.kind === "rel") seen.add(pairKey);
    edges.push(e);
  }

  const pad = groupPadding(grid);
  const byGroup = new Map<string | null, CanvasNodeModel[]>();
  // A charter map is one scope by definition, so a band around it would frame
  // the whole board and say nothing.
  for (const n of core ? [] : nodes) {
    const list = byGroup.get(n.groupKey);
    if (list) list.push(n);
    else byGroup.set(n.groupKey, [n]);
  }
  const groups: CanvasGroupModel[] = [...byGroup.entries()].map(([key, members]) => {
    const r = boundsOf(members);
    return {
      key: key ?? "unfiled",
      label: labelForScope(key, names),
      color: members[0]?.color ?? "var(--color-faint)",
      rect: { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 },
    };
  });

  const live = new Set(nodes.map((n) => n.id));
  const orphanSet = new Set<string>();
  for (const n of file.nodes) {
    if (!live.has(n.ref) && !n.ref.startsWith("group:")) orphanSet.add(n.ref);
  }
  for (const e of file.edges) {
    for (const ref of [e.from, e.to]) {
      if (!live.has(ref) && !ref.startsWith("group:")) orphanSet.add(ref);
    }
  }

  return {
    nodes,
    edges,
    groups,
    bounds: boundsOf(groups.length > 0 ? groups.map((g) => g.rect) : nodes),
    orphans: [...orphanSet].sort(),
  };
}

export interface TaskCanvasCharter {
  id: string;
  name: string;
  type: "project" | "area";
  color: string;
  tint: string;
  mvpScope: string[];
  cards: CardModel[];
}

/**
 * Tasks as cards: branches and every subtask beneath them, grouped by the
 * milestone their target belongs to. Arrows are parent→subtask and waits:
 * dependencies — both derived, because both already live in tasks.md.
 *
 * Bodies are null: task detail is a file per task, and loading every one to
 * draw a board would be absurd. The popup links to the task page instead.
 */
export function buildTaskCanvas(
  charter: TaskCanvasCharter,
  file: CanvasFile,
  opts: { grid?: LayoutGrid } = {},
): CanvasModel {
  const grid = opts.grid ?? DEFAULT_GRID;
  const milestoneOf = new Map<string, string>();
  for (const m of milestonesOf(charter.mvpScope)) {
    for (const t of m.targets) {
      if (t.id) milestoneOf.set(t.id, m.name ?? "Unscheduled");
    }
  }

  interface Flat {
    id: string;
    title: string;
    size: string;
    done: boolean;
    section: string;
    target?: string;
    waitsOn?: string;
    parentId: string | null;
  }
  const flat: Flat[] = [];
  const walk = (subs: SubModel[], parentId: string) => {
    for (const s of subs) {
      flat.push({
        id: s.id,
        title: s.title,
        size: s.size,
        done: s.done,
        section: s.section,
        target: s.target,
        waitsOn: s.waitsOn,
        parentId,
      });
      walk(s.subs, s.id);
    }
  };
  for (const c of charter.cards) {
    flat.push({
      id: c.id,
      title: c.title,
      size: c.size,
      done: c.done,
      section: c.section,
      target: c.target,
      waitsOn: c.waitsOn,
      parentId: null,
    });
    walk(c.subs, c.id);
  }

  const groupFor = (t: Flat): string | null => {
    if (t.target && milestoneOf.has(t.target)) return milestoneOf.get(t.target)!;
    return t.done ? "Done" : t.section === "in-progress" ? "In progress" : "Backlog";
  };

  const savedByRef = new Map(file.nodes.map((n) => [n.ref, n]));
  const saved = new Map<string, Point>();
  for (const t of flat) {
    const at = savedByRef.get(t.id);
    if (at) saved.set(t.id, { x: at.x, y: at.y });
  }

  const auto = autoLayout(
    flat.map((t, i) => ({ id: t.id, groupKey: groupFor(t), order: i })),
    saved,
    grid,
  );

  const base = charter.type === "area" ? "areas" : "projects";
  const nodes: CanvasNodeModel[] = flat.map((t) => {
    const at = saved.get(t.id) ?? auto.get(t.id) ?? { x: 0, y: 0 };
    const stored = savedByRef.get(t.id);
    const group = groupFor(t);
    return {
      id: t.id,
      title: t.title,
      preview: `${t.size}${t.done ? " · done" : ""}${t.waitsOn ? ` · waits on ${t.waitsOn}` : ""}`,
      body: null,
      href: `/${base}/${charter.id}/tasks/${t.id}`,
      groupKey: group,
      groupLabel: group ?? "Backlog",
      color: charter.color,
      tint: charter.tint,
      x: at.x,
      y: at.y,
      w: stored?.w ?? CARD_W,
      h: stored?.h ?? CARD_H,
      placed: saved.has(t.id) ? "saved" : "auto",
      pin: stored?.pin === true,
      tags: [],
      progress: null,
      tasks: [],
    };
  });

  const rectById = new Map(nodes.map((n) => [n.id, n]));
  const edges: CanvasEdgeModel[] = [];
  const push = (from: string, to: string, kind: CanvasEdgeKind, label: string | null) => {
    const a = rectById.get(from);
    const b = rectById.get(to);
    if (!a || !b || from === to) return;
    edges.push({
      key: edgeKey({ from, to, kind }),
      from,
      to,
      kind,
      source: "derived",
      label,
      d: edgePath(a, b),
      head: arrowHead(a, b),
    });
  };

  for (const t of flat) {
    if (t.parentId) push(t.parentId, t.id, "rel", null);
    // Free-text waits: is not a dependency between two cards, so no arrow.
    if (t.waitsOn && rectById.has(t.waitsOn)) push(t.waitsOn, t.id, "requires", "waits on");
  }

  const pad = Math.round(grid.gap / 2);
  const byGroup = new Map<string | null, CanvasNodeModel[]>();
  for (const n of nodes) {
    const list = byGroup.get(n.groupKey);
    if (list) list.push(n);
    else byGroup.set(n.groupKey, [n]);
  }
  const groups: CanvasGroupModel[] = [...byGroup.entries()].map(([key, members]) => {
    const r = boundsOf(members);
    return {
      key: key ?? "backlog",
      label: key ?? "Backlog",
      color: charter.color,
      rect: { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 },
    };
  });

  const live = new Set(nodes.map((n) => n.id));
  const orphans = [
    ...new Set(
      file.nodes.map((n) => n.ref).filter((ref) => !live.has(ref) && !ref.startsWith("group:")),
    ),
  ].sort();

  return { nodes, edges, groups, bounds: boundsOf(groups.map((g) => g.rect)), orphans };
}

/**
 * The tasks doing a component's work, open first. Derived every render from
 * the note: field on the task line, which is the only record of the link --
 * nothing about it is written to the canvas file.
 */
export function componentTasks(
  noteId: string,
  tasks: NoteLinkable[],
  scope?: string,
): ComponentTask[] {
  return tasks
    .filter((t) => t.note === noteId && t.id)
    .map((t) => ({
      id: t.id!,
      title: t.title ?? t.id!,
      done: t.done,
      href: scope ? taskHrefFromScope(scope, t.id!) : "",
    }))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.id.localeCompare(b.id, "en", { numeric: true }));
}

export interface NoteLinkable {
  /** Optional so the progress-only callers keep working unchanged. */
  id?: string;
  title?: string;
  note?: string;
  done: boolean;
}

/**
 * How much of a component's work is finished, counted from the tasks that name
 * it. Mirrors targetProgress: a component with nothing linked reports no
 * progress rather than 0%, and is never auto-completed when its tasks finish —
 * doing the tasks you thought of is evidence, not proof.
 */
export function noteProgress(
  noteId: string,
  tasks: NoteLinkable[],
): { done: number; total: number; pct: number; linked: boolean } {
  const mine = tasks.filter((t) => t.note === noteId);
  const done = mine.filter((t) => t.done).length;
  return {
    done,
    total: mine.length,
    pct: mine.length === 0 ? 0 : Math.round((done / mine.length) * 100),
    linked: mine.length > 0,
  };
}

export function canvasNote(model: CanvasModel): string {
  if (model.nodes.length === 0) {
    return "Nothing to map yet. Notes appear here as cards once the knowledge base has some.";
  }
  const drawn = model.edges.filter((e) => e.source === "canvas").length;
  const derived = model.edges.length - drawn;
  const parts = [`${model.nodes.length} note${model.nodes.length === 1 ? "" : "s"}`];
  if (derived > 0) parts.push(`${derived} from the text`);
  if (drawn > 0) parts.push(`${drawn} drawn here`);
  const stale =
    model.orphans.length > 0
      ? ` ${model.orphans.length} stale reference${model.orphans.length === 1 ? "" : "s"}.`
      : "";
  return `${parts.join(" · ")}. Click a title to read it, then open the full page.${stale}`;
}
