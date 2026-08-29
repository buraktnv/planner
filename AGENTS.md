# AGENTS.md — Planner

Local-first planner web app: tracks dev projects and life areas via markdown + git, surfaces "what to do next and why", and integrates AI (web chat with tool calls, MCP server for coding agents).

Spec: `docs/superpowers/specs/2026-08-27-planner-design.md`

## Two-repo layout

- This repo (`planner`): app code only. May become public/open source later — **never commit personal data here**.
- `planner-data` repo: all user data (markdown). Path configured via `PLANNER_DATA_DIR` env var (default `../planner-data`). Git auto-commits happen there, not here.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm test             # vitest run (all tests)
npm run mcp          # stdio MCP server for coding agents (see docs/mcp.md)
npx vitest run lib/core/schema.test.ts   # single test file
```

All of `lint`, `typecheck`, `test` must pass before considering any change done.

## Architecture rules (non-negotiable)

1. **All data access goes through `lib/core`.** No other code reads or writes the data directory. `app/` routes and components call `lib/core` functions. The future MCP server will wrap `lib/core` too — keep it the single gateway.
2. **AI tools call `lib/core` only.** Tool definitions live near the chat route but their implementations delegate to `lib/core`.
3. **Data root comes from `PLANNER_DATA_DIR`** (resolved in one place in `lib/core`). No hardcoded paths to the data repo.
4. **Secrets only in `.env.local`** (never committed, never written into data files). Provider profiles reference env var names via `apiKeyEnv`, not raw keys.
5. **Every data mutation** goes through `lib/core` write functions, which append a journal entry and git-commit in the data repo. Do not bypass.
6. Test fixtures use generic fake data, never real personal data.

## Data schema quick reference

- Charter files (`projects/<slug>.md`, `areas/<slug>.md`): YAML frontmatter (`id`, `name`, `type`, `status`, `priority`, `mvp`, `repo`, `created`, `updated`) + body sections `## Why`, `## MVP scope`, `## Parking lot`
- Task lines (fixed grammar, parsed by `lib/core/schema.ts`):
  `- [ ] T-007 | M | Title | created:2026-08-27`, subtasks indented with dotted ids (`T-007.1`), done: `- [x] ... | done:2026-08-27`; sections `## Backlog` / `## In progress` / `## Done`
