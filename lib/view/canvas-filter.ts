import type { KnowledgeNote, ProjectStatus } from "@/lib/core/types";

/**
 * The whole knowledge base, read by current status.
 *
 * /canvas bands every note by its first scope, and the band order came from
 * whichever note happened to have the lowest id — so a paused side project
 * could sit above the thing being worked on today. This file decides the band
 * order and the filtering, and it is pure because none of it can be tested
 * through a canvas component: vitest runs in node with no DOM.
 *
 * Filtering happens on the SERVER, before buildNoteCanvas. It has to: the
 * layout, the band rectangles and the viewport bounds are all computed from
 * the note list, so a client-side filter would leave every band drawn around
 * cards that are no longer in it.
 */

/**
 * A band's status. Notes with no scope, or a scope naming no live charter,
 * have no charter and so no status — they are filterable as "none" rather
 * than silently excluded the moment a status filter is switched on.
 */
export type BandStatus = ProjectStatus | "none";

export const UNFILED = "unfiled";

/** Active first, then what is merely paused, then what is over. */
export const STATUS_RANK: Record<BandStatus, number> = {
  active: 0,
  paused: 1,
  done: 2,
  abandoned: 3,
  none: 4,
};

export const STATUS_ORDER: BandStatus[] = ["active", "paused", "done", "abandoned", "none"];

export interface BandCharter {
  /** The scope key a note carries: the bare slug, or "area:" plus the slug. */
  key: string;
  name: string;
  status: ProjectStatus;
}

export interface CanvasFilter {
  /** Empty means every status. Nothing is hidden until something is picked. */
  status: BandStatus[];
  /** A band key, or UNFILED. Null means every topic. */
  topic: string | null;
  tag: string | null;
}

export const NO_FILTER: CanvasFilter = { status: [], topic: null, tag: null };

export function bandKeyOf(note: KnowledgeNote): string | null {
  return note.scope[0] ?? null;
}

export function charterMap(charters: BandCharter[]): Map<string, BandCharter> {
  return new Map(charters.map((c) => [c.key, c]));
}

export function statusOf(key: string | null, charters: Map<string, BandCharter>): BandStatus {
  if (!key) return "none";
  return charters.get(key)?.status ?? "none";
}

export function labelOf(key: string | null, charters: Map<string, BandCharter>): string {
  if (!key) return "Unfiled";
  const c = charters.get(key);
  if (c) return c.name;
  return key.startsWith("area:") ? key.slice("area:".length) : key;
}

/**
 * Band order, as a rank per band key. autoLayout lays bands out in
 * first-appearance order, so ranking the notes is the whole mechanism —
 * nothing about the geometry changes.
 */
export function bandRank(key: string | null, charters: Map<string, BandCharter>): number {
  return STATUS_RANK[statusOf(key, charters)];
}

/**
 * Ties inside a rank break on the label, so two active projects keep a stable
 * order rather than one decided by whichever note was filed first.
 */
export function compareBands(
  a: string | null,
  b: string | null,
  charters: Map<string, BandCharter>,
): number {
  const byStatus = bandRank(a, charters) - bandRank(b, charters);
  if (byStatus !== 0) return byStatus;
  return labelOf(a, charters).localeCompare(labelOf(b, charters), "en", {
    sensitivity: "base",
  });
}

/** A search param that may arrive as a string, a repeated key, or not at all. */
type Param = string | string[] | undefined;

function one(raw: Param): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
}

function isBandStatus(v: string): v is BandStatus {
  return (STATUS_ORDER as string[]).includes(v);
}

/**
 * Read a filter off the URL. Total: anything unrecognised is dropped, so a
 * hand-typed or stale query narrows the board wrongly at worst, never throws.
 */
export function parseCanvasFilter(params: Record<string, Param> | undefined): CanvasFilter {
  if (!params) return NO_FILTER;
  const rawStatus = params.status;
  const list = Array.isArray(rawStatus) ? rawStatus : rawStatus ? [rawStatus] : [];
  const status: BandStatus[] = [];
  for (const entry of list) {
    for (const piece of String(entry).split(",")) {
      const v = piece.trim();
      if (isBandStatus(v) && !status.includes(v)) status.push(v);
    }
  }
  status.sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b]);
  return { status, topic: one(params.topic), tag: one(params.tag) };
}

/**
 * The query string for a filter, empty when nothing is set. Keys are written
 * in a fixed order, so the same filter is always the same URL.
 */
