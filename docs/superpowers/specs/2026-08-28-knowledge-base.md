# Knowledge base — a second brain with lazy, scope-aware retrieval

Status: phase 1 implemented, phases 2–3 planned
Date: 2026-08-28

## Problem

The owner wants unbounded personal knowledge in `planner-data` — a second brain — without paying for it in context on every request. Today everything the AI knows is pushed into `buildSystemContext()`: `about.md`, the calendar, daily, the focused charter, and seven days of journal. That grows linearly and cannot hold thousands of notes.

## Principle

**The index is always loaded; the bodies never are.** Retrieval is explicit and scoped:

1. **Tier 1 — always in context.** Index lines for the *focused* project/area only, capped. Typically 20–40 short lines. Flat cost regardless of how large the base grows.
2. **Tier 2 — on demand.** `search_knowledge({ query, scope?, tags? })` ranks every note and returns snippets.
3. **Tier 3 — on demand.** `read_note({ id })` returns one full body plus its backlinks, so the model can walk the graph.

No vector database, no embedding bill, no service. Markdown in git, human-readable, diffable, and every retrieval is explainable — you can see *why* a note matched.

## Storage

```
knowledge/K-014-why-i-left-the-grid-strategy.md
knowledge/index.md          generated — never hand-edited
```

The filename is `<id>-<slug>.md`. The id in the filename is authoritative and never changes; the slug is derived from the title at creation and is cosmetic (renaming a title does not rename the file, so `[[K-014]]` links never break).

```markdown
---
id: K-014
title: Why I abandoned the ftbot grid strategy
scope:
  - ftbot
  - area:trading
tags:
  - strategy
  - postmortem
summary: Grid died on trending markets; fixed spacing cannot survive a breakout.
created: 2026-08-28
updated: 2026-08-28
source: journal 2026-08-21
---

Free markdown. Link other notes as [[K-009]].
```

- **`id`** — `K-` plus at least 3 digits, zero-padded to 3, monotonic across `knowledge/`, never reused.
- **`title`** — required, non-empty, single line.
- **`summary`** — required, non-empty, single line. This is the text that appears in the index, so it is the *only* thing the model sees until it searches. It must state the conclusion, not the topic.
- **`scope`** — optional list; each entry is a project slug or `area:<slug>`. Empty means the note is global (found by search, never auto-loaded).
- **`tags`** — optional list of lowercase slugs.
- **`created` / `updated`** — ISO dates, required. `updated` is bumped on every write.
- **`source`** — optional free text provenance.
- Unknown frontmatter keys are a parse error. Round-trip (parse → serialize → parse) is identity.

### The index

`knowledge/index.md` is regenerated from the note files after every write. It is **derived state**: nothing reads it as truth, so a corrupt or hand-edited index self-heals on the next write.

```
- K-014 | ftbot,area:trading | strategy,postmortem | Why I abandoned the ftbot grid strategy | Grid died on trending markets.
```

Order: `id | scope | tags | title | summary`. Empty scope or tags render as `-`.

## Search

Scoring is deterministic weighted term frequency over lowercased alphanumeric tokens (length ≥ 2):

| Field | Weight |
|---|---|
| title | 8 |
| tags | 6 |
| summary | 4 |
| body | 1 per occurrence, capped at 5 |

`scope` and `tags` arguments are hard filters, not boosts. Ties break by `updated` descending, then id. Each hit carries a snippet: 160 characters of body around the first match, or the summary when the match was in metadata.

**Why not embeddings.** 5,000 notes at 2KB is 10MB; reading and scoring that in Node is 100–300ms on an SSD — well inside a tool call. Keyword + tags + scope covers a personal brain because the owner wrote the words. If recall ever proves insufficient, add embeddings as a *hybrid* re-rank layer over these candidates (phase 3), not as a replacement.

## Store API — `lib/core/knowledge.ts`

Pure functions: `parseNote`, `serializeNote`, `nextNoteId`, `noteFileName`, `indexLines`, `scoreNote`, `backlinksOf`.

Async store: `listNotes`, `getNote`, `addNote`, `updateNote`, `searchNotes`, `writeIndex`.

Every mutation journals and commits, per architecture rule 5. The journal scope is the first `scope` entry with any `area:` prefix stripped, or `knowledge` when the note is global.

## Tools (chat + MCP)

| Tool | Kind | Purpose |
|---|---|---|
| `search_knowledge` | read | Ranked snippets. Filters by scope and tags. |
| `read_note` | read | One full note plus backlinks. |
| `add_note` | write | File a new note. |
| `update_note` | write | Amend a note; bumps `updated`. |

`search_knowledge` and `read_note` join `READ_TOOLS`; `add_note` and `update_note` join `WRITE_TOOLS`. Coding agents on the MCP server therefore file knowledge as they work — which is the point, since the failure mode of a second brain is that nothing gets written to it.

## System context

`buildSystemContext()` gains a `# Knowledge` section:

- **Focused:** index lines for notes scoped to the focused project/area, capped at 40, followed by the total note count and an instruction to use `search_knowledge` for anything else.
- **Unfocused:** the count and the instruction only. No lines.

Notes with no scope are never auto-loaded.

## HTTP API

- `GET /api/knowledge` — `?q=` search, `?scope=`, `?tags=` (comma-separated), `?limit=`. Without `q` it lists index rows.
- `POST /api/knowledge` — create.
- `GET /api/knowledge/[id]` — full note plus backlinks.
- `PATCH /api/knowledge/[id]` — amend.

## Phases

**Phase 1 (this spec, built).** Schema, parser, store, search, index generation, the four tools wired into chat and MCP, the system-context section, and the HTTP API.

**Phase 2.** A `/knowledge` page: browse by scope and tag, full-text box, note editor, backlinks panel, and "file this" from a journal line.

**Phase 3.** Journal distillation — a weekly pass that reads the journal and *proposes* notes through the existing `propose_changes` → Accept/Discard card, so the owner reviews rather than authors. Then optional embedding re-rank if keyword recall proves insufficient.