- Optional field keys after the title: `created:` / `est:` / `due:` / `lane:` / `target:` / `waits:` / `done:`
- `lane:` is one of `quick` | `deep` | `wait` | `some` — the Board's four columns. It is optional; when absent `laneOf()` in `lib/core/lanes.ts` derives it (size `S` → quick, otherwise deep). Dragging a card on the Board writes this field.
- `target:` links a task to a charter goal (`target:G-001`). Targets live in the **charter**, not in `tasks.md`, so `parseTasks` validates the *shape* only (`/^G-\d{3,}$/`) and tolerates an id that does not exist — validating existence would let a charter edit make a task file unparseable, and unknown keys are already fatal. Resolution happens in the view layer, where an unknown id simply shows no link. Serialized between `lane:` and `waits:`.
- **Targets and milestones** live inside a charter's `## MVP scope`, which the charter parser treats as an opaque `string[]` and re-emits verbatim — so this needed no schema change. A target line is `- [ ] G-001 | Title — by 30 SEP`; a `### M1 — name` heading above it groups the targets beneath into a milestone. `lib/view/targets.ts` owns all of it: `parseTargetLine` reads an optional `G-nnn | ` prefix (a line without one still parses, it just cannot be linked), `milestonesOf` groups in document order, `nextTargetId` mints from the highest id present, and `targetProgress` computes `done/total` over the tasks naming that id, falling back to the tick when none are linked. A target is never auto-closed when its tasks finish. **`Target.index` is the index into the raw `mvpScope` array** — `toggledScope` writes by it, so headings must occupy slots without being renumbered. `targetsOf` must never throw: it runs inside `loadWorkspace`, where an exception takes down every page. `/targets` renders this as the Roadmap.
- `waits:` is a dependency: either a task id in the **same file** (`waits:T-041`) or free text without ` | ` (`waits:the clinic`). Serialized after `lane:`. An unknown id is tolerated by the parser; `isBlocked()` in `lib/core/deps.ts` then treats it as free text. A done blocker unblocks automatically. Blocked tasks sink to the bottom of the Focus ranking and are never the One Thing.
- A subtask and its parent may sit in **different sections** (completing a subtask moves only that line to `## Done`). The parser resolves parents by dotted id across the whole file, not by position.
- Task detail (`projects/<slug>/details/<task-id>.md`, same for `areas`): the plan behind one task or subtask — free markdown, **no frontmatter and no parser**, read and written by `lib/core/details.ts`. The task line grammar is closed (six keys, `" | "`-delimited, unknown key is a fatal error, `serializeTasks` rewrites the whole file), so detail deliberately lives outside `tasks.md` where it can never corrupt it. The filename carries the id, including dotted subtask ids (`T-007.2.md`). `taskId` is validated against `/^T-\d+(\.\d+)*$/` before it is ever interpolated into a path — it arrives from HTTP routes and AI tools, so this guard is the only thing standing between a caller and the filesystem. Writes go through `withDataLock`, journal, and commit. Because `archiveCharter` renames the whole `<slug>/` directory, details archive and restore with their charter. `listDetailIds()` feeds the `hasDetail` flag on `CardModel`/`SubModel`.
- `archive/projects/<slug>.md` + `archive/projects/<slug>/` (same for `areas`): where `archiveCharter()` moves a charter and its tasks dir. Nothing is ever hard-deleted; the parser never reads `archive/`. Collisions get a `-2`, `-3`, … suffix. Read back — opt-in only, never by `listCharters` — via `listArchived()` / `getArchived()` / `listArchivedTasks()`, and reversed by `restoreCharter()`. An archived charter's frontmatter is **not** rewritten, so it still says `status: active` and keeps its original `id`; living in `archive/` is the only trustworthy archived signal. `restoreCharter` reuses the archiver's collision loop and, when the original slug is occupied, lands on `-2` **and rewrites the frontmatter `id` to match** — two live charters sharing an id would collide in the workspace map and the sidebar. The `/archive` page browses and restores; archiving and restoring are deliberately absent from the AI tools and the MCP allowlist.
- Calendar: `calendar.md` at the data root, no sections, one event per line, kept sorted by date then time on write:
  `- [ ] E-001 | 2026-09-01 | Passport appointment | time:09:40 | note:bring photos | scope:area:admin | action:photos not printed`
  Fixed order is checkbox, id (`E-` + 3+ digits, monotonic), ISO date, title, then optional `time:` (free, ≤ 12 chars) / `note:` / `scope:` (`<project-slug>` or `area:<slug>`) / `action:` (free text = what still needs doing). Parsed by `lib/core/calendar.ts`; `action:` present on an open event is the "needs action" flag.
- `daily/`: four definition files plus one append-only log, parsed by `lib/core/daily.ts`:
  `daily/habits.md` `- H-001 | Walk | goal:4 | unit:× 15 min` (goal is per day, `unit:` optional) · `daily/rhythms.md` `- R-001 | Laundry | per:3` (times per week) · `daily/meals.md` `- M-001 | Lentil soup | servings:2` (live remaining count) · `daily/groceries.md` `- [ ] G-001 | Red lentils | cat:Staples` · `daily/log.md` `- 2026-08-28 09:12 | H-001 | +1` where the delta is `+n`, `-n` or `reset`.
  Ids are `H-`/`R-`/`M-`/`G-` + 3+ digits, monotonic per file. A habit's count for a day and a rhythm's count for the Mon–Sun ISO week are summed from the log, restarting after each `reset`; tapping a row that already meets its goal appends `reset` (wrap-around). Eating a meal decrements `servings:` in place and appends a `-1` log line. `lib/view/daily.ts` builds the `/daily` screen model.
