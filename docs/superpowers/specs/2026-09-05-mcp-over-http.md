# Reaching the planner MCP server from another machine

2026-09-05

## The gap

`mcp/server.ts` connects a `StdioServerTransport`, which is the only transport
the planner has ever spoken. Stdio means the client *launches* the server as a
child process and talks down a pipe, so client and server are necessarily on one
machine — and that machine must hold both the planner checkout and the
`planner-data` repo.

The web app has no such limit: it is served on port 80 and, because Tailscale
installs an inbound allow rule scoped to its own addresses, it already answers
from every device on the tailnet. So the owner can read and write the planner
from a laptop in a browser but cannot point a coding agent there.

The two workarounds are both worse than they look. Tunnelling stdio over SSH
needs a Windows SSH server, a key in the administrators-only
`authorized_keys` location, and a wrapper script — because `dataRoot()` uses
`PLANNER_DATA_DIR` **verbatim** and `.env.local` holds the relative
`../planner-data`, which resolves against the process cwd and so breaks the
moment the process starts anywhere but the planner root. Cloning both repos on
the second machine is worse still: every write auto-commits, so two
`planner-data` histories drift and have to be merged by hand in markdown, and a
note filed on the laptop is invisible in the desktop's browser until someone
pulls. One journal, one copy, is the whole design.

## What was added

A second transport, mounted inside the app that is already being served:
`POST /api/mcp`. A client on the tailnet registers it in one line and needs
nothing installed:

```
claude mcp add --transport http planner http://<host>/api/mcp
```

`buildServer()` is untouched and unaware. There is still exactly one tool
implementation, one allowlist and one set of instructions; the stdio entrypoint
and the route are two doors into the same room.

## Decisions

**The pure part lives in `mcp/http.ts`, not in the route.** vitest is node-only
and collects `lib/**/__tests__` and `mcp/__tests__`; nothing under `app/` can be
tested at all. So `handleMcpRequest(req, env)` takes a web-standard `Request`
and returns a `Response`, and `app/api/mcp/route.ts` is a five-line shell that
forwards to it. That is what lets the handshake, the allowlist gating and the
refusals be tested by constructing real `Request` objects, with no server, no
browser and no child process.

**Stateless, one server per request.** `sessionIdGenerator: undefined`, and a
fresh `buildServer()` + transport for every call. A session map would have to be
module-level state in the Next process, which survives neither a rebuild nor the
`post-merge` restart, and a session id handed out before a redeploy would come
back to a process that has never heard of it — a 404 mid-conversation. Every
tool call here is self-contained (the state is the markdown on disk, not the
connection), so there is nothing a session would carry.

**`enableJsonResponse: true`, and that is load-bearing rather than a
preference.** It makes `handleRequest` resolve with a fully materialised body,
which is the only reason the server can be closed in a `finally` around it. With
SSE streams the response body is still being written when `finally` runs, so
closing there would truncate it. No planner tool sends progress notifications,
so a stream buys nothing and costs a connection held open by a route handler.

**The `Origin` header is checked, because this is a local port.** A page in the
owner's browser can be made to `fetch("http://localhost/api/mcp")`. A JSON
content-type forces a CORS preflight and no CORS headers are sent, so the
browser blocks the *response* — but relying on that alone means the defence is
the browser's, not ours, and a request that got through would carry write tools.
A genuine MCP client sends no `Origin` at all, so the rule is: no `Origin` is
fine, an `Origin` whose host matches `Host` is fine, anything else is 403.

**An optional bearer token, off by default.** `PLANNER_MCP_TOKEN`, when set,
must arrive as `Authorization: Bearer <token>`. Unset, the surface is as open as
the web app beside it, which is the right default for a tailnet of one person's
devices. But the web app is read-and-write through a UI a human drives, whereas
this is read-and-write through tools an agent drives, and there needed to be a
way to close it that does not involve turning the app off. Compared with
`crypto.timingSafeEqual` on equal-length buffers so the check does not leak the
token's prefix.

**The agent name comes from a request header, the readonly flag does not.**
`x-planner-agent` is folded into the per-request env so the journal and
`/agents` can tell the laptop from the desktop — a client naming itself can only
mislabel its own trail. `PLANNER_MCP_READONLY` stays server-side, because a
client that could unset it would be granting itself the write tools;
`x-planner-readonly` is accepted in the one safe direction, letting a client
restrict *itself* to reads and `propose_changes`.

**A missing data directory is a 503, not a crash.** The stdio entrypoint exits
with a stderr line; a route cannot exit the process it shares with the web app,
so it answers with a JSON-RPC error naming the variable.

## Verification

`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` green, plus
`mcp/__tests__/http.test.ts`: the initialize handshake returns the server
instructions; `tools/list` over HTTP matches `allowedToolNames`; a write tool
called over HTTP creates a real task in a throwaway `PLANNER_DATA_DIR` and
journals it under the header-supplied agent name; readonly drops the write
tools; a cross-origin `Origin` is refused; a wrong or missing bearer token is
refused when one is configured and ignored when one is not.
