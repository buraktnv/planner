import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { KnowledgeHit, KnowledgeNote } from "./types";
import { knowledgeDir, knowledgeIndexPath } from "./paths";
import { appendJournal } from "./journal";
import { commitData } from "./git";

export class KnowledgeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeParseError";
  }
}

const NOTE_ID_RE = /^K-\d{3,}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCOPE_RE = /^(area:)?[a-z0-9][a-z0-9-]*$/;
const TAG_RE = /^[a-z0-9][a-z0-9-]*$/;
const LINK_RE = /\[\[(K-\d{3,})\]\]/g;
const INDEX_HEADER = "# Knowledge index (generated — do not edit)";
const KNOWN_KEYS = new Set([
  "id",
  "title",
  "summary",
  "scope",
  "tags",
  "created",
  "updated",
  "source",
]);
const FOCUS_LINE_CAP = 40;
const SNIPPET_LEN = 160;
const BODY_HIT_CAP = 5;

const WEIGHTS = { title: 8, tags: 6, summary: 4, body: 1 } as const;

function toLF(raw: string): string {
  return raw.replace(/\r\n/g, "\n");
}

function isoToday(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

function asLine(value: unknown, field: string, where: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new KnowledgeParseError(`${where}: ${field} is required and must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.includes("\n")) {
    throw new KnowledgeParseError(`${where}: ${field} must be a single line`);
  }
  return trimmed;
}

function asList(value: unknown, field: string, re: RegExp, where: string): string[] {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw.map((entry) => {
    if (typeof entry !== "string") {
      throw new KnowledgeParseError(`${where}: every ${field} entry must be a string`);
    }
    const trimmed = entry.trim();
    if (!re.test(trimmed)) {
      throw new KnowledgeParseError(`${where}: invalid ${field} entry "${entry}"`);
    }
    return trimmed;
  });
}

function asDate(value: unknown, field: string, where: string): string {
  const text =
    value instanceof Date ? value.toLocaleDateString("sv").slice(0, 10) : String(value ?? "");
  if (!ISO_DATE_RE.test(text)) {
    throw new KnowledgeParseError(`${where}: ${field} must be an ISO date (YYYY-MM-DD), got "${text}"`);
  }
  return text;
}

export function parseNote(raw: string, where = "note"): KnowledgeNote {
  const parsed = matter(toLF(raw));
  const data = parsed.data as Record<string, unknown>;

  for (const key of Object.keys(data)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new KnowledgeParseError(`${where}: unknown frontmatter key "${key}"`);
    }
  }

  const id = asLine(data.id, "id", where);
  if (!NOTE_ID_RE.test(id)) {
    throw new KnowledgeParseError(
      `${where}: invalid note id "${id}"; expected K- followed by at least 3 digits`,
    );
  }

  const note: KnowledgeNote = {
    id,
    title: asLine(data.title, "title", where),
    summary: asLine(data.summary, "summary", where),
    scope: asList(data.scope, "scope", SCOPE_RE, where),
    tags: asList(data.tags, "tags", TAG_RE, where),
    created: asDate(data.created, "created", where),
    updated: asDate(data.updated, "updated", where),
    body: parsed.content.replace(/^\n+/, "").replace(/\s+$/, ""),
  };
  if (data.source !== undefined) {
    note.source = asLine(data.source, "source", where);
  }
  return note;
}

export function serializeNote(note: KnowledgeNote): string {
  const lines = [
    "---",
    `id: ${note.id}`,
    `title: ${note.title}`,
    `summary: ${note.summary}`,
  ];
  if (note.scope.length) {
    lines.push("scope:");
    for (const s of note.scope) lines.push(`  - ${s}`);
  }
  if (note.tags.length) {
    lines.push("tags:");
    for (const t of note.tags) lines.push(`  - ${t}`);
  }
  lines.push(`created: ${note.created}`, `updated: ${note.updated}`);
  if (note.source) lines.push(`source: ${note.source}`);
  lines.push("---", "");
  const body = note.body.trim();
  return `${lines.join("\n")}\n${body}${body ? "\n" : ""}`;
}

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "note";
}

export function noteFileName(id: string, title: string): string {
  return `${id}-${slugifyTitle(title)}.md`;
}

export function nextNoteId(notes: KnowledgeNote[]): string {
  let max = 0;
  for (const n of notes) {
    const m = /^K-(\d+)$/.exec(n.id);
    if (!m) continue;
    const v = parseInt(m[1], 10);
    if (v > max) max = v;
  }
  return `K-${String(max + 1).padStart(3, "0")}`;
}

export function journalScopeOf(scope: string[]): string {
  const first = scope[0];
  if (!first) return "knowledge";
  return first.startsWith("area:") ? first.slice("area:".length) : first;
}

export function indexLine(note: KnowledgeNote): string {
  const scope = note.scope.length ? note.scope.join(",") : "-";
  const tags = note.tags.length ? note.tags.join(",") : "-";
  return `- ${note.id} | ${scope} | ${tags} | ${note.title} | ${note.summary}`;
}

export function indexLines(notes: KnowledgeNote[]): string[] {
  return sortNotes(notes).map(indexLine);
}

export function serializeIndex(notes: KnowledgeNote[]): string {
  const lines = indexLines(notes);
  const body = lines.length ? lines.join("\n") : "(no notes)";
  return `${INDEX_HEADER}\n\n${body}\n`;
}

function sortNotes(notes: KnowledgeNote[]): KnowledgeNote[] {
  return [...notes].sort((a, b) => a.id.localeCompare(b.id));
}

export function backlinksOf(notes: KnowledgeNote[], id: string): string[] {
  const out: string[] = [];
  for (const n of notes) {
    if (n.id === id) continue;
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(n.body)) !== null) {
      if (m[1] === id) {
        out.push(n.id);
        break;
      }
    }
  }
  return out.sort();
}

export function linksOf(note: KnowledgeNote): string[] {
  const out = new Set<string>();
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(note.body)) !== null) out.add(m[1]);
  return [...out].sort();
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function countOccurrences(haystack: string[], needle: string): number {
  let n = 0;
  for (const t of haystack) if (t === needle) n++;
  return n;
}

export function scoreNote(note: KnowledgeNote, terms: string[]): number {
  if (!terms.length) return 0;
  const title = tokenize(note.title);
  const summary = tokenize(note.summary);
  const tags = tokenize(note.tags.join(" "));
  const body = tokenize(note.body);
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += WEIGHTS.title;
    if (tags.includes(term)) score += WEIGHTS.tags;
    if (summary.includes(term)) score += WEIGHTS.summary;
    const hits = Math.min(countOccurrences(body, term), BODY_HIT_CAP);
    score += hits * WEIGHTS.body;
  }
  return score;
}

export function snippetFor(note: KnowledgeNote, terms: string[]): string {
  const body = note.body.replace(/\s+/g, " ").trim();
  const lower = body.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const i = lower.indexOf(term);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  if (at < 0 || !body) return note.summary;
  const start = Math.max(0, at - SNIPPET_LEN / 4);
  const text = body.slice(start, start + SNIPPET_LEN);
  return `${start > 0 ? "…" : ""}${text}${start + SNIPPET_LEN < body.length ? "…" : ""}`;
}

async function noteFiles(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(knowledgeDir());
  } catch {
    return [];
  }
  return entries.filter((f) => f.endsWith(".md") && f !== "index.md").sort();
}

export async function listNotes(): Promise<KnowledgeNote[]> {
  const files = await noteFiles();
  const notes: KnowledgeNote[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const raw = await fs.readFile(path.join(knowledgeDir(), file), "utf8");
    const note = parseNote(raw, file);
    if (seen.has(note.id)) {
      throw new KnowledgeParseError(`${file}: duplicate note id "${note.id}"`);
    }
    seen.add(note.id);
    notes.push(note);
  }
  return sortNotes(notes);
}

export async function getNote(id: string): Promise<KnowledgeNote> {
  const notes = await listNotes();
  const note = notes.find((n) => n.id === id);
  if (!note) throw new Error(`Note not found: ${id}`);
  return note;
}

export async function readNote(
  id: string,
): Promise<{ note: KnowledgeNote; links: string[]; backlinks: string[] }> {
  const notes = await listNotes();
  const note = notes.find((n) => n.id === id);
  if (!note) throw new Error(`Note not found: ${id}`);
  return { note, links: linksOf(note), backlinks: backlinksOf(notes, id) };
}

export async function writeIndex(notes?: KnowledgeNote[]): Promise<void> {
  const all = notes ?? (await listNotes());
  await fs.mkdir(knowledgeDir(), { recursive: true });
  await fs.writeFile(knowledgeIndexPath(), serializeIndex(all), "utf8");
}

function cleanLine(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error(`A note requires a non-empty ${field}`);
  if (trimmed.includes("\n")) throw new Error(`A note ${field} must be a single line`);
  if (trimmed.includes(" | ")) throw new Error(`A note ${field} may not contain " | "`);
  return trimmed;
}

function cleanList(values: string[] | undefined, field: string, re: RegExp): string[] {
  if (!values) return [];
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v.trim();
    if (trimmed === "") continue;
    if (!re.test(trimmed)) throw new Error(`Invalid ${field} "${v}"`);
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

async function writeNoteFile(note: KnowledgeNote, previousTitle?: string): Promise<void> {
  const dir = knowledgeDir();
  await fs.mkdir(dir, { recursive: true });
  const target = noteFileName(note.id, previousTitle ?? note.title);
  await fs.writeFile(path.join(dir, target), serializeNote(note), "utf8");
}

export async function addNote(input: {
  title: string;
  summary: string;
  body?: string;
  scope?: string[];
  tags?: string[];
  source?: string;
}): Promise<KnowledgeNote> {
  const notes = await listNotes();
  const today = isoToday();
  const note: KnowledgeNote = {
    id: nextNoteId(notes),
    title: cleanLine(input.title, "title"),
    summary: cleanLine(input.summary, "summary"),
    scope: cleanList(input.scope, "scope", SCOPE_RE),
    tags: cleanList(input.tags, "tags", TAG_RE),
    created: today,
    updated: today,
    body: (input.body ?? "").trim(),
  };
  if (input.source && input.source.trim()) {
    note.source = cleanLine(input.source, "source");
  }
  await writeNoteFile(note);
  await writeIndex([...notes, note]);
  await appendJournal(journalScopeOf(note.scope), `${note.id} note added: ${note.title}`);
  await commitData(`note added: ${note.id} (${note.title})`);
  return note;
}

export async function updateNote(
  id: string,
  patch: {
    title?: string;
    summary?: string;
    body?: string;
    scope?: string[];
    tags?: string[];
    source?: string;
  },
): Promise<KnowledgeNote> {
  const notes = await listNotes();
  const current = notes.find((n) => n.id === id);
  if (!current) throw new Error(`Note not found: ${id}`);

  const next: KnowledgeNote = {
    ...current,
    title: patch.title !== undefined ? cleanLine(patch.title, "title") : current.title,
    summary: patch.summary !== undefined ? cleanLine(patch.summary, "summary") : current.summary,
    scope: patch.scope !== undefined ? cleanList(patch.scope, "scope", SCOPE_RE) : current.scope,
    tags: patch.tags !== undefined ? cleanList(patch.tags, "tags", TAG_RE) : current.tags,
    body: patch.body !== undefined ? patch.body.trim() : current.body,
    updated: isoToday(),
  };
  if (patch.source !== undefined) {
    const trimmed = patch.source.trim();
    if (trimmed === "") delete next.source;
    else next.source = cleanLine(trimmed, "source");
  }

  await writeNoteFile(next, current.title);
  const all = notes.map((n) => (n.id === id ? next : n));
  await writeIndex(all);
  await appendJournal(journalScopeOf(next.scope), `${next.id} note updated: ${next.title}`);
  await commitData(`note updated: ${next.id} (${next.title})`);
  return next;
}

export function filterByScope(notes: KnowledgeNote[], scope: string): KnowledgeNote[] {
  return notes.filter((n) => n.scope.includes(scope));
}

export async function searchNotes(query: {
  q?: string;
  scope?: string;
  tags?: string[];
  limit?: number;
}): Promise<KnowledgeHit[]> {
  const notes = await listNotes();
  const terms = tokenize(query.q ?? "");
  const wantTags = cleanList(query.tags, "tags", TAG_RE);
  const limit = query.limit && query.limit > 0 ? query.limit : 8;

  const candidates = notes.filter((n) => {
    if (query.scope && !n.scope.includes(query.scope)) return false;
    if (wantTags.length && !wantTags.every((t) => n.tags.includes(t))) return false;
    return true;
  });

  const scored = candidates
    .map((n) => ({ note: n, score: terms.length ? scoreNote(n, terms) : 0 }))
    .filter((r) => (terms.length ? r.score > 0 : true))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.note.updated !== b.note.updated) return a.note.updated < b.note.updated ? 1 : -1;
      return a.note.id.localeCompare(b.note.id);
    })
    .slice(0, limit);

  return scored.map(({ note, score }) => ({
    id: note.id,
    title: note.title,
    summary: note.summary,
    scope: note.scope,
    tags: note.tags,
    updated: note.updated,
    score,
    snippet: terms.length ? snippetFor(note, terms) : note.summary,
  }));
}

export async function knowledgeSection(focusScope?: string): Promise<string> {
  let notes: KnowledgeNote[];
  try {
    notes = await listNotes();
  } catch {
    return "";
  }
  if (!notes.length) return "";

  const total = notes.length;
  const hint =
    `Use search_knowledge to find anything not listed here, and read_note to read one in full. ` +
    `${total} note${total === 1 ? "" : "s"} in the knowledge base.`;

  if (!focusScope) {
    return `\n\n# Knowledge\n${hint}`;
  }

  const scoped = filterByScope(notes, focusScope);
  if (!scoped.length) {
    return `\n\n# Knowledge\nNo notes scoped to ${focusScope}. ${hint}`;
  }
  const shown = scoped.slice(0, FOCUS_LINE_CAP);
  const more =
    scoped.length > shown.length ? `\n(${scoped.length - shown.length} more in this scope)` : "";
  return `\n\n# Knowledge (scope ${focusScope})\n${indexLines(shown).join("\n")}${more}\n${hint}`;
}