- Knowledge base (`knowledge/`): one note per file, `knowledge/<id>-<title-slug>.md`, parsed by `lib/core/knowledge.ts`. YAML frontmatter `id` (`K-` + 3+ digits, monotonic), `title`, `summary` (single line — the only text ever auto-loaded), optional `scope` (list of project slugs or `area:<slug>`) and `tags` (lowercase slugs), `created`, `updated`, optional `source`; body is free markdown with `[[K-009]]` links. Unknown frontmatter keys are a parse error. The filename is fixed at creation so links never break when a title changes. `knowledge/index.md` is **generated** derived state — one `id | scope | tags | title | summary` line per note, rebuilt on every write, never read as truth. Retrieval is three-tier: `buildSystemContext` loads index lines for the focused scope only (cap 40), `search_knowledge` ranks all notes (title 8 / tags 6 / summary 4 / body 1, capped at 5), `read_note` returns one body plus backlinks. Scopeless notes are searchable but never auto-loaded. Notes filed without a `scope` are categorised automatically by `lib/ai/classify.ts` (AI layer, never `lib/core`): a literal charter slug/name in the text wins for free, otherwise a structured-output model picks one existing scope from a closed list, or proposes a new area. `normaliseScope` repairs and then *rejects* anything not in that list, so an invented scope can never reach the writer. When nothing fits, `createAreaGuarded` may mint one area — refused for generic names (`NEVER_MINT`), slug collisions, near-duplicates, notes too short, or when a week's budget is spent; each mint journals `area auto-created`. `lib/ai/file-note.ts` is the single write path for AI-filed notes (dedupe via `nearDuplicateOf`, daily cap, then `addNote`). `buildSystemContext` takes a third `query` argument — the latest user message, extracted server-side by `lib/ai/recall.ts` — and `knowledgeSection` uses it to surface relevant notes even with no focus; it never returns zero titles. All note and charter writes are serialised by `lib/core/locks.ts` (in-process chain + a cross-process `mkdir` lock in the OS temp dir), because the MCP server is a separate process and duplicate ids brick `listNotes`.

Per-charter docs are the same notes, surfaced per scope. `/projects/<slug>/docs` and `/areas/<slug>/docs` render every note scoped to that charter, grouped by the note's **first** tag (`lib/view/docs.ts`, `PREFERRED_TAGS` = architecture, protocol, decision, runbook, reference; everything else alphabetical; untagged last under "Unfiled"). There is deliberately no second markdown store for documentation and no page tree: a project's docs *are* its scoped notes, so they inherit search, `[[K-009]]` links, AI auto-load and the MCP tools for free. The consequence to know: notes live in `knowledge/`, so they do **not** archive with a charter. `buildDocs` is pure and takes the already-loaded note list; the pages call `getCharter` rather than `loadCharterModel`, which would load the whole workspace to read one name.

Journal distillation (`lib/ai/distill.ts`, `POST /api/knowledge/distill`) turns journal entries into *proposed* notes through the existing `propose_changes` → Accept/Discard card; `add_note` / `update_note` are proposal action kinds, so chat can batch them too. It needs a structured-output provider — the `claude-subscription` path is chat-only. Spec: `docs/superpowers/specs/2026-08-28-knowledge-base.md`
- Journal: `journal/YYYY-MM-DD.md`, appended lines `- HH:mm [project] message`
- Completed work is never pruned — done tasks stay in `## Done` forever. `/done` (`lib/view/done.ts`) groups them into this week / last week / earlier from `doneDate`, with an opt-in toggle that folds in done tasks from archived charters; each charter page carries a collapsed `DONE` disclosure.
- Full contract: `CLAUDE.md` in the `planner-data` repo

## Conventions

