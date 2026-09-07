import type { SearchItem, SearchKind } from "@/lib/core/types";
import {
  BODY_HIT_CAP,
  SNIPPET_LEN,
  WEIGHTS,
  countOccurrences,
  tokenize,
} from "@/lib/core/tokens";

export { BODY_CAP } from "@/lib/core/tokens";
import { charterHref, taskHref } from "./task";
import { docHref } from "./doc";

export interface SearchHit {
  key: string;
  kind: SearchKind;
  title: string;
  hint: string;
  snippet: string;
  href: string;
  score: number;
}

export const KIND_ORDER: readonly SearchKind[] = [
  "charter",
  "note",
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

export const KIND_WEIGHT: Record<SearchKind, number> = {
  charter: 1.05,
  note: 1,
  task: 1,
  event: 0.9,
  description: 0.8,
  log: 0.7,
  habit: 0.7,
  rhythm: 0.7,
  meal: 0.7,
  grocery: 0.6,
  journal: 0.5,
};

const PHRASE_STARTS = 10;
const PHRASE_CONTAINS = 6;
/**
 * Above `PHRASE_STARTS`, because naming a record exactly is the strongest
 * signal a query can carry and everything else is a guess about intent.
 * Below this, searching "K-046" put the journal lines *about* K-046 above the
 * note itself: their titles begin with the id, while the note's own title does
 * not contain it — so the mentions outranked the thing being named.
 */
const IDENT_EXACT = 14;
const SUBSTRING_STRENGTH = 0.35;
const DEFAULT_LIMIT = 25;

export function searchTerms(q: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(q)) if (!out.includes(t)) out.push(t);
  return out;
}

/**
 * How well one term matches a field, widened past `scoreNote`'s whole-token
 * equality: a palette is typed a letter at a time, so "know" has to reach
 * "Knowledge base" before the word is finished.
 */
export function termStrength(tokens: string[], term: string): number {
  if (tokens.includes(term)) return 1;
  if (tokens.some((t) => t.startsWith(term))) return 0.7;
  if (term.length >= 3 && tokens.some((t) => t.includes(term))) return SUBSTRING_STRENGTH;
  return 0;
}

function bodyScore(bodyTokens: string[], term: string): number {
  const exact = countOccurrences(bodyTokens, term);
  if (exact > 0) return WEIGHTS.body * Math.min(exact, BODY_HIT_CAP);
  return termStrength(bodyTokens, term) > 0 ? WEIGHTS.body * SUBSTRING_STRENGTH : 0;
}

/**
 * The record's own id, and nothing else. An id typed in full is the query most
 * worth answering instantly and the one the term scorer cannot answer at all:
 * `tokenize` drops one-character tokens, so "K-009" reduces to "009", which
 * appears in no field of the note it names.
 *
 * Never the whole `key`. A key is namespaced by kind (`note:K-009`,
 * `task:project/acme-bot/T-007`), so a substring test over it makes "note",
 * "task", "log", "event" and "project" match every row of that kind — ordinary
 * words, each of which would return the whole base ahead of the thing actually
 * being looked for.
 */
function identsOf(item: SearchItem): string[] {
  const out: string[] = [];
  if (item.taskId) out.push(item.taskId);
  const rest = keyId(item.key);
  if (!rest.includes("/")) out.push(rest);
  return out;
}

/** Exact only: a prefix of an id is not an id, and would flood on a slug. */
function isIdentMatch(item: SearchItem, phrase: string): boolean {
  return identsOf(item).some((id) => id.toLowerCase() === phrase);
}

function phraseBonus(item: SearchItem, phrase: string): number {
  if (!phrase) return 0;
  if (isIdentMatch(item, phrase)) return IDENT_EXACT;
  const title = item.title.toLowerCase();
  if (title.startsWith(phrase)) return PHRASE_STARTS;
  return title.includes(phrase) ? PHRASE_CONTAINS : 0;
}

export function scoreItem(item: SearchItem, terms: string[], phrase: string): number {
  const bonus = phraseBonus(item, phrase);
  if (!terms.length) return bonus * KIND_WEIGHT[item.kind];

  const title = tokenize(item.title);
  const tags = tokenize(item.tags.join(" "));
  const subtitle = tokenize(item.subtitle);
  const body = tokenize(item.body);

  let score = 0;
  for (const term of terms) {
    const part =
      WEIGHTS.title * termStrength(title, term) +
      WEIGHTS.tags * termStrength(tags, term) +
      WEIGHTS.summary * termStrength(subtitle, term) +
      bodyScore(body, term);
    // AND, not OR: `scoreNote` optimises for recall, which is right for AI
    // retrieval and wrong for a palette, where a second word is a filter.
    if (part === 0) return bonus > 0 ? bonus * KIND_WEIGHT[item.kind] : 0;
    score += part;
  }
  return (score + bonus) * KIND_WEIGHT[item.kind];
}

export function snippetOf(item: SearchItem, terms: string[]): string {
  const body = item.body.replace(/\s+/g, " ").trim();
  if (!body) return item.subtitle;
  const lower = body.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0) return item.subtitle;
  const start = Math.max(0, at - SNIPPET_LEN / 4);
  const text = body.slice(start, start + SNIPPET_LEN);
  return `${start > 0 ? "…" : ""}${text}${start + SNIPPET_LEN < body.length ? "…" : ""}`;
}

/** The part of a key after its kind prefix — a note id, an event id. */
export function keyId(key: string): string {
  const i = key.indexOf(":");
  return i === -1 ? key : key.slice(i + 1);
}

/**
 * Exhaustive over `SearchKind` with no `default` branch, so a kind added
 * without a page to open is a compile error rather than a dead row — the
 * lesson `previewRow` was rewritten for.
 */
export function hrefOf(item: SearchItem): string {
  switch (item.kind) {
    case "note":
      return docHref(keyId(item.key), null);
    case "charter":
      return item.type && item.slug ? charterHref(item.type, item.slug) : "/projects";
    case "task":
    case "description":
    case "log":
      return item.type && item.slug && item.taskId
        ? taskHref(item.type, item.slug, item.taskId)
        : "/board";
    case "event":
      return "/calendar";
    case "habit":
    case "rhythm":
    case "meal":
    case "grocery":
      return "/daily";
    case "journal":
      return item.date ? `/settings/activity#j-${item.date}` : "/settings/activity";
    default: {
      const never: never = item.kind;
      throw new Error(`Unhandled search kind: ${String(never)}`);
    }
  }
}

function kindRank(kind: SearchKind): number {
  const i = KIND_ORDER.indexOf(kind);
  return i === -1 ? KIND_ORDER.length : i;
}

export function rankSearch(items: SearchItem[], q: string, limit = DEFAULT_LIMIT): SearchHit[] {
  const phrase = q.trim().toLowerCase();
  if (!phrase) return [];
  const terms = searchTerms(q);

  return items
    .map((item) => ({ item, score: scoreItem(item, terms, phrase) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ka = kindRank(a.item.kind);
      const kb = kindRank(b.item.kind);
      if (ka !== kb) return ka - kb;
      if (a.item.updated !== b.item.updated) return a.item.updated < b.item.updated ? 1 : -1;
      return a.item.key.localeCompare(b.item.key);
    })
    .slice(0, Math.max(0, limit))
    .map(({ item, score }) => ({
      key: item.key,
      kind: item.kind,
      title: item.title,
      hint: item.subtitle,
      snippet: snippetOf(item, terms),
      href: hrefOf(item),
      score,
    }));
}
