import crypto from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildServer, requireDataRoot } from "./planner";
import type { McpEnv } from "./allowlist";

const AGENT_HEADER = "x-planner-agent";
const READONLY_HEADER = "x-planner-readonly";
const AGENT_MAX = 40;

/**
 * A client may name itself, because the name only labels its own journal trail
 * and `/agents` card. Everything outside this set is dropped rather than
 * escaped: the name is written into a journal line as `[agent:<name>]`, and
 * `/agents` reads it back by those brackets, so a name carrying one of them
 * would produce a line that parses as something else. The fetch layer already
 * refuses a header value containing a newline, so this is the half of the
 * problem it does not cover.
 */
export function agentFromHeaders(headers: Headers, fallback?: string): string | undefined {
  const raw = headers.get(AGENT_HEADER)?.trim();
  if (!raw) return fallback;
  const clean = raw.replace(/[^A-Za-z0-9 ._-]/g, "").trim().slice(0, AGENT_MAX);
  return clean || fallback;
}

/**
 * The readonly flag is honoured in one direction only. A client may restrict
 * itself to the read tools and `propose_changes`; it may never clear a
 * restriction the server set, or the env var would be advisory.
 */
export function envForRequest(headers: Headers, env: McpEnv = process.env): McpEnv {
  const next: McpEnv = { ...env };
  const agent = agentFromHeaders(headers, env.PLANNER_AGENT);
  next.PLANNER_AGENT = agent ?? "http";
  const asked = headers.get(READONLY_HEADER)?.trim();
  if (asked && asked !== "0" && asked.toLowerCase() !== "false") {
    next.PLANNER_MCP_READONLY = "1";
  }
  return next;
}

export interface Refusal {
  status: number;
  message: string;
}

function sameOriginHost(origin: string, host: string | null): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so the lengths are compared first and the result folded in.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Two refusals, and the first is the one that is easy to miss. This route lives
 * on a local port, so a page in the owner's browser can be made to POST to it.
 * A JSON content-type forces a CORS preflight that no CORS header here will
 * satisfy, so a browser blocks the *response* — but that makes the browser the
 * only thing standing in front of the write tools. A real MCP client sends no
 * `Origin`, so an `Origin` that does not match `Host` is refused outright.
 */
export function refuse(req: Request, env: McpEnv = process.env): Refusal | null {
  const origin = req.headers.get("origin");
  if (origin && !sameOriginHost(origin, req.headers.get("host"))) {
    return { status: 403, message: "cross-origin request refused" };
  }
  const expected = env.PLANNER_MCP_TOKEN?.trim();
  if (expected) {
    const header = req.headers.get("authorization") ?? "";
    const given = /^Bearer\s+(.+)$/i.exec(header.trim())?.[1] ?? "";
    if (!given || !tokenMatches(given, expected)) {
      return { status: 401, message: "missing or invalid bearer token" };
    }
  }
  return null;
}

function errorResponse(status: number, message: string): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: status === 503 ? -32001 : -32000, message },
      id: null,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

/**
 * One request, one server. A session map would have to be module-level state in
 * the Next process, which does not survive the `post-merge` rebuild that
 * restarts the app — a session id handed out before a deploy would come back to
 * a process that has never heard of it. Nothing needs a session anyway: the
 * state is the markdown on disk, not the connection.
 *
 * `enableJsonResponse` is not a preference. It makes `handleRequest` resolve
 * with a fully materialised body, which is the only reason the server can be
 * closed in the `finally` below; with an SSE stream the body is still being
 * written when `finally` runs, and closing there would truncate it.
 *
 * `env` governs the MCP-level knobs only — the agent name, the readonly flag,
 * the token. It cannot carry a `PLANNER_DATA_DIR`: `dataRoot()` reads
 * `process.env` directly and so does every writer under `lib/core`, so a data
 * root is a property of the process, never of a request. Pretending otherwise
 * would give a caller an argument that silently did nothing.
 */
export async function handleMcpRequest(req: Request, env: McpEnv = process.env): Promise<Response> {
  const refusal = refuse(req, env);
  if (refusal) return errorResponse(refusal.status, refusal.message);

  try {
    requireDataRoot();
  } catch (err) {
    return errorResponse(503, err instanceof Error ? err.message : String(err));
  }

  const server = buildServer({ env: envForRequest(req.headers, env) });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } finally {
    void server.close().catch(() => undefined);
  }
}
