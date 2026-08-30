# Planner

A local-first planner for people running several projects at once. It tracks
dev projects **and** life areas as plain markdown in a git repo, always answers
"what should I do next and why", and lets both a web chat and your coding agents
work on the same plan.

Why markdown and git rather than a database: a coding agent can read and write
your plan directly with no schema to learn, "what happened last week" is
`git log`, and a bad AI write is one `git reset` away. The costs are real and
accepted — every mutation rewrites a file and makes a commit, and there are no
transactions. See `docs/superpowers/specs/2026-08-27-planner-design.md`.

## Two repos, on purpose

- **`planner`** (this repo) — application code. Contains no personal data, which
  is what makes it publishable.
- **`planner-data`** — *your* data: charters, tasks, journal, notes, provider
  profiles. A separate repo you create and keep private, located via
  `PLANNER_DATA_DIR`. Its schema contract lives in a `CLAUDE.md` at its root.

You will not find a `planner-data` here. Create one — an empty git repo is
enough to start; the app writes the structure as you use it.

## Read this before you deploy it

**There is no authentication.** This is a single-user app designed to run on
your own machine, and it holds provider API keys in `.env.local` and can read
and write your data repo. Do not expose it to the internet or to a shared
network. `localhost`, or a machine only you reach, is the intended deployment.

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
| `/projects`, `/projects/<slug>` | Projects | Progress rings per project; detail with lane columns |
| `/life`, `/areas/<slug>`, `/targets` | Life | Areas, their tasks, and targets (charter `## MVP scope` lines) |
| `/calendar` | Calendar | Month grid and grouped list built from task `due:` dates |
| `/canvas` | Canvas | Notes as cards on a pannable, zoomable board, joined by their `[[K-nnn]]` links. Read on the canvas, click a title for a popup, open the full page from there. Arrange mode drags cards; positions are saved to `canvas/knowledge.md` |
| `/canvas/<type>/<slug>/system` | System map | A charter's notes as **components**, wired with `requires` (solid) and `triggers` (dashed) arrows you draw by hand. Delegate a task from a component and its card shows real progress. Stored in `projects/<slug>/system.md` |
| `/canvas/<type>/<slug>` | Task map | Branches and subtasks as cards, grouped by milestone, with parent→subtask and `waits:` arrows |
| `/review` | Review | Weekly numbers, distance to MVP per project, momentum over recent weeks, open-work split, plus an on-demand AI read of the week |
| `/settings/activity` | Activity | The journal, newest first |
| `/settings/agents` | Agents | Connected coding agents and the tools the assistant may call |
| `/settings` | Settings | Sources, model catalog, favourites and the general context (`about.md`) |

The assistant rail has four modes (Plan / Straight / Reflect / Target) that change the system prompt, a scope selector that follows the screen by default, and an **Inspect context** panel showing exactly what is being sent — including `about.md`, which you can edit in place.

## Architecture

All data access goes through `lib/core`. `app/` pages and API routes call `lib/core` only. AI chat tools (`lib/ai/tools.ts`) also delegate to `lib/core`. The MCP server is a thin wrapper over the same layer.

Presentation derives from two read-only view builders that sit on top of `lib/core` and hold no data access of their own: `lib/view/workspace.ts` (charters, cards, subtasks, progress) and `lib/view/focus.ts` (ranking and the reasons shown next to each task). Design tokens and shared helpers live in `lib/ui/momentum.ts`; screen-agnostic UI primitives in `components/momentum/primitives.tsx`.

Client components must never import `lib/core` (or anything that reaches it, such as `lib/ai/tool-map.ts`) — it pulls `simple-git` and `node:fs` into the browser bundle. Pass data in from a server component instead.

## Coding agents

`npm run mcp` starts a stdio MCP server exposing the same tool layer, so an
agent working inside a project's own repo can ask what is next, create and
complete tasks, read and file notes, and journal — without touching markdown by
hand. `.mcp.json` wires it up for Claude Code in this repo; see
[`docs/mcp.md`](docs/mcp.md) for other clients and for the allowlist.

Two things make an agent useful here rather than merely connected:

- **`mcp/instructions.ts`** is handed to every client at connect, so an agent
  arrives knowing the rules it would otherwise break — search the knowledge base
  before writing, update a note rather than filing a duplicate, attach every
  task to a target or component, and never try to write a charter (no tool can).
- **`.claude/skills/planner-sync/SKILL.md`** is the procedure for bringing a
  project into the planner or bringing an existing one up to date. Copy it to
  `~/.claude/skills/` to use it from any directory.

The allowlist is deliberately narrower than the web app's: creating a project or
an area is a human decision, and archiving is absent entirely. Set
`PLANNER_MCP_READONLY=1` to drop every write tool.

## Status

Built by one person for their own use, in the open. It works and is used daily,
but it makes assumptions a general tool would not: one user, one machine, your
own git repo, and a schema that will change when the author needs it to. The
task line grammar in particular is closed — an unknown field key is a **fatal**
parse error, on purpose — so data written by a newer version can be unreadable
to an older one.

Issues and forks welcome; no promises about backwards compatibility.

## License

MIT — see [LICENSE](LICENSE).
