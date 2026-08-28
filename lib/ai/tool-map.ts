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
  list_events: toolImpls.listEvents as ImplFn,
  create_event: toolImpls.createEvent as ImplFn,
  update_event: toolImpls.updateEvent as ImplFn,
  get_daily: () => toolImpls.getDaily(),
  log_daily: toolImpls.logDaily as ImplFn,
  add_grocery: toolImpls.addGrocery as ImplFn,
  set_grocery: toolImpls.setGrocery as ImplFn,
  search_knowledge: toolImpls.searchKnowledge as ImplFn,
  read_note: toolImpls.readNote as ImplFn,
  add_note: toolImpls.addNote as ImplFn,
  update_note: toolImpls.updateNote as ImplFn,
  next_actions: () => toolImpls.nextActions(),
  weekly_summary: () => toolImpls.weeklySummary(),
  propose_changes: toolImpls.proposeChanges as ImplFn,
};
