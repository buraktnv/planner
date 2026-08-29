import type { KnowledgeNote } from "@/lib/core/types";
import { buildDocs, type DocGroup } from "./docs";

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^(#{2,3})\s+(.*)$/;
const NOTE_REF_RE = /\[\[(K-\d{3,})\]\]/g;

export interface TocEntry {
  id: string;
  text: string;
  depth: 2 | 3;
}

export interface DocLink {
  id: string;
  title: string;
  href: string;
}

export interface DocNeighbour {
  id: string;
  title: string;
  href: string;
}

export interface DocPageModel {
  note: KnowledgeNote;
  body: string;
  toc: TocEntry[];
  links: DocLink[];
  backlinks: DocLink[];
  prev: DocNeighbour | null;
  next: DocNeighbour | null;
  groups: DocGroup[];
  scopeKey: string | null;
  charterName: string | null;
}

export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function uniqueId(slug: string, seen: Map<string, number>): string {
  const n = seen.get(slug) ?? 0;
  seen.set(slug, n + 1);
  return n === 0 ? slug : `${slug}-${n + 1}`;
}

export interface Heading extends TocEntry {
  /** 1-based source line, which is what a markdown AST reports. */
  line: number;
}

/**
 * Headings outside fenced code blocks only — a `## ` inside a fence is sample
 * text, not a section of this document.
 *
 * The one scan behind both the on-this-page index and the ids the renderer
 * puts on the headings themselves: derived separately they could disagree, and
 * an index that scrolls nowhere is worse than no index.
 */
export function headingsOf(body: string): Heading[] {
  const seen = new Map<string, number>();
  const out: Heading[] = [];
  let fenced = false;

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const m = HEADING_RE.exec(line);
    if (!m) continue;
    const text = m[2].trim().replace(/\s+#+\s*$/, "");
    if (!text) continue;
    out.push({
      id: uniqueId(slugifyHeading(text), seen),
      text,
      depth: m[1].length === 2 ? 2 : 3,
      line: i + 1,
    });
  }
  return out;
}

export function tocOf(body: string): TocEntry[] {
  return headingsOf(body).map(({ id, text, depth }) => ({ id, text, depth }));
}

/**
 * Heading id by source line. Keyed by position rather than counted as the
 * renderer walks, because React renders a subtree more than once — under
 * StrictMode in development, and whenever it re-renders — and a mutable
 * counter would hand the same heading a different id the second time, which
 * surfaces as a hydration mismatch.
 */
export function headingIdsByLine(body: string): Map<number, string> {
  return new Map(headingsOf(body).map((h) => [h.line, h.id]));
}

export function noteRefsIn(body: string): string[] {
  const out: string[] = [];
  let fenced = false;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    if (FENCE_RE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    for (const m of line.matchAll(NOTE_REF_RE)) {
      if (!out.includes(m[1])) out.push(m[1]);
    }
  }
  return out;
}

/**
 * Turn `[[K-009]]` into a real markdown link. An id with no matching note is
 * left exactly as written — a dangling reference should look dangling, not
 * silently become a link to nothing.
 */
export function linkifyNoteRefs(body: string, titleById: Map<string, string>): string {
  let fenced = false;
  return body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      if (FENCE_RE.test(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      return line.replace(NOTE_REF_RE, (whole, id: string) => {
        const title = titleById.get(id);
        return title ? `[${title}](/knowledge/${id})` : whole;
      });
    })
    .join("\n");
}

function flatten(groups: DocGroup[]): { id: string; title: string }[] {
  return groups.flatMap((g) => g.rows.map((r) => ({ id: r.id, title: r.title })));
}

export function docHref(id: string, scopeKey: string | null): string {
  if (!scopeKey) return `/knowledge/${id}`;
  return scopeKey.startsWith("area:")
    ? `/areas/${scopeKey.slice("area:".length)}/docs/${id}`
    : `/projects/${scopeKey}/docs/${id}`;
}

export function buildDocPage(
  notes: KnowledgeNote[],
  id: string,
  scopeKey: string | null = null,
  charterName: string | null = null,
): DocPageModel | null {
  const note = notes.find((n) => n.id === id);
  if (!note) return null;

  const titleById = new Map(notes.map((n) => [n.id, n.title]));

  const links: DocLink[] = noteRefsIn(note.body)
    .filter((ref) => titleById.has(ref))
    .map((ref) => ({ id: ref, title: titleById.get(ref)!, href: docHref(ref, scopeKey) }));

  const backlinks: DocLink[] = notes
    .filter((n) => n.id !== id && noteRefsIn(n.body).includes(id))
    .map((n) => ({ id: n.id, title: n.title, href: docHref(n.id, scopeKey) }));

  const groups = scopeKey ? buildDocs(notes, scopeKey, charterName ?? scopeKey).groups : [];
  const order = flatten(groups);
  const at = order.findIndex((d) => d.id === id);

  const neighbour = (i: number): DocNeighbour | null =>
    i >= 0 && i < order.length
      ? { id: order[i].id, title: order[i].title, href: docHref(order[i].id, scopeKey) }
      : null;

  return {
    note,
    body: linkifyNoteRefs(note.body, titleById),
    toc: tocOf(note.body),
    links,
    backlinks,
    prev: at > 0 ? neighbour(at - 1) : null,
    next: at >= 0 ? neighbour(at + 1) : null,
    groups,
    scopeKey,
    charterName,
  };
}
