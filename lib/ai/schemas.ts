import { z, type ZodRawShape } from "zod";
import type { TaskLane } from "../core/types";

const baseShapes = {
  list_projects: {},
  list_areas: {},
  get_context: {
    type: z.enum(["project", "area"]).optional(),
    slug: z.string().optional(),
  },
  create_project: {
    name: z.string(),
    why: z.string(),
    mvp: z.string(),
  },
  create_area: {
    name: z.string(),
    why: z.string(),
  },
  create_task: {
    project: z.string(),
    title: z.string(),
    size: z.enum(["S", "M", "L"]),
    target: z.string().optional(),
    note: z.string().optional(),
    waitsOn: z.string().optional(),
  },
  update_task: {
    project: z.string(),
    id: z.string(),
    title: z.string().optional(),
    size: z.enum(["S", "M", "L"]).optional(),
    section: z.enum(["backlog", "in-progress", "done"]).optional(),
    est: z.string().optional(),
    due: z.string().optional(),
    target: z.string().optional(),
    note: z.string().optional(),
    waitsOn: z.string().optional(),
    complete: z.boolean().optional(),
  },
  decompose_task: {
    project: z.string(),
    id: z.string(),
    subtasks: z.array(
      z.object({
        title: z.string(),
        size: z.enum(["S", "M", "L"]),
        plan: z.string().optional(),
      }),
    ),
  },
  move_to_parking_lot: {
    project: z.string(),
    idea: z.string(),
  },
  add_journal: {
    scope: z.string(),
    message: z.string(),
  },
  list_events: {
    from: z.string().optional(),
    to: z.string().optional(),
  },
  create_event: {
    date: z.string(),
    title: z.string(),
    time: z.string().optional(),
    note: z.string().optional(),
    scope: z.string().optional(),
    action: z.string().optional(),
  },
  update_event: {
    id: z.string(),
    date: z.string().optional(),
    title: z.string().optional(),
    time: z.string().optional(),
    note: z.string().optional(),
    scope: z.string().optional(),
    action: z.string().optional(),
    done: z.boolean().optional(),
  },
  get_daily: {},
  log_daily: {
    id: z.string(),
  },
  add_grocery: {
    name: z.string(),
    cat: z.string().optional(),
  },
  set_grocery: {
    id: z.string(),
    got: z.boolean(),
  },
  read_task_detail: {
    project: z.string(),
    id: z.string(),
  },
  write_task_detail: {
    project: z.string(),
    id: z.string(),
    body: z.string(),
  },
  search_knowledge: {
    query: z.string(),
    scope: z.string().optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().int().positive().optional(),
  },
  read_note: {
    id: z.string(),
  },
  add_note: {
    title: z.string().optional(),
    summary: z.string(),
    body: z.string().optional(),
    scope: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
  },
  update_note: {
    id: z.string(),
    title: z.string().optional(),
    summary: z.string().optional(),
    body: z.string().optional(),
    scope: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
  },
  next_actions: {},
  list_targets: { project: z.string().optional() },
  list_components: { project: z.string() },
  weekly_summary: {},
} satisfies Record<string, ZodRawShape>;

export const proposalActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create_task"), ...baseShapes.create_task }),
  z.object({ kind: z.literal("update_task"), ...baseShapes.update_task }),
  z.object({ kind: z.literal("decompose_task"), ...baseShapes.decompose_task }),
  z.object({ kind: z.literal("move_to_parking_lot"), ...baseShapes.move_to_parking_lot }),
  z.object({ kind: z.literal("create_event"), ...baseShapes.create_event }),
  z.object({ kind: z.literal("update_event"), ...baseShapes.update_event }),
  z.object({ kind: z.literal("add_note"), ...baseShapes.add_note }),
  z.object({ kind: z.literal("update_note"), ...baseShapes.update_note }),
]);

export type ProposalAction = z.infer<typeof proposalActionSchema>;
export type ProposalActionKind = ProposalAction["kind"];

export interface ProposalPreviewRow {
  kind: ProposalActionKind;
  id: string;
  title: string;
  lane: TaskLane | null;
  note: string;
  detail?: string;
  charterName: string;
  color: string;
  /** Charter the row's task lives in ("<slug>" or "area:<slug>"). Absent when the row is not a task, or when the task does not exist yet. */
  scope?: string;
}

export interface Proposal {
  proposalId: string;
  title: string;
  summary?: string;
  actions: ProposalAction[];
  preview: ProposalPreviewRow[];
}

