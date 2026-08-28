import type { Charter, ProjectType, Task, TaskLane, TaskSize } from "../core/types";
import {
  listCharters,
  getCharter,
  createCharter,
  updateCharter,
  listTasks,
  addTask,
  updateTask,
} from "../core/store";
import { getNextActions, type NextAction } from "../core/next";
import { addEvent, listEvents, updateEvent } from "../core/calendar";
import type { CalendarEvent } from "../core/types";
import { addGrocery, dailySummary, getDaily, logDaily, toggleGrocery } from "../core/daily";
import type { DailyData, Grocery } from "../core/types";
import { hueOf, isoToday, shiftIso } from "../ui/momentum";
import { laneOf } from "../core/lanes";
import type {
  Proposal,
  ProposalAction,
  ProposalInput,
  ProposalPreviewRow,
} from "./schemas";
import { deriveTitle, readNote, searchNotes, updateNote } from "../core/knowledge";
import { fileNote, type FileNoteResult } from "./file-note";
import type { KnowledgeHit, KnowledgeNote } from "../core/types";
import { getInsights, type Insights } from "../core/insights";
import { getAbout } from "../core/store";
import { appendJournal, readJournal } from "../core/journal";

export interface ScopeRef {
  type: ProjectType;
  slug: string;
}

function parseScope(project: string): ScopeRef {
  if (project.startsWith("area:")) {
    return { type: "area", slug: project.slice("area:".length) };
  }
  return { type: "project", slug: project };
}

const NEUTRAL = "#a9a3b5";

async function charterTone(
  project: string | undefined,
  cache: Map<string, { name: string; color: string }>,
): Promise<{ name: string; color: string }> {
  if (!project) return { name: "", color: NEUTRAL };
  const hit = cache.get(project);
  if (hit) return hit;
  const scope = parseScope(project);
  let tone = { name: scope.slug, color: NEUTRAL };
  try {
    const charter = await getCharter(scope.type, scope.slug);
    tone = { name: charter.name, color: hueOf(charter.id).color };
  } catch {
    tone = { name: scope.slug, color: NEUTRAL };
  }
  cache.set(project, tone);
  return tone;
}

async function findTask(project: string, id: string): Promise<Task | undefined> {
  const scope = parseScope(project);
  const tasks = await listTasks(scope.type, scope.slug);
  return tasks.find((t) => t.id === id);
}

function laneFor(task: Partial<Task> & { title: string; size: TaskSize }): TaskLane {
  return laneOf({
    id: task.id ?? "",
    title: task.title,
    size: task.size,
    lane: task.lane,
    done: task.done ?? false,
    section: task.section ?? "backlog",
  });
}

async function previewRow(
  action: ProposalAction,
  cache: Map<string, { name: string; color: string }>,
): Promise<ProposalPreviewRow> {
  if (action.kind === "create_task") {
    const tone = await charterTone(action.project, cache);
    return {
      kind: action.kind,
      id: "NEW",
      title: action.title,
      lane: laneFor({ title: action.title, size: action.size }),
      note: action.waitsOn ? `waits on ${action.waitsOn}` : "",
      charterName: tone.name,
      color: tone.color,
    };
  }
  if (action.kind === "update_task") {
    const tone = await charterTone(action.project, cache);
    const existing = await findTask(action.project, action.id);
    const title = action.title ?? existing?.title ?? action.id;
    const size = action.size ?? existing?.size ?? "M";
    const section = action.section ?? existing?.section ?? "backlog";
    const done = action.complete ?? existing?.done ?? false;
    return {
      kind: action.kind,
      id: action.id,
      title,
      lane: laneFor({ title, size, lane: existing?.lane, done, section }),
      note: action.complete
        ? "mark done"
        : action.section
          ? `to ${action.section}`
          : action.due
            ? `due ${action.due}`
            : "update",
      charterName: tone.name,
      color: tone.color,
    };
  }
  if (action.kind === "decompose_task") {
    const tone = await charterTone(action.project, cache);
    const existing = await findTask(action.project, action.id);
    const title = existing?.title ?? action.id;
    return {
      kind: action.kind,
      id: action.id,
      title,
      lane: existing ? laneOf(existing) : null,
      note: `${action.subtasks.length} subtasks`,
      charterName: tone.name,
      color: tone.color,
    };
  }
  if (action.kind === "move_to_parking_lot") {
    const tone = await charterTone(action.project, cache);
    return {
      kind: action.kind,
      id: "PARK",
      title: action.idea,
      lane: "some",
      note: "parking lot",
      charterName: tone.name,
      color: tone.color,
    };
  }
  if (action.kind === "add_note") {
    const tone = await charterTone(action.scope?.[0], cache);
    return {
      kind: action.kind,
      id: "NOTE",
      title: action.title?.trim() || deriveTitle(action.summary),
      lane: null,
      note: "note",
      detail: action.summary,
      charterName: action.scope?.length ? tone.name : "knowledge",
      color: action.scope?.length ? tone.color : NEUTRAL,
    };
  }
  if (action.kind === "update_note") {
    const scope = action.scope?.[0];
    const tone = await charterTone(scope, cache);
    return {
      kind: action.kind,
      id: action.id,
      title: action.title ?? action.id,
      lane: null,
      note: "note",
      ...(action.summary ? { detail: action.summary } : {}),
      charterName: scope ? tone.name : "knowledge",
      color: scope ? tone.color : NEUTRAL,
    };
  }
  if (action.kind === "create_event") {
    const tone = await charterTone(action.scope, cache);
    return {
      kind: action.kind,
      id: "NEW",
      title: action.title,
      lane: null,
      note: [action.date, action.time].filter(Boolean).join(" "),
      charterName: tone.name,
      color: tone.color,
    };
  }
  const existing = (await listEvents({})).find((e) => e.id === action.id);
  const tone = await charterTone(action.scope ?? existing?.scope, cache);
  return {
    kind: action.kind,
    id: action.id,
    title: action.title ?? existing?.title ?? action.id,
    lane: null,
    note: action.done
      ? "mark done"
      : [action.date ?? existing?.date, action.time ?? existing?.time].filter(Boolean).join(" "),
    charterName: tone.name,
    color: tone.color,
  };
}