- Next.js 15 App Router; server components by default, `"use client"` only when needed
- TypeScript strict; no `any` without a reason
- Tailwind for all styling; no CSS files, no CSS-in-JS
- No code comments unless explicitly requested
- Before adding any dependency, check `package.json` and prefer what is already there
- Approved libraries: `ai` (Vercel AI SDK), `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`, `@anthropic-ai/claude-agent-sdk`, `recharts`, `gray-matter`, `simple-git`, `vitest`, `@modelcontextprotocol/sdk`, `tsx`
- Components: small, one purpose per file; page-specific components colocated under `app/<route>/`
- A task opens as a **page**, not a dialog: `/projects/<slug>/tasks/<task-id>` and `/areas/<slug>/tasks/<task-id>`, subtasks included (`.../tasks/T-007.2`). `lib/view/task.ts` resolves one from `ws.cards` by reading the root id out of the dotted id, so a subtask is linkable without a card of its own. Every card click still goes through `openCard` in `shell.tsx`, which now navigates and stamps `?from=<current path>`; the page's back link uses that, falling back to the charter. `safeBackPath` rejects anything not starting with a single `/`, since `from` is attacker-controllable in a pasted URL. Dialogs remain for the composer only.
- **A task id is always a link to that task.** `TaskIdLink` (`components/momentum/task-id.tsx`) renders it wherever an id is shown, and a bare `T-003` written in a task plan is linkified by `linkifyTaskRefs` (`lib/view/task-refs.ts`) — but only for ids that exist in that charter, and never inside code, since a plan usually quotes a raw task line as a *sample*. An unresolvable id is left as plain text, exactly like a dangling `[[K-404]]`. Ids with no page to open — archived tasks, and proposal rows for tasks that do not exist yet — stay plain. `Markdown` sends in-app hrefs through `next/link` in the same tab and only external ones to a new tab.
- **Canvas** (`/canvas`): notes as cards on a pannable, zoomable surface, read at three depths — canvas → popup → full page. Positions live in `canvas/knowledge.md` (global, because notes do not archive with a charter and a note's scope is a list); per-charter surfaces will live at `projects/<slug>/system.md` and `projects/<slug>/canvas.md`, inside the charter directory so `archiveCharter` carries them along like `details/`. Grammar is `- <ref> | x:0 | y:0` under `## Nodes` and `- A > B | kind:requires` under `## Edges`; a node has no id of its own (it *is* the note or task) and an edge is keyed by the `(from, kind, to)` triple, so duplicates are impossible without minting ids two processes would race on. `parseCanvas` is **total — it never throws** and round-trips anything it does not understand, because this file is machine-written, touched by two processes, and only records where cards sit; contrast `parseTasks`, where a mis-parse must stop the world. Stale refs are surfaced as `orphans` and only removed by an explicit `pruneCanvas`. Every writer re-reads **inside** `withDataLock` and merges by ref, or a concurrent MCP write would be clobbered; drags are client-side and flush as one batch, so a gesture costs one commit, not one per pixel. Geometry lives in the pure `lib/view/canvas-layout.ts` (`autoLayout` is deterministic and only ever places *unsaved* nodes, so a saved position always wins) because the client engine cannot be unit-tested here. Three surfaces share one engine: `/canvas` (all notes), `/canvas/<type>/<slug>/system` (a charter's notes as **components**, with hand-drawn `requires`/`triggers` arrows and a delegate control), and `/canvas/<type>/<slug>` (tasks grouped by milestone, arrows derived from the subtask tree and `waits:`).
- **A component is a knowledge note that appears on a system map** — nothing marks it as one in the note itself, exactly as living in `archive/` is the only trustworthy archived signal. `note:K-020` is the eighth task field key and mirrors `target:` in every respect (shape-only validation, unknown id tolerated, serialized between `target:` and `waits:`); it is what makes `noteProgress` real and what the delegate control writes. A component is never auto-completed when its tasks finish. `list_components` exposes the graph over MCP, because an arrow meaning "camera control must exist before YOLO nano" is knowledge, and knowledge only the canvas can see is knowledge the assistant cannot use.
- Subtasks are created from the task page's "Add a subtask" row (`parentId` on `POST .../tasks`, the same call the composer's STEPS box makes), at any depth. There is no separate subtask composer.

## Testing

- `lib/core` changes require tests in `lib/core/__tests__/` (vitest)
- Markdown round-trip is the highest-risk code: parse → serialize → parse must be identity
- Malformed task lines must throw clear errors, never silently corrupt

## Definition of done

`npm run lint && npm run typecheck && npm test` all green, rules above respected.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

Summarize in plain language for a non-expert reader, jargon only where it's load-bearing