export interface ProposalActionResult {
  kind: ProposalActionKind;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ProposalApplyResult {
  applied: number;
  failedIndex: number | null;
  results: ProposalActionResult[];
}

export const toolShapes = {
  ...baseShapes,
  propose_changes: {
    title: z.string(),
    summary: z.string().optional(),
    actions: z.array(proposalActionSchema),
  },
} satisfies Record<string, ZodRawShape>;

export const proposalSchema = z.object(toolShapes.propose_changes);

export type ProposalInput = z.infer<typeof proposalSchema>;

export type ToolName = keyof typeof toolShapes;

export const toolNames = Object.keys(toolShapes) as ToolName[];

export const toolSchemas = toolNames.reduce((acc, name) => {
  acc[name] = z.object(toolShapes[name]);
  return acc;
}, {} as Record<ToolName, z.ZodTypeAny>);

export const toolDescriptions: Record<ToolName, string> = {
  list_projects: "List all projects (charters).",
  list_areas: "List all life areas (charters).",
  get_context:
    "Get charter context, open tasks, and the about text for a project or area.",
  create_project: "Create a new project charter.",
  create_area: "Create a new life area charter.",
  create_task:
    "Create a task in a project or area (slug or area:<slug>). waitsOn marks it blocked by a task id in the same file or by free text. target links it to a charter goal (G-001) from list_targets, which is what makes that goal show real progress. note links it to a component (K-001) from list_components, which is what makes that component show real progress.",
  update_task:
    "Update a task's fields (title, size, section, est, due, target, note, waitsOn, done). Pass waitsOn, target or note as an empty string to clear it.",
  decompose_task:
    "Break a task into subtasks. Each subtask may carry an optional plan — free markdown stored alongside it, which is the only place the reasoning behind the breakdown survives.",
  move_to_parking_lot: "Add an idea to a charter's parking lot.",
  add_journal: "Append a journal entry for a scope.",
  list_events:
    "List calendar events, optionally limited to an ISO date range (from/to, inclusive).",
  create_event:
    "Create a calendar event on an ISO date. time is free text up to 12 characters, scope is a project slug or area:<slug> and is optional, action is what still needs doing before the event.",
  update_event:
    "Update a calendar event (date, title, time, note, scope, action, done). Pass an empty string to clear time, note, scope or action.",
  get_daily:
    "Get the daily habits, weekly rhythms, prepped meals, grocery list and the raw activity log.",
  log_daily:
    "Count one tick for a habit (H-) or a rhythm (R-). When the goal for today or the week is already met the tick wraps around and resets the count.",
  add_grocery: "Add an item to the grocery list. cat is a free-text category, default Other.",
  set_grocery: "Mark a grocery item as got (true) or back on the list (false).",
  read_task_detail:
    "Read the plan attached to one task or subtask — the notes, steps and decisions behind it. Task lines only carry a title, so read this before working on a task. Returns an empty body when nothing is written yet.",
  write_task_detail:
    "Write the plan for one task or subtask, replacing whatever is there. Free markdown: steps, findings, decisions, anything worth keeping. id accepts a subtask id like T-007.2. An empty body removes the plan.",
  search_knowledge:
    "Search the knowledge base and get ranked snippets. Use this whenever the answer might already be written down — the system prompt only lists notes for the focused scope. scope filters to a project slug or area:<slug>; tags must all match.",
  read_note: "Read one knowledge note in full, with the notes it links to and the notes linking back to it.",
  add_note:
    "File a knowledge note. summary must be a single line stating the conclusion, not the topic — it is the only text loaded into context until someone searches. title is optional and is derived from the summary when omitted. Leave scope empty and it is categorised automatically into the right area or project; pass it only when you are certain.",
  update_note:
    "Amend a knowledge note. Only the fields you pass change; updated is bumped. Pass source as an empty string to clear it.",
  next_actions: "Get the prioritized list of next actions across the workspace.",
  list_targets:
    "List the goals (targets) on a charter, with their G- ids, milestone grouping and progress. Read this before setting target: on a task — an id that does not exist simply shows no link.",
  list_components:
    "Read a project's system map: its components (knowledge notes on its canvas), what each one requires or is required by, what it triggers, and how much of its delegated work is done. Read this before changing a component — it says what must exist first.",
  weekly_summary: "Get insights and the last 7 days of journal digest.",
  propose_changes:
    "Propose a batch of changes without writing anything — tasks, events and knowledge notes. Returns a preview the user must Accept before it is applied. Use this for any set of writes; use the direct tools only for a single, explicitly requested change.",
};