export async function buildProposal(input: ProposalInput): Promise<Proposal> {
  if (!input.title) throw new Error("proposeChanges requires a title");
  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    throw new Error("proposeChanges requires a non-empty actions array");
  }
  const cache = new Map<string, { name: string; color: string }>();
  const preview: ProposalPreviewRow[] = [];
  for (const action of input.actions) {
    preview.push(await previewRow(action, cache));
  }
  return {
    proposalId: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    summary: input.summary,
    actions: input.actions,
    preview,
  };
}

function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.done && t.section !== "done");
}

export const toolImpls = {
  async listProjects(): Promise<Charter[]> {
    return listCharters("project");
  },

  async listAreas(): Promise<Charter[]> {
    return listCharters("area");
  },

  async getContext(input: { type?: ProjectType; slug?: string }): Promise<{
    charter: Charter | null;
    openTasks: Task[];
    about: string;
  }> {
    const about = await getAbout();
    if (!input.slug) {
      return { charter: null, openTasks: [], about };
    }
    const type: ProjectType = input.type ?? "project";
    let charter: Charter;
    try {
      charter = await getCharter(type, input.slug);
    } catch {
      throw new Error(`Charter not found: ${type}/${input.slug}`);
    }
    const tasks = await listTasks(type, input.slug);
    return { charter, openTasks: openTasks(tasks), about };
  },

  async createProject(input: { name: string; why: string; mvp: string }): Promise<Charter> {
    if (!input.name) throw new Error("createProject requires a name");
    if (!input.why) throw new Error("createProject requires a why");
    if (!input.mvp) throw new Error("createProject requires an mvp");
    return createCharter({ type: "project", name: input.name, why: input.why, mvp: input.mvp });
  },

  async createArea(input: { name: string; why: string }): Promise<Charter> {
    if (!input.name) throw new Error("createArea requires a name");
    if (!input.why) throw new Error("createArea requires a why");
    return createCharter({ type: "area", name: input.name, why: input.why });
  },

  async createTask(input: {
    project: string;
    title: string;
    size: TaskSize;
    waitsOn?: string;
  }): Promise<Task> {
    if (!input.project) throw new Error("createTask requires a project (slug or area:<slug>)");
    if (!input.title) throw new Error("createTask requires a title");
    const size = input.size ?? "M";
    const scope = parseScope(input.project);
    return addTask(scope.type, scope.slug, { title: input.title, size, waitsOn: input.waitsOn });
  },

  async updateTask(input: {
    project: string;
    id: string;
    title?: string;
    size?: TaskSize;
    section?: Task["section"];
    est?: string;
    due?: string;
    waitsOn?: string;
    complete?: boolean;
  }): Promise<Task> {
    if (!input.project) throw new Error("updateTask requires a project (slug or area:<slug>)");
    if (!input.id) throw new Error("updateTask requires an id");
    const scope = parseScope(input.project);
    const { title, size, section, est, due, waitsOn, complete } = input;
    return updateTask(scope.type, scope.slug, input.id, {
      title,
      size,
      section,
      est,
      due,
      waitsOn,
      complete,
    });
  },

  async decomposeTask(input: {
    project: string;
    id: string;
    subtasks: { title: string; size: TaskSize }[];
  }): Promise<Task[]> {
    if (!input.project) throw new Error("decomposeTask requires a project (slug or area:<slug>)");
    if (!input.id) throw new Error("decomposeTask requires an id");
    if (!Array.isArray(input.subtasks) || input.subtasks.length === 0) {
      throw new Error("decomposeTask requires a non-empty subtasks array");
    }
    const scope = parseScope(input.project);
    const created: Task[] = [];
    for (const sub of input.subtasks) {
      if (!sub.title) throw new Error("decomposeTask subtask requires a title");
      created.push(
        await addTask(scope.type, scope.slug, {
          title: sub.title,
          size: sub.size ?? "M",
          parentId: input.id,
        }),
      );
    }
    return created;
  },

  async moveToParkingLot(input: { project: string; idea: string }): Promise<Charter> {
    if (!input.project) throw new Error("moveToParkingLot requires a project (slug or area:<slug>)");
    if (!input.idea) throw new Error("moveToParkingLot requires an idea");
    const scope = parseScope(input.project);
    const charter = await getCharter(scope.type, scope.slug);
    const parkingLot = [...charter.parkingLot, input.idea];
    return updateCharter(scope.type, scope.slug, { parkingLot });
  },

  async addJournal(input: { scope: string; message: string }): Promise<{ ok: true }> {
    if (!input.scope) throw new Error("addJournal requires a scope");
    if (!input.message) throw new Error("addJournal requires a message");
    await appendJournal(input.scope, input.message);
    return { ok: true };
  },

  async listEvents(input: { from?: string; to?: string }): Promise<CalendarEvent[]> {
    return listEvents({ from: input.from, to: input.to });
  },

  async createEvent(input: {
    date: string;
    title: string;
    time?: string;
    note?: string;
    scope?: string;
    action?: string;
  }): Promise<CalendarEvent> {
    if (!input.date) throw new Error("createEvent requires a date (YYYY-MM-DD)");
    if (!input.title) throw new Error("createEvent requires a title");
    return addEvent(input);
  },

  async updateEvent(input: {
    id: string;
    date?: string;
    title?: string;
    time?: string;
    note?: string;
    scope?: string;
    action?: string;
    done?: boolean;
  }): Promise<CalendarEvent> {
    if (!input.id) throw new Error("updateEvent requires an id");
    const { id, ...patch } = input;
    return updateEvent(id, patch);
  },

  async proposeChanges(input: ProposalInput): Promise<Proposal> {
    return buildProposal(input);
  },

  async nextActions(): Promise<NextAction[]> {
    return getNextActions();
  },

  async getDaily(): Promise<DailyData> {
    return getDaily();
  },

  async logDaily(input: { id: string }): Promise<{ id: string; delta: number | "reset" }> {
    if (!input.id) throw new Error("logDaily requires a habit or rhythm id");
    return logDaily(input.id);
  },

  async addGrocery(input: { name: string; cat?: string }): Promise<Grocery> {
    if (!input.name) throw new Error("addGrocery requires a name");
    return addGrocery(input.name, input.cat ?? "Other");
  },

  async setGrocery(input: { id: string; got: boolean }): Promise<Grocery> {
    if (!input.id) throw new Error("setGrocery requires an id");
    if (typeof input.got !== "boolean") throw new Error("setGrocery requires got as a boolean");
    return toggleGrocery(input.id, input.got);
  },

  async searchKnowledge(input: {
    query: string;
    scope?: string;
    tags?: string[];
    limit?: number;
  }): Promise<KnowledgeHit[]> {
    if (!input.query || !input.query.trim()) {
      throw new Error("searchKnowledge requires a query");
    }
    return searchNotes({
      q: input.query,
      scope: input.scope,
      tags: input.tags,
      limit: input.limit,
    });
  },

  async readNote(input: {
    id: string;
  }): Promise<{ note: KnowledgeNote; links: string[]; backlinks: string[] }> {
    if (!input.id) throw new Error("readNote requires a note id");
    return readNote(input.id);
  },

  async addNote(input: {
    title?: string;
    summary: string;
    body?: string;
    scope?: string[];
    tags?: string[];
    source?: string;
  }): Promise<FileNoteResult> {
    if (!input.summary) throw new Error("addNote requires a summary");
    return fileNote(input);
  },

  async updateNote(input: {
    id: string;
    title?: string;
    summary?: string;
    body?: string;
    scope?: string[];
    tags?: string[];
    source?: string;
  }): Promise<KnowledgeNote> {
    if (!input.id) throw new Error("updateNote requires a note id");
    const { id, ...patch } = input;
    return updateNote(id, patch);
  },

  async weeklySummary(): Promise<{
    insights: Insights;
    journalDigest: string;
    daily: { habitDaysMet: number; rhythmsMet: number; rhythmsTotal: number; servingsEaten: number };
  }> {
    const insights = await getInsights();
    const days = await readJournal(7);
    const journalDigest = days
      .map((d) => `## ${d.date}\n` + d.entries.map((e) => `- ${e.time} [${e.scope}] ${e.message}`).join("\n"))
      .join("\n\n");
    const today = isoToday();
    const daily = dailySummary(await getDaily(), shiftIso(today, -6), today);
    return { insights, journalDigest, daily };
  },
};
