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

Provider profiles live in `planner-data/providers.json`. Three types:

- **claude-subscription** — uses your Claude Pro/Max plan via the Agent SDK (OAuth from `claude login` / `CLAUDE_CODE_OAUTH_TOKEN`). No API key.
- **anthropic-api** — Anthropic API key in `.env.local` (`ANTHROPIC_API_KEY`).
- **openai-compatible** — any endpoint (DeepSeek, OpenRouter, Ollama…) via `baseUrl` + `apiKeyEnv`.

Secrets go only in `.env.local` and are referenced by env-var **name** in `providers.json`, never stored in data files.

## Commands

```bash
npm run dev        # dev server
npm run build      # production build
npm run lint       # next lint
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

## Architecture

All data access goes through `lib/core`. `app/` pages and API routes call `lib/core` only. AI chat tools (`lib/ai/tools.ts`) also delegate to `lib/core`. This keeps the future MCP server (Phase 2) a thin wrapper.

## Coding agents

`planner-data/CLAUDE.md` is the schema contract — Claude Code (and any agent) can read/edit the plan directly. Phase 2 adds a stdio MCP server.
