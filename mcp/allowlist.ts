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
  "list_targets",
  "list_components",
  "read_canvas",
  "weekly_summary",
  "life_trends",
  "search_knowledge",
  "read_note",
  "read_task_detail",
  "read_task_comments",
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
  "create_habit",
  "create_rhythm",
  "create_meal",
  "add_grocery",
  "set_grocery",
  "add_note",
  "update_note",
  "write_task_detail",
  "add_task_comment",
  "attach_image",
  /**
   * Canvas writes sit here rather than being owner-only: a map records where
   * cards sit and what connects to what, every change is one commit in the
   * data repo, and the UI can undo any of it by dragging. `connect_cards` and
   * `disconnect_cards` are *also* proposable, so a readonly agent can still
   * say what it thinks connects to what.
   */
  "place_card",
  "connect_cards",
  "disconnect_cards",
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
