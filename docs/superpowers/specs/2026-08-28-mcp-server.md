# MCP server — coding agents talk to Planner

Goal: Claude Code (and any MCP client — opencode, Cursor) working inside a project repo such as `Responsive-Bot-stable` can ask Planner "what's next", create/complete tasks, and journal — without touching the markdown by hand. The server is a thin stdio wrapper over the existing tool layer; **zero tool duplication**.

Rules from `AGENTS.md` apply: `lib/core` is the only data gateway (the server calls `toolImplMap`, which calls `lib/core`), every write journals + commits, secrets never in data files.

## Access decision (owner's default, adjustable per client)

- Exposed to agents: every **read** tool, plus `create_task`, `update_task`, `decompose_task`, `move_to_parking_lot`, `add_journal`, `create_event`, `update_event`, `log_daily`, `add_grocery`, `set_grocery`, `propose_changes`.
- **Not** exposed: `create_project`, `create_area` (charters are the owner's), and there is no archive tool at all.
- `PLANNER_MCP_READONLY=1` exposes reads + `propose_changes` only.

## Files

### `mcp/server.ts`
- `@modelcontextprotocol/sdk` (`McpServer` + `StdioServerTransport`). Add it to `package.json` dependencies explicitly (it is already installed transitively by the Agent SDK — pin the version that is on disk in `node_modules/@modelcontextprotocol/sdk/package.json`). Add `tsx` as a devDependency to run TypeScript with the `@/` path alias, and a script `"mcp": "tsx mcp/server.ts"`.
- Registers one MCP tool per allowed name from `toolShapes` / `toolDescriptions` (`lib/ai/schemas.ts`), executing via `toolImplMap` (`lib/ai/tool-map.ts`). Results are returned as `content: [{ type: "text", text: JSON.stringify(result, null, 2) }]`; thrown errors become `isError: true` results with the message, never a crash.
- Also registers two MCP **resources** for cheap context: `planner://context/{type}/{slug}` (charter + open tasks, same shape as `get_context`) and `planner://next` (`next_actions`). Optional but cheap; skip if the SDK version makes it awkward.
- Env: `PLANNER_DATA_DIR` (required — resolve via `lib/core/paths.dataRoot()`, fail fast with a clear stderr message if the dir does not exist), `PLANNER_AGENT` (display name, default `agent`), `PLANNER_MCP_READONLY`.
- Never write to stdout except MCP frames (stdio transport); log to stderr only.

### Agent presence in the journal
- On every **write** tool call the server appends a journal line under scope `agent:<PLANNER_AGENT>`: `- HH:mm [agent:claude-code] create_task responsive-bot T-004`. Reads are not journaled (noise). Use `appendJournal` from `lib/core/journal.ts` — the write tool itself already journals under the project scope; this second line is the agent's trail.
- `lib/view/agents.ts` (new): `agentPresence(days: JournalDay[])` → per agent `{ name, lastSeen, calls, tools }` parsed from `agent:` scopes over the last 30 days.
- `app/agents/page.tsx`: replace the "NO MCP SERVER YET" line with a **Connected agents** panel: one card per agent seen in the journal (name, last seen relative, call count, top tools), an empty state that shows the exact `.mcp.json` snippet to paste, and below it the existing Sources list. Keep the Momentum styling.

### Client config
- `.mcp.json` at the planner repo root (committed, no secrets):
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
  `PLANNER_DATA_DIR` comes from `.env.local` — the server must load `.env.local` from the planner root itself (small hand-rolled parser or `process.loadEnvFile` on Node ≥ 20.12; no new dependency) because MCP clients do not source it.
- `docs/mcp.md`: how to wire it from another repo, i.e. the snippet with an absolute `cwd`-independent command:
  ```json
  "planner": {
    "command": "node",
    "args": ["C:/Users/user/Documents/GitHub/planner/node_modules/tsx/dist/cli.mjs", "C:/Users/user/Documents/GitHub/planner/mcp/server.ts"],
    "env": { "PLANNER_DATA_DIR": "C:/Users/user/Documents/GitHub/planner-data", "PLANNER_AGENT": "claude-code" }
  }
  ```
  plus the recommended `CLAUDE.md` block for a managed project:
  > **Planner.** This project is tracked in Planner as `<slug>`. Start a session with `mcp__planner__get_context` (`{type:"project", slug:"<slug>"}`) or `mcp__planner__next_actions`; when you finish a task call `mcp__planner__update_task` with `complete:true`; log notable decisions with `mcp__planner__add_journal` (scope `<slug>`). Do not edit `planner-data` markdown directly.
  Write the doc so the paths are examples; the real absolute paths above are correct for this machine.

### Tests
- `mcp/__tests__/server.test.ts`: tool registration respects the allow-list and `PLANNER_MCP_READONLY`; a write call appends the `agent:` journal line (temp data dir, git stubbed like `lib/core/__tests__/store.test.ts`); errors come back as `isError` results. Test the registration logic by exporting a `buildServer()`/`allowedToolNames(env)` from a module the CLI entry imports — keep `mcp/server.ts` itself a thin entry so it stays testable without spawning a process.
- `lib/view/__tests__/agents.test.ts`: presence parsing.
- Smoke: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npm run --silent mcp` is not enough for stdio framing — instead use the SDK's `Client` + `StdioClientTransport` in one integration test that spawns the server against a temp data dir and calls `tools/list` and `next_actions`. If spawning is flaky on Windows in vitest, keep it but mark it `it.skipIf(process.platform === "win32")` and document the manual check.

## Out of scope
Remote/HTTP transport, auth, multi-user. Archive stays UI-only.
