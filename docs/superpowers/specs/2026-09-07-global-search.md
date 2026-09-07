# Global search — a palette over every file

Date: 2026-09-07

## Why

The planner holds everything the owner knows in markdown, and there is no way
to search it. The only search box in the app is on the knowledge page and covers
notes alone (`components/momentum/knowledge/knowledge-view.tsx:124` →
`GET /api/knowledge?q=`). A fact written into a task log, an event note or a
journal line is, in practice, lost the day after it is written.

This adds one Cmd/Ctrl+K palette, openable from any page, over notes, charters,
tasks, task descriptions, task logs, calendar events, daily items and journal
lines. Selecting a result navigates to it.

## The binding constraint

The palette is a client component. A **value** import from it into anything that
reaches `lib/core` drags `simple-git` and `node:fs` into the browser bundle and
fails `npm run build` — the hazard AGENTS.md documents for `CORE_REF`. Vitest
runs in node and will never catch it, so `npm run build` is the only gate.

The module split below exists to make that structurally impossible rather than
merely avoided.

## Modules

### `lib/core/tokens.ts` — new, import-free, pure

Lift out of `lib/core/knowledge.ts` (currently at `:41-44`, `:291`, `:298`):

```ts
export const WEIGHTS = { title: 8, tags: 6, summary: 4, body: 1 } as const;
export const BODY_HIT_CAP = 5;
export const SNIPPET_LEN = 160;
export function tokenize(text: string): string[];
export function countOccurrences(haystack: string[], needle: string): number;
```

`knowledge.ts` imports from here and **re-exports `tokenize`**, so
`lib/ai/classify.ts` and the existing knowledge tests need no edit.
`scoreNote`, `snippetFor` and `searchNotes` stay where they are and keep their
current behaviour exactly — the knowledge page, the `search_knowledge` tool and
`buildSystemContext` must not change. The existing assertions in
`lib/core/__tests__/knowledge.test.ts` are the regression gate on this move.

The file is import-free for the same reason `note-sections.ts` and `status.ts`
are: both the server and the browser bundle need it.

### `lib/core/types.ts` — extended

```ts
export type SearchKind =
  | "note" | "charter" | "task" | "description" | "log"
  | "event" | "habit" | "rhythm" | "meal" | "grocery" | "journal";

export interface SearchItem {
  kind: SearchKind;
  key: string;        // unique and stable, e.g. "log:project/acme-bot/T-007/2026-09-01 14:22"
  title: string;      // never empty
  subtitle: string;   // charter name, id, date — the hint column
  body: string;       // the long searchable text, "" when none, capped
  tags: string[];
  updated: string;    // ISO day, for the tiebreak
  type?: ProjectType; // set for anything charter-bound
  slug?: string;
  taskId?: string;    // dotted subtask ids included
  date?: string;      // journal / event day
}
```

Types live here because a type-only import is erased in the client bundle.

### `lib/view/search.ts` — new, pure, no filesystem

Value-imports only `lib/core/tokens.ts`, `lib/view/task.ts` and
`lib/view/doc.ts` — all three already proven client-safe (`shell.tsx`
value-imports `taskHref`; AGENTS.md records `doc.ts` as value-imported by a
client component).

```ts
export interface SearchHit {
  key: string; kind: SearchKind; title: string;
  hint: string; snippet: string; href: string; score: number;
}
export const KIND_ORDER: readonly SearchKind[];
export const KIND_WEIGHT: Record<SearchKind, number>;
export const BODY_CAP = 4000;

export function searchTerms(q: string): string[];
export function termStrength(tokens: string[], term: string): number;
export function scoreItem(item: SearchItem, terms: string[], phrase: string): number;
export function snippetOf(item: SearchItem, terms: string[]): string;
export function hrefOf(item: SearchItem): string;
export function rankSearch(items: SearchItem[], q: string, limit?: number): SearchHit[];
```

### `lib/core/search-index.ts` — new, the only file touching the filesystem

Reads through `lib/core` primitives directly. **Never `loadWorkspace()`** —
`lib/core` importing `lib/view` inverts the layering, and the card model is work
the index does not need. Modelled on `listMarkedEntries`
(`lib/core/comments.ts:177`), the existing cross-charter aggregating reader.

```ts
export const FRESH_MS = 3_000;
export const MAX_AGE_MS = 60_000;
export const JOURNAL_DAYS = 60;

export async function buildSearchIndex(): Promise<SearchItem[]>;
export async function getSearchIndex(): Promise<SearchItem[]>;
export function invalidateSearchIndex(): void;   // tests only
```

Sources:

| Source | Reader | Items produced |
|---|---|---|
| notes | `listNotes()` | one `note` each: title, summary as subtitle, tags, body |
| charters | `listCharters()` | one `charter` each: name, `why` + `mvpScope` as body |
| tasks | `listTasks(type, slug)` | one `task` per task **and per subtask**, recursing dotted ids |
| descriptions | `listDetailIds()` → `readDetail()` | one `description` per file |
| logs | `listCommentedIds()` → `readComments()` | one `log` per **entry**, `updated` from its stamp |
| events | `listEvents()` | one `event`: title + `note` + `action` |
| daily | `getDaily()` | one item per habit / rhythm / meal / grocery |
| journal | `readJournal(JOURNAL_DAYS)` | one `journal` per line, carrying its date |

