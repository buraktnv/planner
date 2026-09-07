import type { ProjectType } from "@/lib/core/types";

/**
 * `@` mentions: the token in the text, the structured entry in the request
 * body, and the picker that turns one into the other.
 *
 * Everything here is pure and import-safe for the browser. The server side —
 * validating the body and reading what a mention points at — is
 * `lib/ai/mentions.ts`, which imports these types rather than the reverse, so
 * nothing that reaches `lib/core` is pulled into the rail.
 */

export type Mention =
  | { kind: "note"; id: string }
  | { kind: "task"; type: ProjectType; slug: string; id: string }
  | { kind: "charter"; type: ProjectType; slug: string };

export const NOTE_ID = /^K-\d{3,}$/;
export const TASK_ID = /^T-\d+(?:\.\d+)*$/;
export const SLUG = /^[a-z0-9][a-z0-9-]*$/;

/** What the picker offers: what exists, in the shape the rail can hold. */
export interface MentionCatalog {
  notes: { id: string; title: string; scope: string[] }[];
  tasks: { type: ProjectType; slug: string; id: string; title: string; charterName: string }[];
  charters: { type: ProjectType; slug: string; name: string }[];
}

export const EMPTY_CATALOG: MentionCatalog = { notes: [], tasks: [], charters: [] };

export type MentionItem =
  | { kind: "note"; token: string; label: string; hint: string; id: string; scope: string[] }
  | { kind: "task"; token: string; label: string; hint: string; type: ProjectType; slug: string; id: string }
  | { kind: "charter"; token: string; label: string; hint: string; type: ProjectType; slug: string }
  | { kind: "command"; token: string; label: string; hint: string; name: string };

export const COMMANDS: MentionItem[] = [
  {
    kind: "command",
    token: "/checkin",
    label: "/checkin",
    hint: "Two to four short questions, then it files what should be kept",
    name: "checkin",
  },
];

export function catalogItems(catalog: MentionCatalog): MentionItem[] {
  const out: MentionItem[] = [];
  for (const c of catalog.charters) {
    out.push({
      kind: "charter",
      token: `@${c.slug}`,
      label: c.name,
      hint: c.type === "area" ? "area" : "project",
      type: c.type,
      slug: c.slug,
    });
  }
  for (const n of catalog.notes) {
    out.push({
      kind: "note",
      token: `@${n.id}`,
      label: n.title,
      hint: n.id,
      id: n.id,
      scope: n.scope ?? [],
    });
  }
  for (const t of catalog.tasks) {
    out.push({
      kind: "task",
      token: `@${t.id}`,
      label: t.title,
      hint: `${t.id} · ${t.charterName}`,
      type: t.type,
      slug: t.slug,
      id: t.id,
    });
  }
  return out;
}

export interface MentionQuery {
  /** Index of the trigger character in the text. */
  start: number;
  trigger: "@" | "/";
  query: string;
}

/**
 * The `@word` or `/word` the caret is inside, if any. `@` opens anywhere a
 * word can start; `/` only at the very start of the message, because a
 * command is something the message *is*, not something it contains.
 */
export function mentionQueryAt(text: string, caret: number): MentionQuery | null {
  const at = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, at);
  const m = /(^|\s)([@/])([^\s@/]*)$/.exec(before);
  if (!m) return null;
  const start = at - m[2].length - m[3].length;
  const trigger = m[2] as "@" | "/";
  if (trigger === "/" && start !== 0) return null;
  return { start, trigger, query: m[3] };
}

export type MentionFocus = { type: ProjectType; slug: string } | null | undefined;

/** How a charter is written in a note's `scope` list. */
export function scopeKeyOf(focus: { type: ProjectType; slug: string }): string {
  return focus.type === "area" ? `area:${focus.slug}` : focus.slug;
}

/** Whether an item belongs to the focused charter, and so survives a scoped `@`. */
export function inFocus(item: MentionItem, focus: { type: ProjectType; slug: string }): boolean {
  switch (item.kind) {
    case "note":
      return item.scope.includes(scopeKeyOf(focus));
    case "task":
    case "charter":
      return item.type === focus.type && item.slug === focus.slug;
    case "command":
      return true;
  }
}

/**
 * A leading `.` is the escape hatch, not part of the search: `@` offers the
 * focused charter alone, `@.` offers everything.
 *
 * It exists only between the keystroke and the picker. `insertMention`
 * replaces the whole `@…` run with the chosen token, so the dot never survives
 * into the text — which is why `TOKEN_RE`, `parseMentions` and the entire
 * server path needed no change to support it.
 */
export function parseMentionQuery(query: string): { query: string; global: boolean } {
  return query.startsWith(".") ? { query: query.slice(1), global: true } : { query, global: false };
}

