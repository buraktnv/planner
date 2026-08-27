# Planner — Design Spec

Date: 2026-08-27
Status: Approved

## Problem

The owner works on multiple projects (ftbot, savings-app, job-search-automation, quizra-mobile-app, Responsive-Bot, pomodoro) and has these problems:

1. Cannot control/track progress on developments
2. Sometimes doesn't know what to do next
3. Loses track of what happened last week
4. Work feels heavy when seen as a whole; needs splitting into small trackable pieces
5. Forgets what he is doing and why; drifts out of scope (over-investing in non-MVP work)
6. Needs AI integrated: web chat area with graphics/charts
7. Needs coding agents (Claude Code first) to communicate with the planner via MCP
8. Wants any API provider usable in chat (DeepSeek, OpenRouter, local models, etc.)

## Solution Overview

A local-first web app using markdown files + git as the data layer. It tracks dev projects AND life areas, always surfaces what to do next and why, and integrates AI two ways:

- Web chat area: Claude via the owner's Pro/Max subscription (Agent SDK, no API key), Anthropic API key, or any OpenAI-compatible endpoint
- Coding agents: Claude Code edits the markdown data directly (schema contract via `data/CLAUDE.md`); later a stdio MCP server wraps the same core library

## Repository Split

Two private GitHub repos:

- `planner` — the app (Next.js). May become public/open source later, so it must never contain personal data.
- `planner-data` — all markdown data. Stays private (life context, journals). The app locates it via `PLANNER_DATA_DIR` env var (default: `../planner-data` relative to the app repo).

All git auto-commits happen in the data repo. The app repo contains only generic sample fixtures for tests.

## Data Model

All data lives in the `planner-data` repo. Markdown + YAML frontmatter, versioned by git. Every write goes through `lib/core`, which auto-appends a journal entry and commits in the data repo.

### Layout (planner-data repo root)

```
projects/<slug>.md            charter file
projects/<slug>/tasks.md      task list
areas/<slug>.md               life area charter (same shape as project charter)
areas/<slug>/tasks.md         life area tasks
about.md                      owner's life context, always in AI context
journal/YYYY-MM-DD.md         daily log, auto-appended
providers.json                AI provider profiles (no secrets)
CLAUDE.md                     schema contract for Claude Code
```

### Charter file (project or area)

```markdown
---
id: ftbot
name: FTBot
type: project          # project | area
status: active         # active | paused | done | abandoned
priority: 1
mvp: "One-line MVP definition"
repo: ../ftbot         # optional, relative path to code repo
created: 2026-08-27
updated: 2026-08-27
---

## Why
Motivation. Always fed to AI context. Prevents drift.

## MVP scope
- [ ] scope item

## Parking lot
Out-of-scope ideas captured so they are not lost.
```

Areas omit `mvp`; instead they may carry standards/goals in the body.

### tasks.md

One line per task, machine-parseable, fixed grammar:

```
- [ ] <id> | <size S|M|L> | <title> | created:<date>[ | est:<dur>][ | due:<date>]
```

- Subtasks are indented child lines with dotted IDs (`T-007.1`)
- Done: `- [x] <id> | <size> | <title> | done:<date>`
- Sections: `## Backlog`, `## In progress`, `## Done`
- Rules: every task has a size; oversized tasks (L) must be decomposed into children; task IDs are unique per project, monotonically increasing

### Journal

`data/journal/YYYY-MM-DD.md`. Lines appended automatically on every mutation:

```
- 14:03 [ftbot] T-007 done: Add chart for Y
- 14:10 [chat] AI created task T-012 in ftbot
```

Manual and AI notes are also appended here. Weekly review = journal files + git log for the range.

### providers.json

```json
{
  "profiles": [
    { "id": "claude-sub", "type": "claude-subscription", "model": "claude-sonnet-4-5", "label": "Claude (my plan)" },
    { "id": "deepseek", "type": "openai-compatible", "baseUrl": "https://api.deepseek.com/v1", "model": "deepseek-chat", "apiKeyEnv": "DEEPSEEK_API_KEY" },
    { "id": "ollama", "type": "openai-compatible", "baseUrl": "http://localhost:11434/v1", "model": "qwen3", "apiKeyEnv": "" }
  ],
  "default": "claude-sub"
}
```

Secrets live only in `.env.local`, referenced by `apiKeyEnv`. Never stored in data files.

