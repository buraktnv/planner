/**
 * The scoring primitives, import-free so both the server and the browser
 * bundle can have them — the same reason `note-sections.ts` and `status.ts`
 * are import-free. `lib/view/search.ts` is value-imported by a client
 * component's tree, and anything reaching `lib/core/knowledge.ts` would drag
 * `node:fs` and `gray-matter` in with it.
 */

export const WEIGHTS = { title: 8, tags: 6, summary: 4, body: 1 } as const;
export const BODY_HIT_CAP = 5;
export const SNIPPET_LEN = 160;
/**
 * How much of one item's long text the search index keeps. It lives here
 * rather than beside the ranker because the writer of the index is in
 * `lib/core`, which may never import `lib/view`.
 */
export const BODY_CAP = 4000;

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

export function countOccurrences(haystack: string[], needle: string): number {
  let n = 0;
  for (const t of haystack) if (t === needle) n++;
  return n;
}
