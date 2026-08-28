import { toolImpls } from "./tools";
import type { ToolName } from "./schemas";

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
