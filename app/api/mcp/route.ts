import { handleMcpRequest } from "@/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The second door into the same room: `mcp/server.ts` speaks stdio for a client
 * on this machine, this route speaks Streamable HTTP for one that is not.
 * Everything below the transport — `buildServer`, the allowlist, the tool impls
 * — is shared, so there is no second implementation of anything.
 *
 * Deliberately thin. Nothing under `app/` can be tested (vitest is node-only
 * and collects `lib/**` and `mcp/**`), so every decision lives in `mcp/http.ts`.
 */
function handle(req: Request): Promise<Response> {
  return handleMcpRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
