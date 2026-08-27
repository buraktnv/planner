import { z, type ZodRawShape } from "zod";
import { toolImpls } from "./tools";

export const toolShapes = {
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
  },
  update_task: {
    project: z.string(),
    id: z.string(),
    title: z.string().optional(),
    size: z.enum(["S", "M", "L"]).optional(),
    section: z.enum(["backlog", "in-progress", "done"]).optional(),
    est: z.string().optional(),
    due: z.string().optional(),
    complete: z.boolean().optional(),
  },
  decompose_task: {
    project: z.string(),
    id: z.string(),
    subtasks: z.array(
      z.object({
        title: z.string(),
        size: z.enum(["S", "M", "L"]),
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
  next_actions: {},
  weekly_summary: {},
} satisfies Record<string, ZodRawShape>;

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
  create_task: "Create a task in a project or area (slug or area:<slug>).",
  update_task: "Update a task's fields (title, size, section, est, due, done).",
  decompose_task: "Break a task into subtasks.",
  move_to_parking_lot: "Add an idea to a charter's parking lot.",
  add_journal: "Append a journal entry for a scope.",
  next_actions: "Get the prioritized list of next actions across the workspace.",
  weekly_summary: "Get insights and the last 7 days of journal digest.",
};

type ImplFn = (input: Record<string, unknown>) => Promise<unknown>;

export const toolImplMap: Record<ToolName, ImplFn> = {
  list_projects: () => toolImpls.listProjects(),
  list_areas: () => toolImpls.listAreas(),
  get_context: toolImpls.getContext as ImplFn,
  create_project: toolImpls.createProject as ImplFn,
  create_area: toolImpls.createArea as ImplFn,
  create_task: toolImpls.createTask as ImplFn,
  update_task: toolImpls.updateTask as ImplFn,
  decompose_task: toolImpls.decomposeTask as ImplFn,
  move_to_parking_lot: toolImpls.moveToParkingLot as ImplFn,
  add_journal: toolImpls.addJournal as ImplFn,
  next_actions: () => toolImpls.nextActions(),
  weekly_summary: () => toolImpls.weeklySummary(),
};
