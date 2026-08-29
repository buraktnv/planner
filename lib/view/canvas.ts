import type { KnowledgeNote } from "@/lib/core/types";
import type { CanvasEdgeKind, CanvasFile } from "@/lib/core/canvas";
import { edgeKey } from "@/lib/core/canvas";
import { hueOf } from "@/lib/ui/momentum";
import { noteRefsIn } from "./doc";
import {
  arrowHead,
  autoLayout,
  boundsOf,
  CARD_H,
  CARD_W,
  DEFAULT_GRID,
  edgePath,
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
  for (const n of visible) {
    const at = savedByRef.get(n.id);
    if (at) saved.set(n.id, { x: at.x, y: at.y });
  }

  const placeables: Placeable[] = visible.map((n, i) => ({
    id: n.id,
    groupKey: n.scope[0] ?? null,
    order: i,
  }));
  const auto = autoLayout(placeables, saved, grid);

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
    };
  });

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
  for (const n of nodes) {
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
    bounds: boundsOf(groups.map((g) => g.rect)),
    orphans: [...orphanSet].sort(),
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
