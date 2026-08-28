# Planner

Local-first planner web app. Tracks dev projects **and** life areas via markdown + git, surfaces "what to do next and why", and integrates AI (web chat with tool calls, plus an MCP server for coding agents — Phase 2).

Two private repos:

- **`planner`** (this repo) — the app code only. May become open source later; it never contains personal data.
- **`planner-data`** — all your markdown data (charters, tasks, journal, provider profiles). Stays private. Located via `PLANNER_DATA_DIR`.

## Setup

```bash
# 1. install
npm install

# 2. point at your data repo
cp .env.local.example .env.local
#   edit PLANNER_DATA_DIR to the path of your planner-data repo (default: ../planner-data)

# 3. run
npm run dev      # http://localhost:3000
```

Every data change auto-appends a journal line and git-commits in `planner-data`, so "what happened last week" is always recoverable.

## AI chat providers

Provider profiles live in `planner-data/providers.json`. A profile is also a **favourite**: the model you picked from a source, ready to use in chat.

| type | key | notes |
| --- | --- | --- |
| `claude-subscription` | none | your Claude Pro/Max plan via the Agent SDK (OAuth from `claude login` / `CLAUDE_CODE_OAUTH_TOKEN`); model is `opus` / `sonnet` / `haiku` |
| `openrouter` | `OPENROUTER_API_KEY` | fixed base URL `https://openrouter.ai/api/v1`, pay-per-use, full public model list |
| `deepseek` | `DEEPSEEK_API_KEY` | fixed base URL `https://api.deepseek.com/v1`, prepaid balance |
| `anthropic-api` | `ANTHROPIC_API_KEY` (or `apiKeyEnv`) | direct Anthropic API |
| `openai-compatible` | `apiKeyEnv` | any other endpoint (Ollama, a local proxy…) via `baseUrl` |

`openrouter` and `deepseek` have their base URL baked in — `baseUrl` is rejected on those types. Every profile may carry an optional `effort` (`low` / `medium` / `high` / `xhigh` / `max`); absent means the provider's own default. Claude honours all five, OpenAI-style APIs get `xhigh`/`max` clamped to `high`.

Settings has three panels:

- **Sources** — one row per source with a connected pill (driven by whether the env var is set — never its value), the env var to set, and the model + effort for the subscription.
- **Catalog** — the OpenRouter / DeepSeek model lists (`GET /api/models?source=…`, cached an hour) with search, filter chips and a ★ that adds or removes a favourite.
- **Favourites** — every profile with its effort select, the default radio and delete.

In the chat rail, "Inspect context" lists the favourites; the small pill next to each cycles its effort for the next message. The chosen favourite and effort are remembered in `localStorage`.

Secrets go only in `.env.local` and are referenced by env-var **name** in `providers.json`, never stored in data files.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # next lint
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

## Screens

The UI implements the **Momentum v2** design: a warm light theme, a collapsible left sidebar, and an assistant rail pinned to the right of every screen.

| Route | Screen | What it shows |
| --- | --- | --- |
| `/` | Focus | Mood strip (logged to the journal), the day's plan, the single next action with a 25-minute timer, the ranked rest, streak rings |
| `/board` | Board | Four lanes — quick win / deep work / waiting / someday. Drag a card to move it; the lane is saved on the task line |
| `/branches` | Branches | Trunk, Flow and Map views of a project's tasks and subtasks |
| `/projects`, `/projects/<slug>` | Projects | Progress rings per project; detail with lane columns |
| `/life`, `/areas/<slug>`, `/targets` | Life | Areas, their tasks, and targets (charter `## MVP scope` lines) |
| `/calendar` | Calendar | Month grid and grouped list built from task `due:` dates |
| `/insights` | Dashboard | Distance to MVP per project, momentum over recent weeks, open-work split |
| `/review` | Review | Weekly numbers plus an on-demand AI read of the week |
| `/journal` | Activity | The journal, newest first |
| `/agents` | Agents | Sources with their connection state and the tools the assistant may call |
| `/settings` | Settings | Sources, model catalog, favourites and the general context (`about.md`) |

The assistant rail has four modes (Plan / Straight / Reflect / Target) that change the system prompt, a scope selector that follows the screen by default, and an **Inspect context** panel showing exactly what is being sent — including `about.md`, which you can edit in place.

## Architecture

All data access goes through `lib/core`. `app/` pages and API routes call `lib/core` only. AI chat tools (`lib/ai/tools.ts`) also delegate to `lib/core`. This keeps the future MCP server (Phase 2) a thin wrapper.

Presentation derives from two read-only view builders that sit on top of `lib/core` and hold no data access of their own: `lib/view/workspace.ts` (charters, cards, subtasks, progress) and `lib/view/focus.ts` (ranking and the reasons shown next to each task). Design tokens and shared helpers live in `lib/ui/momentum.ts`; screen-agnostic UI primitives in `components/momentum/primitives.tsx`.

Client components must never import `lib/core` (or anything that reaches it, such as `lib/ai/tool-map.ts`) — it pulls `simple-git` and `node:fs` into the browser bundle. Pass data in from a server component instead.

## Coding agents

`planner-data/CLAUDE.md` is the schema contract — Claude Code (and any agent) can read/edit the plan directly. Phase 2 adds a stdio MCP server.
