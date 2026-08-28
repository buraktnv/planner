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
`next_actions`, `weekly_summary`.

Write tools: `create_task`, `update_task`, `decompose_task`, `move_to_parking_lot`, `add_journal`,
`create_event`, `update_event`, `log_daily`, `add_grocery`, `set_grocery`, plus `propose_changes`
(which writes nothing and returns a preview).

Never exposed: `create_project` and `create_area` — charters are the owner's job, created from the
web app. There is no archive tool at all.

Two resources are registered for cheap context:

- `planner://next` — the same payload as `next_actions`.
- `planner://context/{type}/{slug}` — the same payload as `get_context`, e.g.
  `planner://context/project/responsive-bot`.

Every **write** call appends a second journal line under the agent's own scope, so the trail is
visible in the app:

```
- 09:12 [agent:claude-code] create_task responsive-bot T-004
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
        "C:/Users/user/Documents/GitHub/planner/node_modules/tsx/dist/cli.mjs",
        "C:/Users/user/Documents/GitHub/planner/mcp/server.ts"
      ],
      "env": {
        "PLANNER_DATA_DIR": "C:/Users/user/Documents/GitHub/planner-data",
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
