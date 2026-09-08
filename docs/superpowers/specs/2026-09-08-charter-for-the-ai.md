# Spec: where the charter's AI text lives and how it reaches context

Date: 2026-09-08. Planner task T-010.3 (parent T-010). Notes: K-062, K-045, K-009. Status: design, no code.

## The need

The owner wants the centre card of a project map to be the project's core: its purpose, the rules that must never be lost, and the text the assistant should read before touching the project. For the planner itself that text is one sentence: lose nothing, never re-decide what is already decided, and grow the knowledge until an AI reading it scores full marks on the project.

Knowledge notes already have a second reading, the `## For the AI` section (`lib/core/note-sections.ts`). Charters do not.

## Constraint that decides the shape

`parseBody` in `lib/core/schema.ts` throws `CharterParseError` on any `## ` heading other than `## Why`, `## MVP scope` and `## Parking lot`. A fourth section would make every charter carrying it unreadable to an older checkout, and multi-line YAML in the frontmatter does not survive hand editing. So the AI text cannot be a new section or a frontmatter key.

## Proposal

1. **A `### For the AI` sub-heading inside the Why.** Three hashes, so the charter parser never sees it as a section. It runs to the end of the Why. The human part is everything above it.
2. **One pure splitter.** `lib/core/charter-sections.ts`, import-free like `note-sections.ts`: `splitCharterAi(why)` returning `{ human, forAi }` and `withCharterAi(human, forAi)` re-joining them. The heading is a constant. A `### For the AI` inside a fenced code block is not a boundary, same rule as the note splitter.
3. **What each reader sees.**
   - The core card (`buildCoreNode`) and the charter page render the human part only. The AI part is shown on the charter page under a folded `FOR THE AI` disclosure, editable in the same textarea (it is one string on disk).
   - `buildSystemContext` injects the AI part for the focused charter, ahead of the knowledge section, capped at the same per-entry limit as a mention. `get_context` over MCP returns it as a separate `forAi` field beside `why`.
   - `@<slug>` mentions already inject Why; they should inject human Why plus the AI part.
4. **No drift tracking for charters in the first version.** Notes carry `ai_checked` as a hash over the human body. A charter's Why changes rarely and is edited in one textarea beside its AI part, so the drift a hash would catch does not arise the same way. Revisit if a charter's AI part is ever edited by a tool rather than a person.
5. **Token cost.** The owner has accepted it (K-062). The cap keeps it to one card's worth of text.

## Tests to write when built

- `charter-sections.test.ts`: split and re-join are inverses; a heading inside a fence is ignored; a Why with no heading gives an empty `forAi`.
- `context.test.ts`: a focused charter with an AI part puts it in the prompt; without one nothing extra is added.
- MCP `get_context` returns `forAi`.

## Out of scope

Editing the AI part from the canvas popup, and any change to areas beyond what projects get for free (they share the charter type).