## Tech Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Vercel AI SDK (`ai`) for streaming chat + tool calls
- Provider adapters: `@anthropic-ai/claude-agent-sdk` (subscription auth via OAuth token from `claude setup-token`, env `CLAUDE_CODE_OAUTH_TOKEN`), `@ai-sdk/anthropic` (API key), `@ai-sdk/openai-compatible` (any endpoint)
- Recharts for charts
- gray-matter for frontmatter parsing, simple-git for auto-commits
- Vitest for tests, ESLint (`next lint`) + `tsc --noEmit` as quality gates

## Architecture

```
app/            Next.js pages + API routes (thin)
lib/core/       The ONE library for data access
  schema.ts     parse/serialize charter + task grammar
  store.ts      CRUD: projects, areas, tasks, about, providers
  journal.ts    append entries
  git.ts        auto-commit on write
  insights.ts   stats: velocity, done-vs-created, stalled, per-project time
app/api/chat/   streaming chat route; AI tools call lib/core only
```

Rule: no code outside `lib/core` reads or writes data files directly (except static rendering reads in server components, which use `lib/core` readers anyway). `lib/core` resolves the data root from `PLANNER_DATA_DIR`. This keeps the future MCP server thin: it just exposes `lib/core` functions as tools.

## AI Chat

- Always-included context: `about.md` + focused project/area charter (Why, MVP, parking lot) + its open tasks + last 7 journal days. Owner picks the focus per chat.
- Tools (all call `lib/core`): `list_projects`, `list_areas`, `get_context`, `create_project`, `create_area`, `create_task`, `update_task`, `decompose_task`, `complete_task`, `move_to_parking_lot`, `add_journal`, `next_actions`, `weekly_summary`
- System prompt instruction: flag work that looks out of scope vs the charter's MVP definition and suggest moving it to the parking lot; prefer small tasks; when asked "what should I do next", use `next_actions` and rank by priority, deadlines, size, and life context
- Chat UI: streaming, tool-call cards ("Created task T-012 in ftbot"), provider/model switcher, context picker

## Pages

| Page | Purpose |
|---|---|
| Today / Next | Ranked next actions across projects + areas, focused project's Why snippet, quick-capture box, live journal stream |
| Projects | Cards with progress bars; detail: charter + task board (Backlog / In progress / Done) + decompose |
| Areas | Same for ongoing life areas |
| Journal | Timeline view of journal entries |
| Insights | Charts: tasks done/week, done vs created, time per project, stalled projects (no movement 14 days), life-area balance; plus AI weekly analysis block |
| Chat | AI chat area as described above |
| Settings | Provider profile management (base URL, model, apiKeyEnv, default) |

## Coding Agent Integration

- Phase 1 (no code): `data/CLAUDE.md` contract documents the file schema so Claude Code can read/update the plan directly
- Phase 2: stdio MCP server (`@modelcontextprotocol/sdk`, TypeScript) wrapping `lib/core`; `.mcp.json` in repo root for Claude Code; works with opencode/Cursor too

## Build Phases

1. MVP: steps 1-9 (scaffold, core lib with tests, UI pages, AI chat, journal, insights, dogfood real data)
2. MCP server + weekly review polish
3. Planned inside the app itself: habits/routines, calendar integration, mobile/PWA

## Quality Gates

- Vitest on `lib/core` (markdown round-trip parsing is the highest-risk code): parse -> serialize -> parse identity, task grammar edge cases
- `next lint` and `tsc --noEmit` pass at every step
- Task grammar enforced by parser (rejects malformed lines with clear errors)

## Out of Scope (MVP)

Habits, calendar sync, multi-user, deployment/hosting, mobile. Parked for phase 3+, to be planned inside the app itself.

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Storage | Markdown + git in a separate `planner-data` repo | Agent-friendly, free history ("last week" = git log + journal), revertable; app repo can go open source without leaking personal data |
| Repo split | `planner` (app) + `planner-data` (data), both private | Clean separation; `PLANNER_DATA_DIR` env var points the app at the data repo |
| Interface | Local web app | Chat area + graphics requirement |
| AI capabilities | Chat + actions (tool calls) | Fixes "I don't know what to do" directly |
| Providers | claude-subscription + anthropic-api + openai-compatible | Owner has Pro/Max (no API key needed for Claude); wants DeepSeek etc. |
| Stack | Next.js 15 + AI SDK + Tailwind | Matches owner's existing skills (savings-app, ftbot) |
| MVP slice | Tracker core + AI chat | Daily value from day one; MCP is thin follow-up |
| Life planning | Areas + about.md + global Next panel in MVP; habits/calendar later | Same engine, small addition; future work planned in-app |
| Analytics | Insights page: charts + AI weekly analysis | Owner needs visible analysis at a glance |
