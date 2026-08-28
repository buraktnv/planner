import { hueOf } from "@/lib/ui/momentum";
import type { KnowledgeNote } from "@/lib/core/types";

export interface ScopeChip {
  key: string;
  label: string;
  color: string;
  tint: string;
  isArea: boolean;
}

export interface ScopeFacet extends ScopeChip {
  count: number;
}

export interface TagFacet {
  tag: string;
  count: number;
}

export interface KnowledgeRow {
  id: string;
  title: string;
  summary: string;
  scope: ScopeChip[];
  tags: string[];
  created: string;
  updated: string;
}

export interface KnowledgeModel {
  total: number;
  scopeless: number;
  rows: KnowledgeRow[];
  scopes: ScopeFacet[];
  tags: TagFacet[];
}

export function slugOfScope(key: string): string {
  return key.startsWith("area:") ? key.slice("area:".length) : key;
}

export function scopeChip(key: string, names?: Record<string, string>): ScopeChip {
  const slug = slugOfScope(key);
  const { color, tint } = hueOf(slug);
  return {
    key,
    label: names?.[key] ?? slug,
    color,
    tint,
    isArea: key.startsWith("area:"),
  };
}

function byUpdatedDesc(a: KnowledgeRow, b: KnowledgeRow): number {
  if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
  return b.id.localeCompare(a.id);
}

export function buildKnowledge(
  notes: KnowledgeNote[],
  names?: Record<string, string>,
): KnowledgeModel {
  const rows: KnowledgeRow[] = notes.map((n) => ({
    id: n.id,
    title: n.title,
    summary: n.summary,
    scope: n.scope.map((s) => scopeChip(s, names)),
    tags: n.tags,
    created: n.created,
    updated: n.updated,
  }));
  rows.sort(byUpdatedDesc);

  const scopeCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  let scopeless = 0;

  for (const n of notes) {
    if (!n.scope.length) scopeless++;
    for (const s of n.scope) scopeCounts.set(s, (scopeCounts.get(s) ?? 0) + 1);
    for (const t of n.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }

  const scopes: ScopeFacet[] = [...scopeCounts.entries()]
    .map(([key, count]) => ({ ...scopeChip(key, names), count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)));

  const tags: TagFacet[] = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));

  return { total: notes.length, scopeless, rows, scopes, tags };
}

export function knowledgeNote(model: KnowledgeModel): string {
  if (model.total === 0) {
    return "Nothing filed yet. A second brain only pays off once something is in it — write the conclusion, not the topic.";
  }
  if (model.scopeless > 0) {
    return `${model.total} ${model.total === 1 ? "note" : "notes"} filed. ${model.scopeless} ${
      model.scopeless === 1 ? "has" : "have"
    } no scope, so ${model.scopeless === 1 ? "it is" : "they are"} searchable but never loaded automatically.`;
  }
  return `${model.total} ${model.total === 1 ? "note" : "notes"} filed across ${
    model.scopes.length
  } ${model.scopes.length === 1 ? "scope" : "scopes"}. Only the focused scope is loaded into chat.`;
}