function rank(item: MentionItem, q: string): number {
  if (!q) return 1;
  const token = item.token.slice(1).toLowerCase();
  const label = item.label.toLowerCase();
  if (token.startsWith(q)) return 4;
  if (label.startsWith(q)) return 3;
  if (label.split(/\s+/).some((w) => w.startsWith(q))) return 2;
  if (token.includes(q) || label.includes(q)) return 1;
  return 0;
}

/**
 * What the picker shows. With a charter focused, `@` is a hard filter down to
 * that charter — the whole point is that a project conversation offers that
 * project — and `@.` lifts it. Unfocused, `@` has always meant everything and
 * still does.
 *
 * Only the picker is scoped. `collectMentions` stays global on purpose: a
 * `@K-020` that is typed or pasted must resolve whatever is focused, or a
 * mention would mean different things depending on a dropdown the sent
 * message does not record.
 */
export function filterMentionItems(
  items: MentionItem[],
  trigger: "@" | "/",
  query: string,
  limit = 8,
  focus?: MentionFocus,
): MentionItem[] {
  const parsed = trigger === "@" ? parseMentionQuery(query) : { query, global: false };
  const q = parsed.query.trim().toLowerCase();
  const all = trigger === "/" ? COMMANDS : items.filter((i) => i.kind !== "command");
  const pool =
    trigger === "@" && focus && !parsed.global ? all.filter((i) => inFocus(i, focus)) : all;
  return pool
    .map((item, i) => ({ item, score: rank(item, q), i }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.item);
}

/** Replace the query with the token and a space; the caret lands after both. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  item: MentionItem,
): { text: string; caret: number } {
  const at = Math.max(start, Math.min(caret, text.length));
  const head = text.slice(0, start);
  const tail = text.slice(at);
  const inserted = `${item.token} `;
  return { text: `${head}${inserted}${tail.replace(/^\s/, "")}`, caret: head.length + inserted.length };
}

const TOKEN_RE = /(?<![\w@/])@(K-\d{3,}|T-\d+(?:\.\d+)*|[a-z0-9][a-z0-9-]*)(?![\w-])/g;

/**
 * The mentions a message actually carries, derived from the text at send
 * time rather than held as state — deleting the token is deleting the mention.
 * A bare `T-007` is ambiguous across charters, so the focused charter wins,
 * then the first charter that has it. A slug that matches no charter is just
 * a word with an `@` in front.
 */
export function collectMentions(
  text: string,
  catalog: MentionCatalog,
  focus?: { type: ProjectType; slug: string },
): Mention[] {
  const out: Mention[] = [];
  const seen = new Set<string>();
  const push = (m: Mention, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(m);
  };
  for (const match of text.matchAll(TOKEN_RE)) {
    const ref = match[1];
    if (NOTE_ID.test(ref)) {
      if (catalog.notes.some((n) => n.id === ref)) push({ kind: "note", id: ref }, `note:${ref}`);
      continue;
    }
    if (TASK_ID.test(ref)) {
      const hits = catalog.tasks.filter((t) => t.id === ref);
      const chosen =
        (focus && hits.find((t) => t.type === focus.type && t.slug === focus.slug)) ?? hits[0];
      if (chosen) {
        push(
          { kind: "task", type: chosen.type, slug: chosen.slug, id: ref },
          `task:${chosen.type}/${chosen.slug}/${ref}`,
        );
      }
      continue;
    }
    const charter =
      catalog.charters.find((c) => c.slug === ref && c.type === "project") ??
      catalog.charters.find((c) => c.slug === ref);
    if (charter) {
      push({ kind: "charter", type: charter.type, slug: charter.slug }, `charter:${charter.type}/${charter.slug}`);
    }
  }
  return out;
}

export type MentionSegment = { type: "text"; text: string } | { type: "mention"; token: string; ref: string };

/** Split a message into plain runs and tokens, for rendering a bubble with links. */
export function splitMentions(text: string): MentionSegment[] {
  const out: MentionSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ type: "text", text: text.slice(last, at) });
    out.push({ type: "mention", token: match[0], ref: match[1] });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

/** Where a token leads, given what exists; null when it is only a word. */
export function mentionHref(
  ref: string,
  catalog: MentionCatalog,
  focus?: { type: ProjectType; slug: string },
): string | null {
  const [m] = collectMentions(`@${ref}`, catalog, focus);
  if (!m) return null;
  if (m.kind === "note") return `/knowledge/${m.id}`;
  const base = m.type === "area" ? "areas" : "projects";
  return m.kind === "task" ? `/${base}/${m.slug}/tasks/${m.id}` : `/${base}/${m.slug}`;
}

/** The command a message starts with, and the text left once it is removed. */
export function commandOf(text: string): { name: string; rest: string } | null {
  const m = /^\/([a-z]+)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  if (!COMMANDS.some((c) => c.kind === "command" && c.name === m[1])) return null;
  return { name: m[1], rest: (m[2] ?? "").trim() };
}
