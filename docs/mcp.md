# Planner MCP server

A stdio MCP server that exposes the Planner tool layer to coding agents (Claude Code, opencode,
Cursor — anything that speaks MCP). It is a thin wrapper: every tool call goes through
`lib/ai/tool-map.ts` → `lib/core`, so writes journal and git-commit in `planner-data` exactly like
the web app does. There is no second implementation of anything.

## Run it

```bash
npm run mcp
```

The process speaks MCP on stdout/stdin and logs only to stderr. It loads `.env.local` from the
planner repo root itself (MCP clients do not source it), so `PLANNER_DATA_DIR` from `.env.local` is
picked up automatically; an explicit `env` entry in the client config always wins over the file.

### Environment

| Variable | Meaning |
| --- | --- |
| `PLANNER_DATA_DIR` | Path to the `planner-data` repo. Required; the server exits with a stderr message if the directory does not exist. |
| `PLANNER_AGENT` | Display name for this client, used for the journal trail and the Agents page. Default `agent`. |
| `PLANNER_MCP_READONLY` | Set to `1` (anything other than empty / `0` / `false`) to expose read tools and `propose_changes` only. |

## What is exposed

Read tools: `list_projects`, `list_areas`, `get_context`, `list_events`, `get_daily`,
`next_actions`, `weekly_summary`, `search_knowledge`, `read_note`, `read_task_detail`, `list_targets`.

Write tools: `create_task`, `update_task`, `decompose_task`, `move_to_parking_lot`, `add_journal`,
`create_event`, `update_event`, `log_daily`, `add_grocery`, `set_grocery`, `add_note`,
`update_note`, `write_task_detail`, plus `propose_changes` (which writes nothing and returns a
preview).

The knowledge tools are how an agent reads and writes the owner's second brain. Only notes scoped to
the focused project or area are ever loaded automatically — reach for `search_knowledge` before
concluding something is not written down, and `add_note` when you learn something worth keeping.

**A project's documentation is its scoped notes.** Everything else in the planner points forward — a
charter says why a project exists, a task says what is left to do. A note scoped to a project is the
only place that records what has *already been built*: how it is put together, what the interfaces
are, which decisions were settled and why, how to run it. File one with `add_note` and
`scope: ["<project-slug>"]` (or `["area:<slug>"]`), and revise it with `update_note` rather than
filing a second note on the same subject. The owner browses these at `/projects/<slug>/docs`.

Use the first tag as the doc's category — `architecture`, `protocol`, `decision`, `runbook` or
`reference` — because the docs page groups by it. The `summary` is the single line that gets loaded
into chat before any body is read, so state the conclusion in it, not the topic. Note that scoped
notes live in `knowledge/` and therefore do **not** move into `archive/` with a charter; project
documentation deliberately outlives the project.

A task line carries only a title, a size and a few dates — there is nowhere in it to record *why* a
task exists or how it should be done. That lives in the task detail: free markdown at
`projects/<slug>/details/<task-id>.md`, one file per task or subtask. Call `read_task_detail` before
starting work on a task and `write_task_detail` when you finish, so the next agent inherits what you
learned instead of rediscovering it. `decompose_task` takes an optional `plan` per subtask, which is
the only place the reasoning behind a breakdown survives. Ids may be dotted (`T-007.2`).

Targets are the charter's goals, and a task can name one. Call `list_targets` to see them — each returns a `G-` id, its milestone, and how many tasks already point at it — then pass `target: "G-001"` to `create_task` or `update_task`. That link is what makes a goal show real progress instead of a bare tick; without it the roadmap can only say done or not done. An id that does not exist is tolerated and simply shows no link, so read the list rather than guessing. Targets themselves are edited in the web app, not through a tool.

Never exposed: `create_project` and `create_area` — charters are the owner's job, created from the
web app. There is no archive or restore tool either: both exist in the web app only, deliberately,
because retiring a charter is the owner's decision. Nothing is ever hard-deleted — archiving moves a
charter and its tasks and details into `archive/`, and the owner can restore it from `/archive`.

Two resources are registered for cheap context:

- `planner://next` — the same payload as `next_actions`.
- `planner://context/{type}/{slug}` — the same payload as `get_context`, e.g.
  `planner://context/project/acme-bot`.

Every **write** call appends a second journal line under the agent's own scope, so the trail is
visible in the app:

```
- 09:12 [agent:claude-code] create_task acme-bot T-004
```

Reads are not journaled. The Agents page (`/agents`) turns those lines into a Connected agents
panel: one card per agent with last seen, call count and most-used tools.

## Wire it into another repo

The paths below are examples from one machine — substitute your own planner checkout and data repo.

Drop this into `.mcp.json` at the root of the project repo (or the equivalent MCP config for your
client). Using `node` + `tsx` directly means the config does not depend on the working directory:

```json
{
  "mcpServers": {
    "planner": {
      "command": "node",
      "args": [
        "/absolute/path/to/planner/node_modules/tsx/dist/cli.mjs",
        "/absolute/path/to/planner/mcp/server.ts"
      ],
      "env": {
        "PLANNER_DATA_DIR": "/absolute/path/to/planner-data",
        "PLANNER_AGENT": "claude-code"
      }
    }
  }
}
```

Inside the planner repo itself the committed `.mcp.json` uses the shorter form, which relies on the
client's working directory being the planner root:

```json
{
  "mcpServers": {
    "planner": {
      "command": "npm",
      "args": ["run", "--silent", "mcp"],
      "env": { "PLANNER_AGENT": "claude-code" }
    }
  }
}
```

Give each client a distinct `PLANNER_AGENT` (`claude-code`, `opencode`, `cursor`) so the journal
trail stays readable. Add `"PLANNER_MCP_READONLY": "1"` for a client that should only look.

## Recommended `CLAUDE.md` block for a managed project

Paste this into the project repo's `CLAUDE.md`, replacing `<slug>` with its Planner slug:

> **Planner.** This project is tracked in Planner as `<slug>`. Start a session with
> `mcp__planner__get_context` (`{type:"project", slug:"<slug>"}`) or `mcp__planner__next_actions`;
> when you finish a task call `mcp__planner__update_task` with `complete:true`; log notable
> decisions with `mcp__planner__add_journal` (scope `<slug>`). Do not edit `planner-data` markdown
> directly.

## Verifying it by hand

Piping a single JSON line into the server is not enough — stdio MCP needs the transport's framing
and an `initialize` handshake. Use an MCP client instead. `mcp/__tests__/stdio.test.ts` does exactly
this: it seeds a temp data directory with a fake project and two tasks, spawns
`node node_modules/tsx/dist/cli.mjs mcp/server.ts` against it, and asserts that `tools/list` returns
the allow-listed tools and that `next_actions` comes back with the fixture's tasks.

```bash
npx vitest run mcp/__tests__/stdio.test.ts
```

Never point a smoke test at the real `planner-data` repo — writes there are real commits.
