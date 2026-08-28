import { toolNames, type ToolName } from "../lib/ai/schemas";

export interface McpEnv {
  PLANNER_AGENT?: string;
  PLANNER_MCP_READONLY?: string;
  [key: string]: string | undefined;
}

export const READ_TOOLS: ToolName[] = [
  "list_projects",
  "list_areas",
  "get_context",
  "list_events",
  "get_daily",
  "next_actions",
  "weekly_summary",
];

export const WRITE_TOOLS: ToolName[] = [
  "create_task",
  "update_task",
  "decompose_task",
  "move_to_parking_lot",
  "add_journal",
  "create_event",
  "update_event",
  "log_daily",
  "add_grocery",
  "set_grocery",
];

export const OWNER_ONLY_TOOLS: ToolName[] = ["create_project", "create_area"];

export function isReadonly(env: McpEnv = process.env): boolean {
  const v = env.PLANNER_MCP_READONLY;
  return v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

export function allowedToolNames(env: McpEnv = process.env): ToolName[] {
  const allowed = isReadonly(env)
    ? [...READ_TOOLS, "propose_changes" as ToolName]
    : [...READ_TOOLS, ...WRITE_TOOLS, "propose_changes" as ToolName];
  const set = new Set(allowed);
  return toolNames.filter((n) => set.has(n));
}

export function agentName(env: McpEnv = process.env): string {
  const raw = env.PLANNER_AGENT?.trim();
  return raw ? raw : "agent";
}
