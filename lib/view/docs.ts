import type { KnowledgeNote } from "@/lib/core/types";
import { scopeChip, type KnowledgeRow, type TagFacet } from "./knowledge";

export const PREFERRED_TAGS = ["architecture", "protocol", "decision", "runbook", "reference"];

export const UNFILED = "unfiled";

export interface DocGroup {
  tag: string;
  label: string;
  rows: KnowledgeRow[];
}

export interface DocsModel {
  scopeKey: string;
  charterName: string;
  total: number;
  groups: DocGroup[];
  tags: TagFacet[];
}

function rowOf(note: KnowledgeNote): KnowledgeRow {
  return {
    id: note.id,
    title: note.title,
    summary: note.summary,
    scope: note.scope.map((s) => scopeChip(s)),
    tags: note.tags,
    created: note.created,
    updated: note.updated,
  };
}

function byUpdatedDesc(a: KnowledgeRow, b: KnowledgeRow): number {
  if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
  return b.id.localeCompare(a.id);
}

function groupRank(tag: string): number {
  if (tag === UNFILED) return PREFERRED_TAGS.length + 1;
  const i = PREFERRED_TAGS.indexOf(tag);
  return i === -1 ? PREFERRED_TAGS.length : i;
}

function byGroup(a: DocGroup, b: DocGroup): number {
  const ra = groupRank(a.tag);
  const rb = groupRank(b.tag);
  if (ra !== rb) return ra - rb;
  return a.tag.localeCompare(b.tag);
}

export function buildDocs(
  notes: KnowledgeNote[],
  scopeKey: string,
  charterName: string,
): DocsModel {
  const mine = notes.filter((n) => n.scope.includes(scopeKey));

  const buckets = new Map<string, KnowledgeRow[]>();
  const tagCounts = new Map<string, number>();

  for (const note of mine) {
    const row = rowOf(note);
    const home = note.tags[0] ?? UNFILED;
    const bucket = buckets.get(home);
    if (bucket) bucket.push(row);
    else buckets.set(home, [row]);
    for (const t of note.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }

  const groups: DocGroup[] = [...buckets.entries()]
    .map(([tag, rows]) => ({
      tag,
      label: tag === UNFILED ? "Unfiled" : tag,
      rows: [...rows].sort(byUpdatedDesc),
    }))
    .sort(byGroup);

  const tags: TagFacet[] = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));

  return { scopeKey, charterName, total: mine.length, groups, tags };
}

export function docsNote(model: DocsModel): string {
  if (model.total === 0) {
    return `No docs for ${model.charterName} yet. This is where what you have already built gets written down — the architecture, the interfaces, the decisions you do not want to re-argue, and how to run the thing.`;
  }
  const count = `${model.total} ${model.total === 1 ? "doc" : "docs"}`;
  const where =
    model.groups.length === 1
      ? `all under ${model.groups[0].label}`
      : `across ${model.groups.length} groups`;
  return `${count} ${where}. These load into chat whenever ${model.charterName} is the focus.`;
}