export function filterQuery(f: CanvasFilter): string {
  const q = new URLSearchParams();
  if (f.status.length > 0) q.set("status", f.status.join(","));
  if (f.topic) q.set("topic", f.topic);
  if (f.tag) q.set("tag", f.tag);
  const s = q.toString();
  return s === "" ? "" : `?${s}`;
}

export function filterHref(base: string, f: CanvasFilter): string {
  return `${base}${filterQuery(f)}`;
}

export function toggleStatus(f: CanvasFilter, s: BandStatus): CanvasFilter {
  const has = f.status.includes(s);
  const status = has ? f.status.filter((x) => x !== s) : [...f.status, s];
  status.sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b]);
  return { ...f, status };
}

export function withTopic(f: CanvasFilter, topic: string | null): CanvasFilter {
  return { ...f, topic };
}

export function withTag(f: CanvasFilter, tag: string | null): CanvasFilter {
  return { ...f, tag };
}

export function isFiltered(f: CanvasFilter): boolean {
  return f.status.length > 0 || f.topic !== null || f.tag !== null;
}

function topicMatches(key: string | null, topic: string): boolean {
  return topic === UNFILED ? key === null : key === topic;
}

/**
 * The notes a filter admits, ordered so autoLayout bands them by status.
 * Order is settled here rather than in buildNoteCanvas, which sorts by id and
 * would otherwise throw the ranking away.
 */
export function applyCanvasFilter(
  notes: KnowledgeNote[],
  charters: Map<string, BandCharter>,
  f: CanvasFilter,
): KnowledgeNote[] {
  return notes
    .filter((n) => {
      const key = bandKeyOf(n);
      if (f.status.length > 0 && !f.status.includes(statusOf(key, charters))) return false;
      if (f.topic !== null && !topicMatches(key, f.topic)) return false;
      if (f.tag !== null && !n.tags.includes(f.tag)) return false;
      return true;
    })
    .sort(
      (a, b) => compareBands(bandKeyOf(a), bandKeyOf(b), charters) || a.id.localeCompare(b.id),
    );
}

export interface FilterFacet {
  value: string;
  label: string;
  count: number;
}

export interface CanvasFacets {
  statuses: FilterFacet[];
  topics: FilterFacet[];
  tags: FilterFacet[];
  /** Notes admitted by the filter, out of the whole base. */
  shown: number;
  total: number;
}

/**
 * What the bar can offer, counted over the WHOLE base rather than the filtered
 * set — counts that shrank as you narrowed would make every remaining option
 * look empty and give no way back. A topic with notes always appears even when
 * the current status filter excludes it, so the bar cannot paint you into a
 * corner.
 */
export function canvasFacets(
  notes: KnowledgeNote[],
  charters: Map<string, BandCharter>,
  f: CanvasFilter = NO_FILTER,
): CanvasFacets {
  const byStatus = new Map<BandStatus, number>();
  const byTopic = new Map<string, number>();
  const byTag = new Map<string, number>();

  for (const n of notes) {
    const key = bandKeyOf(n);
    const st = statusOf(key, charters);
    byStatus.set(st, (byStatus.get(st) ?? 0) + 1);
    const topic = key ?? UNFILED;
    byTopic.set(topic, (byTopic.get(topic) ?? 0) + 1);
    for (const t of new Set(n.tags)) byTag.set(t, (byTag.get(t) ?? 0) + 1);
  }

  // Every live charter is offered as a topic even with nothing filed under it:
  // a topic you have just created is exactly the one you want to file into.
  for (const c of charters.values()) if (!byTopic.has(c.key)) byTopic.set(c.key, 0);

  const statuses: FilterFacet[] = STATUS_ORDER.filter((s) => (byStatus.get(s) ?? 0) > 0).map(
    (s) => ({ value: s, label: s === "none" ? "unfiled" : s, count: byStatus.get(s)! }),
  );

  const topics: FilterFacet[] = [...byTopic.entries()]
    .map(([value, count]) => ({
      value,
      label: labelOf(value === UNFILED ? null : value, charters),
      count,
    }))
    .sort((a, b) =>
      compareBands(
        a.value === UNFILED ? null : a.value,
        b.value === UNFILED ? null : b.value,
        charters,
      ),
    );

  const tags: FilterFacet[] = [...byTag.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  return {
    statuses,
    topics,
    tags,
    shown: applyCanvasFilter(notes, charters, f).length,
    total: notes.length,
  };
}
