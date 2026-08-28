import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolShapes, toolDescriptions, type ToolName } from "@/lib/ai/schemas";
import { toolImplMap } from "@/lib/ai/tool-map";
import { appendJournal } from "@/lib/core/journal";
import { dataRoot } from "@/lib/core/paths";
import { agentName, allowedToolNames, WRITE_TOOLS, type McpEnv } from "./allowlist";

export * from "./allowlist";

function summarize(name: ToolName, args: Record<string, unknown>, result: unknown): string {
  const parts: string[] = [name];
  const scope = args.project ?? args.scope ?? args.slug;
  if (typeof scope === "string" && scope) parts.push(scope);
  const resultId = (result as { id?: unknown } | null | undefined)?.id;
  const id = typeof resultId === "string" ? resultId : typeof args.id === "string" ? args.id : null;
  if (id) parts.push(id);
  return parts.join(" ");
}

export function loadEnvFile(root: string): void {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return;
  const loader = (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile;
  if (typeof loader === "function") {
    loader(file);
    return;
  }
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

export function plannerRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function requireDataRoot(): string {
  const root = dataRoot();
  if (!fs.existsSync(root)) {
    throw new Error(
      `PLANNER_DATA_DIR does not exist: ${root}. Set PLANNER_DATA_DIR to the planner-data repo.`,
    );
  }
  return root;
}

export interface BuildServerOptions {
  env?: McpEnv;
  version?: string;
}

export function buildServer(opts: BuildServerOptions = {}): McpServer {
  const env = opts.env ?? process.env;
  const agent = agentName(env);
  const server = new McpServer(
    { name: "planner", version: opts.version ?? "1.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  );

  const writable = new Set(WRITE_TOOLS);

  for (const name of allowedToolNames(env)) {
    server.registerTool(
      name,
      {
        description: toolDescriptions[name],
        inputSchema: toolShapes[name],
      },
      (async (args: Record<string, unknown>) => {
        try {
          const input = (args ?? {}) as Record<string, unknown>;
          const result = await toolImplMap[name](input);
          if (writable.has(name)) {
            try {
              await appendJournal(`agent:${agent}`, summarize(name, input, result));
            } catch {
              void 0;
            }
          }
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: err instanceof Error ? err.message : String(err),
              },
            ],
          };
        }
      }) as never,
    );
  }

  server.registerResource(
    "planner-next",
    "planner://next",
    {
      title: "Next actions",
      description: "The prioritized list of next actions across the workspace.",
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await toolImplMap.next_actions({});
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "planner-context",
    new ResourceTemplate("planner://context/{type}/{slug}", { list: undefined }),
    {
      title: "Charter context",
      description: "Charter, open tasks and about text for a project or area.",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const type = String(variables.type);
      const slug = String(variables.slug);
      const result = await toolImplMap.get_context({ type, slug });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );

  return server;
}