**`buildSearchIndex` must be total.** Each source, and each charter within the
task/description/log loop, is wrapped in its own `try/catch` that drops that
slice and continues. One unparseable `tasks.md` must not 500 every search. This
is a deliberate departure from the `parseTasks` stop-the-world contract, which
governs the charter page — where a mis-parse must stop the world — and not a
derived read-only index. Pin it with a test.

### `app/api/search/route.ts` — new, thin

`GET /api/search?q=&limit=` → `{ hits }`. `dynamic = "force-dynamic"`. Follows
`app/api/mentions/route.ts`. No decision lives here, because nothing under
`app/` is testable.

### `components/momentum/search/search-palette.tsx` — new, client

Its **only** import from the search modules is
`import type { SearchHit } from "@/lib/view/search"` — fully erased. Kind labels
are declared locally, the way `mention-picker.tsx:6` declares its own.

## Ranking

Reuse the established weights; widen the match predicate, because the current
scorer is whole-token only and typing "know" must match "Knowledge base".

Per term, the best strength over a field's tokens:

```
exact token equality            1.0
token startsWith(term)          0.7
token includes(term), len >= 3  0.35
otherwise                       0
```

Accumulate per field: `WEIGHTS.title * strength(titleTokens)` +
`WEIGHTS.tags * strength(tagTokens)` +
`WEIGHTS.summary * strength(subtitleTokens)`, and for the body keep the existing
occurrence shape — `WEIGHTS.body * min(countOccurrences(bodyTokens, term),
BODY_HIT_CAP)` for exact hits, `WEIGHTS.body * 0.35` when only a substring hit
exists. Identical to `scoreNote` when every match is exact, which is the point:
the weights are not being redesigned, only the predicate widened.

**Phrase bonus**, applied once rather than per term: title starts with the whole
query → `+10`; title merely contains it → `+6`. This is what makes typing an id
feel instant, and it is required because `tokenize` drops one-character tokens,
so `K-009` would otherwise match only on `009`.

**AND semantics.** If any term scores zero across every field, drop the item.
`scoreNote` is effectively OR, which is right for AI retrieval (recall) and
wrong for a palette (precision). This is the one deliberate divergence, and it
is why the palette gets its own scorer instead of widening the shared one.

**Kind weight**, a final multiplier so a one-word grocery row does not outrank a
note whose title matches: charter 1.05, note 1.0, task 1.0, event 0.9,
description 0.8, log 0.7, habit/rhythm/meal 0.7, grocery 0.6, journal 0.5.

**Tiebreak**, total and deterministic: score desc → `KIND_ORDER` index →
`updated` desc → `key` localeCompare.

**Snippet.** Follow `snippetFor`: a `SNIPPET_LEN` window around the first
matching term, ellipses either side; fall back to `subtitle` when the match is
in the title or the body is empty.

Do **not** dedupe a task against its description and log. They carry different
badges and different snippets, and the snippet is the reason the row is useful.

## Index cost and caching

Roughly 250–350 file reads over ~157 files; 80–250 ms cold. Too slow per
keystroke, cheap enough every few seconds.

Module-scope cache, two-tier freshness, plus in-flight deduplication:

1. age < `FRESH_MS` → return the cached array, zero filesystem work.
2. `FRESH_MS` ≤ age < `MAX_AGE_MS` → compute a cheap stamp; if unchanged, reset
   `builtAt` and reuse.
3. age ≥ `MAX_AGE_MS` → rebuild unconditionally.
4. A rebuild is held in an `inFlight` promise so racing keystrokes do one build.

**The stamp is what tolerates the MCP process.** Two `fs.stat` calls —
`mtimeMs + size` of today's journal file and of `<dataRoot>/.git/index`. Every
`lib/core` write from *either* OS process ends in `appendJournal` and
`commitData` (whose `git add -A` touches the index), so any machine write
invalidates within 3 s for the cost of two stats. A **hand edit** of a markdown
file in an editor touches neither, which is exactly why `MAX_AGE_MS` exists as a
hard ceiling. Worst-case staleness: 3 s machine, 60 s hand — invisible in a
palette, and the cache is derived state, never truth, so a stale hit simply
lands on a page that reports the truth.

Writers must **not** call `invalidateSearchIndex()`. It would couple every
`lib/core` writer to the search module and would not help the case that actually
matters — the separate MCP process, which has its own module scope. It is
exported for tests only. (AGENTS.md's warning about `lib/ai/pending.ts` concerns
*authoritative* in-memory state; this is a validated cache of data on disk.)

The palette fires `q=""` on open so the cold build overlaps the first
keystrokes; `rankSearch("")` returns `[]`.

## Hrefs

`hrefOf` is an exhaustive `switch` over `SearchKind` with a `never` assertion —
no `default` branch, so a new kind without a link is a compile error. This is
the `previewRow` lesson in AGENTS.md, written after a bare `else` mis-previewed
a new action kind.

