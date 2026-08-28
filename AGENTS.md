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
- Optional field keys after the title: `created:` / `est:` / `due:` / `lane:` / `waits:` / `done:`
- `lane:` is one of `quick` | `deep` | `wait` | `some` — the Board's four columns. It is optional; when absent `laneOf()` in `lib/core/lanes.ts` derives it (size `S` → quick, otherwise deep). Dragging a card on the Board writes this field.
- `waits:` is a dependency: either a task id in the **same file** (`waits:T-041`) or free text without ` | ` (`waits:the clinic`). Serialized after `lane:`. An unknown id is tolerated by the parser; `isBlocked()` in `lib/core/deps.ts` then treats it as free text. A done blocker unblocks automatically. Blocked tasks sink to the bottom of the Focus ranking and are never the One Thing.
- A subtask and its parent may sit in **different sections** (completing a subtask moves only that line to `## Done`). The parser resolves parents by dotted id across the whole file, not by position.
- `archive/projects/<slug>.md` + `archive/projects/<slug>/` (same for `areas`): where `archiveCharter()` moves a charter and its tasks dir. Nothing is ever hard-deleted; the parser never reads `archive/`. Collisions get a `-2`, `-3`, … suffix.
- Calendar: `calendar.md` at the data root, no sections, one event per line, kept sorted by date then time on write:
  `- [ ] E-001 | 2026-09-01 | Passport appointment | time:09:40 | note:bring photos | scope:area:admin | action:photos not printed`
  Fixed order is checkbox, id (`E-` + 3+ digits, monotonic), ISO date, title, then optional `time:` (free, ≤ 12 chars) / `note:` / `scope:` (`<project-slug>` or `area:<slug>`) / `action:` (free text = what still needs doing). Parsed by `lib/core/calendar.ts`; `action:` present on an open event is the "needs action" flag.
- `daily/`: four definition files plus one append-only log, parsed by `lib/core/daily.ts`:
  `daily/habits.md` `- H-001 | Walk | goal:4 | unit:× 15 min` (goal is per day, `unit:` optional) · `daily/rhythms.md` `- R-001 | Laundry | per:3` (times per week) · `daily/meals.md` `- M-001 | Lentil soup | servings:2` (live remaining count) · `daily/groceries.md` `- [ ] G-001 | Red lentils | cat:Staples` · `daily/log.md` `- 2026-08-28 09:12 | H-001 | +1` where the delta is `+n`, `-n` or `reset`.
  Ids are `H-`/`R-`/`M-`/`G-` + 3+ digits, monotonic per file. A habit's count for a day and a rhythm's count for the Mon–Sun ISO week are summed from the log, restarting after each `reset`; tapping a row that already meets its goal appends `reset` (wrap-around). Eating a meal decrements `servings:` in place and appends a `-1` log line. `lib/view/daily.ts` builds the `/daily` screen model.
- Knowledge base (`knowledge/`): one note per file, `knowledge/<id>-<title-slug>.md`, parsed by `lib/core/knowledge.ts`. YAML frontmatter `id` (`K-` + 3+ digits, monotonic), `title`, `summary` (single line — the only text ever auto-loaded), optional `scope` (list of project slugs or `area:<slug>`) and `tags` (lowercase slugs), `created`, `updated`, optional `source`; body is free markdown with `[[K-009]]` links. Unknown frontmatter keys are a parse error. The filename is fixed at creation so links never break when a title changes. `knowledge/index.md` is **generated** derived state — one `id | scope | tags | title | summary` line per note, rebuilt on every write, never read as truth. Retrieval is three-tier: `buildSystemContext` loads index lines for the focused scope only (cap 40), `search_knowledge` ranks all notes (title 8 / tags 6 / summary 4 / body 1, capped at 5), `read_note` returns one body plus backlinks. Scopeless notes are searchable but never auto-loaded. Journal distillation (`lib/ai/distill.ts`, `POST /api/knowledge/distill`) turns journal entries into *proposed* notes through the existing `propose_changes` → Accept/Discard card; `add_note` / `update_note` are proposal action kinds, so chat can batch them too. It needs a structured-output provider — the `claude-subscription` path is chat-only. Spec: `docs/superpowers/specs/2026-08-28-knowledge-base.md`
- Journal: `journal/YYYY-MM-DD.md`, appended lines `- HH:mm [project] message`
- Full contract: `CLAUDE.md` in the `planner-data` repo

## Conventions

- Next.js 15 App Router; server components by default, `"use client"` only when needed
- TypeScript strict; no `any` without a reason
- Tailwind for all styling; no CSS files, no CSS-in-JS
- No code comments unless explicitly requested
- Before adding any dependency, check `package.json` and prefer what is already there
- Approved libraries: `ai` (Vercel AI SDK), `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`, `@anthropic-ai/claude-agent-sdk`, `recharts`, `gray-matter`, `simple-git`, `vitest`, `@modelcontextprotocol/sdk`, `tsx`
- Components: small, one purpose per file; page-specific components colocated under `app/<route>/`

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
