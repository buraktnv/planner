import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { agentName, buildServer, loadEnvFile, plannerRoot, requireDataRoot } from "./planner";

async function main(): Promise<void> {
  loadEnvFile(plannerRoot());
  let root: string;
  try {
    root = requireDataRoot();
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
    return;
  }
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  process.stderr.write(`planner mcp ready · agent=${agentName()} · data=${root}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