| Kind | href |
|---|---|
| `note` | `docHref(id, null)` → `/knowledge/<id>` |
| `charter` | `/projects/<slug>` or `/areas/<slug>` |
| `task` `description` `log` | `taskHref(type, slug, taskId)` |
| `event` | `/calendar` |
| `habit` `rhythm` `meal` `grocery` | `/daily` |
| `journal` | `/settings/activity#j-<date>` |

A note uses the **unscoped** form deliberately: a note's scope is a list, so a
global palette has no single right answer — the same choice `mentionHref` makes.

Journal lines have no page of their own; `/settings/activity` already renders
the recent days grouped by day, so give each day block `id={`j-${date}`}` and
the fragment lands on it. One attribute, no new route, and the row becomes
navigable rather than dead.

Events point at `/calendar` with no per-event target; `CalendarView` reads no
query param today and inventing one is out of scope. The hint column carries the
date.

`?from=` is appended **in the component**, not in `lib/view/search.ts` — `lib/`
has no `window`. For task, description and log rows the palette pushes
`${hit.href}?from=${encodeURIComponent(location.pathname + location.search)}`,
matching `openCard` (`shell.tsx:42`), or the task page's back link breaks.

## Wiring

`components/momentum/shell.tsx` is the only global client-state owner. Add
`searchOpen` beside the existing `composer` state, an `openSearch` callback on
`MomentumApi` (`components/momentum/context.tsx`), one `useEffect` registering a
`window` keydown listener (bubble phase), and
`{searchOpen && <SearchPalette onClose={…} />}` copying the existing
`{composer && <Composer …/>}` pattern.

The handler requires `metaKey || ctrlKey`, rejects `altKey`/`shiftKey`, matches
`e.key.toLowerCase() === "k"`, and calls `preventDefault()` — which suppresses
Chrome's own Ctrl+K and the readline kill-line in a textarea.

**Reuse `components/momentum/dialog.tsx`; do not roll Escape handling.** Dialog
listens on `document` in capture phase and `stopPropagation()`s Escape, which is
the only thing that stops an Escape closing the palette *and* clearing the
canvas selection behind it (`canvas-view.tsx:411` listens on `window`, bubble).
Cmd+K is not Escape, so neither existing handler interferes.

Guard with `if (composer) return;` — two Dialogs mounted at once each install a
Tab trap on `document` and fight over the focus ring.

Dialog autofocuses the first `input`, so the search box needs no `autoFocus`.
Call `onClose()` **after** `router.push` on Enter.

Palette internals: `q`, `hits`, `selected`, `loading`; 120 ms debounce; one
`AbortController` per request and a monotonic `seq` ref so an out-of-order
response is discarded; Arrow/Home/End/Enter on the input, with
`scrollIntoView({ block: "nearest" })` on the selected row; `selected` reset to
0 whenever `hits` changes; an empty query renders a one-line hint, not a
spinner. Markup follows `mention-picker.tsx` — `role="listbox"`,
`role="option" aria-selected`, mono kind badge, truncated label, mono hint.

Add a `⌘K` chip to `components/momentum/sidebar.tsx` calling `openSearch()`.
Without it the feature is invisible.

## Tests

`lib/view/__tests__/search.test.ts` — pure, no fixtures:
weight ordering preserved (title > tags > summary > body); prefix "know" matches
"Knowledge base"; exact > prefix > substring as a strict ordering; a two-char
substring does not match; multi-term is AND; the phrase bonus puts a
starts-with title above a contains title; an id query (`T-007`, `K-009`) finds
its item despite dropped one-char tokens; empty and whitespace queries return
`[]`; `limit` respected; kind weight keeps an exact grocery below an exact note;
the tiebreak is deterministic; `snippetOf` centres on the first matching term
and falls back to the subtitle; **`hrefOf` is exhaustive over every
`SearchKind`**; an area task gives `/areas/…` and a dotted subtask id survives;
no hit ever has an empty title or href.

`lib/core/__tests__/search-index.test.ts` — temp `PLANNER_DATA_DIR`, `acme-*`
fixtures only (this repo is public):
expected per-kind counts from a small fixture repo; a note carries title,
summary, tags and body; a subtask gets its own item with the dotted id; a task
with a description yields both rows with distinct keys; three log entries in one
file become three items with their own stamps; an empty data dir builds an empty
index without throwing; **a charter with an unparseable `tasks.md` drops only
that charter's tasks** while notes and other charters survive; `body` truncated
at `BODY_CAP`; two calls inside `FRESH_MS` return the same array identity and do
one build; a direct journal append (simulating the MCP process, not through a
writer) is picked up after `FRESH_MS`; an unchanged tree past `FRESH_MS` does
not rebuild; past `MAX_AGE_MS` it rebuilds anyway; concurrent calls share one
build; `invalidateSearchIndex()` forces a rebuild.

`lib/core/__tests__/knowledge.test.ts` stays byte-for-byte unchanged — it is the
regression gate on the `tokens.ts` extraction.

## Definition of done

`npm run lint && npm run typecheck && npm test` green, **and `npm run build`**,
which is the only check for the client-bundle hazard.
