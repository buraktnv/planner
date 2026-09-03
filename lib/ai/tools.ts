import fs from "node:fs/promises";
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
import { targetsOf, targetProgress } from "../view/targets";
import { addEvent, listEvents, updateEvent } from "../core/calendar";
import type { CalendarEvent } from "../core/types";
import {
  addGrocery,
  addHabit,
  addMeal,
  addRhythm,
  dailySummary,
  getDaily,
  logDaily,
  toggleGrocery,
} from "../core/daily";
import type { DailyData, Grocery, Habit, Meal, Rhythm } from "../core/types";
import { hueOf, isoToday, shiftIso } from "../ui/momentum";
import { laneOf } from "../core/lanes";
import type {
  Proposal,
  ProposalAction,
  ProposalInput,
  ProposalPreviewRow,
} from "./schemas";
import { deriveTitle, listNotes, readNote, searchNotes, updateNote } from "../core/knowledge";
import { saveAsset } from "../core/assets";
import { readCanvas } from "../core/canvas";
import { noteProgress } from "../view/canvas";
import { readDetail, writeDetail } from "../core/details";
import { appendComment, readComments } from "../core/comments";
import { fileProposal } from "../core/proposals";
import { fileNote, type FileNoteResult } from "./file-note";
import type { KnowledgeHit, KnowledgeNote } from "../core/types";
import { getInsights, type Insights } from "../core/insights";
import { getLifeTrends, type LifeTrends } from "../core/trends";
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
/** The raw log is append-only and grows for ever; the model gets a window of it. */
const DAILY_LOG_DAYS = 28;

function eventNote(when: string, repeat?: string, lead?: number): string {
  return [when, repeat || null, lead ? `lead ${lead}d` : null].filter(Boolean).join(" · ");
}

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
      lane: action.lane ?? laneFor({ title: action.title, size: action.size }),
      // A proposed date the card never mentions is worse than no date at all.
      note: action.due
        ? `due ${action.due}`
        : action.waitsOn
          ? `waits on ${action.waitsOn}`
          : "",
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
      ...(existing ? { scope: action.project } : {}),
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
      ...(existing ? { scope: action.project } : {}),
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
      note: eventNote([action.date, action.time].filter(Boolean).join(" "), action.repeat, action.lead),
      charterName: tone.name,
      color: tone.color,
    };
  }
  if (action.kind === "update_event") {
    const existing = (await listEvents({})).find((e) => e.id === action.id);
    const tone = await charterTone(action.scope ?? existing?.scope, cache);
    const repeat = action.repeat ?? existing?.repeat;
    return {
      kind: action.kind,
      id: action.id,
      title: action.title ?? existing?.title ?? action.id,
      lane: null,
      note: action.done
        ? repeat
          ? "advance to next occurrence"
          : "mark done"
        : eventNote(
            [action.date ?? existing?.date, action.time ?? existing?.time].filter(Boolean).join(" "),
            repeat,
            action.lead ?? existing?.lead,
          ),
      charterName: tone.name,
      color: tone.color,
    };
  }
  if (action.kind === "create_habit") {
    return {
      kind: action.kind,
      id: "NEW",
      title: action.name,
      lane: null,
      note: `habit · ${action.goal}×${action.unit ? ` ${action.unit}` : ""} a day`,
      charterName: "daily",
      color: NEUTRAL,
    };
  }
  if (action.kind === "create_rhythm") {
    return {
      kind: action.kind,
      id: "NEW",
      title: action.name,
      lane: null,
      note: `rhythm · ${action.per}× a week`,
      charterName: "daily",
      color: NEUTRAL,
    };
  }
  if (action.kind === "create_meal") {
    return {
      kind: action.kind,
      id: "NEW",
      title: action.name,
      lane: null,
      note: `meal · ${action.servings} servings`,
      charterName: "daily",
      color: NEUTRAL,
    };
  }
  if (action.kind === "create_project") {
    return {
      kind: action.kind,
      id: "NEW",
      title: action.name,
      lane: null,
      note: `new project · mvp: ${action.mvp}`,
      detail: action.why,
      charterName: "new charter",
      color: NEUTRAL,
    };
  }
  if (action.kind === "create_area") {
    return {
      kind: action.kind,
      id: "NEW",
      title: action.name,
      lane: null,
      note: "new life area",
      detail: action.why,
      charterName: "new charter",
      color: NEUTRAL,
    };
  }
  /**
   * Exhaustive on purpose. This used to fall through to update_event, so a new
   * action kind added without a branch here rendered as a calendar event on the
   * Accept card rather than failing — a preview that lies about what it is
   * about to write. The compiler now refuses the omission instead.
   */
  return assertNever(action);
}

function assertNever(action: never): never {
  const kind = (action as { kind?: string }).kind ?? "unknown";
  throw new Error(`previewRow has no branch for proposal action: ${kind}`);
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
    est?: string;
    due?: string;
    lane?: TaskLane;
    target?: string;
    note?: string;
    waitsOn?: string;
    description?: string;
  }): Promise<Task> {
    if (!input.project) throw new Error("createTask requires a project (slug or area:<slug>)");
    if (!input.title) throw new Error("createTask requires a title");
    const size = input.size ?? "M";
    const scope = parseScope(input.project);
    const task = await addTask(scope.type, scope.slug, {
      title: input.title,
      size,
      est: input.est,
      due: input.due,
      lane: input.lane,
      target: input.target,
      note: input.note,
      waitsOn: input.waitsOn,
    });
    // After addTask returns, never inside it: both take the data lock and the
    // lock is not re-entrant.
    if (input.description && input.description.trim()) {
      await writeDetail(scope.type, scope.slug, task.id, input.description);
    }
    return task;
  },

  async updateTask(input: {
    project: string;
    id: string;
    title?: string;
    size?: TaskSize;
    section?: Task["section"];
    est?: string;
    due?: string;
    target?: string;
    note?: string;
    waitsOn?: string;
    complete?: boolean;
  }): Promise<Task> {
    if (!input.project) throw new Error("updateTask requires a project (slug or area:<slug>)");
    if (!input.id) throw new Error("updateTask requires an id");
    const scope = parseScope(input.project);
    const { title, size, section, est, due, target, note, waitsOn, complete } = input;
    return updateTask(scope.type, scope.slug, input.id, {
      title,
      size,
      section,
      est,
      due,
      target,
      note,
      waitsOn,
      complete,
    });
  },

  async decomposeTask(input: {
    project: string;
    id: string;
    subtasks: { title: string; size: TaskSize; plan?: string }[];
    reason?: string;
  }): Promise<Task[]> {
    if (!input.project) throw new Error("decomposeTask requires a project (slug or area:<slug>)");
    if (!input.id) throw new Error("decomposeTask requires an id");
    if (!Array.isArray(input.subtasks) || input.subtasks.length === 0) {
      throw new Error("decomposeTask requires a non-empty subtasks array");
    }
    const scope = parseScope(input.project);
    // Logged before the subtasks exist, so the entry explains what follows it.
    // A comment rather than the description, because the description is
    // overwritten and why-we-split is worth keeping dated.
    if (input.reason && input.reason.trim()) {
      await appendComment(scope.type, scope.slug, input.id, input.reason);
    }
    const created: Task[] = [];
    for (const sub of input.subtasks) {
      if (!sub.title) throw new Error("decomposeTask subtask requires a title");
      const task = await addTask(scope.type, scope.slug, {
        title: sub.title,
        size: sub.size ?? "M",
        parentId: input.id,
      });
      if (sub.plan && sub.plan.trim()) {
        await writeDetail(scope.type, scope.slug, task.id, sub.plan);
      }
      created.push(task);
    }
    return created;
  },

  async readTaskDetail(input: {
    project: string;
    id: string;
  }): Promise<{ id: string; body: string }> {
    if (!input.project) throw new Error("readTaskDetail requires a project (slug or area:<slug>)");
    if (!input.id) throw new Error("readTaskDetail requires an id");
    const scope = parseScope(input.project);
    const body = await readDetail(scope.type, scope.slug, input.id);
    return { id: input.id, body: body ?? "" };
  },

  async writeTaskDetail(input: {
    project: string;
    id: string;
    body: string;
  }): Promise<{ id: string; body: string }> {
    if (!input.project) throw new Error("writeTaskDetail requires a project (slug or area:<slug>)");
    if (!input.id) throw new Error("writeTaskDetail requires an id");
    if (typeof input.body !== "string") throw new Error("writeTaskDetail requires a body string");
    const scope = parseScope(input.project);
    const tasks = await listTasks(scope.type, scope.slug);
    if (!tasks.some((t) => t.id === input.id)) {
      throw new Error(`Task not found: ${input.id} in ${input.project}`);
    }
    await writeDetail(scope.type, scope.slug, input.id, input.body);
    const body = await readDetail(scope.type, scope.slug, input.id);
    return { id: input.id, body: body ?? "" };
  },

  async readTaskComments(input: {
    project: string;
    id: string;
    limit?: number;
  }): Promise<{ id: string; entries: { date: string; time: string; body: string }[] }> {
    if (!input.project) {
      throw new Error("readTaskComments requires a project (slug or area:<slug>)");
    }
    if (!input.id) throw new Error("readTaskComments requires an id");
    const scope = parseScope(input.project);
    const all = await readComments(scope.type, scope.slug, input.id);
    const limit = input.limit && input.limit > 0 ? Math.min(input.limit, 50) : 50;
    const entries = all.slice(-limit).map((e) => ({ date: e.date, time: e.time, body: e.body }));
    return { id: input.id, entries };
  },

  async addTaskComment(input: {
    project: string;
    id: string;
    body: string;
  }): Promise<{ id: string; entry: { date: string; time: string; body: string } }> {
    if (!input.project) throw new Error("addTaskComment requires a project (slug or area:<slug>)");
    if (!input.id) throw new Error("addTaskComment requires an id");
    if (typeof input.body !== "string") throw new Error("addTaskComment requires a body string");
    const scope = parseScope(input.project);
    const tasks = await listTasks(scope.type, scope.slug);
    if (!tasks.some((t) => t.id === input.id)) {
      throw new Error(`Task not found: ${input.id} in ${input.project}`);
    }
    const entry = await appendComment(scope.type, scope.slug, input.id, input.body);
    return { id: input.id, entry: { date: entry.date, time: entry.time, body: entry.body } };
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
    repeat?: string;
    lead?: number;
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
    repeat?: string;
    lead?: number;
    done?: boolean;
  }): Promise<CalendarEvent> {
    if (!input.id) throw new Error("updateEvent requires an id");
    const { id, ...patch } = input;
    return updateEvent(id, patch);
  },

  /**
   * Builds the preview *and* files it, so the batch can still be accepted from
   * `/proposals` after the conversation that produced it is gone. Every surface
   * reaches this one impl through `toolImplMap` — the AI SDK chat route, the
   * subscription path, and the external MCP server — which is why the hook lives
   * here rather than in `buildProposal`, whose other caller is journal
   * distillation and has its own pending queue.
   *
   * Filing must never fail the tool call: an agent losing its answer because an
   * inbox write failed is worse than an unfiled proposal.
   */
  async proposeChanges(input: ProposalInput): Promise<Proposal> {
    const proposal = await buildProposal(input);
    try {
      await fileProposal(
        {
          proposalId: proposal.proposalId,
          title: proposal.title,
          summary: proposal.summary,
          actions: proposal.actions,
        },
        process.env.PLANNER_AGENT?.trim() || "chat",
      );
    } catch (err) {
      console.error("could not file proposal", proposal.proposalId, err);
    }
    return proposal;
  },

  async listTargets(input: { project?: string } = {}): Promise<
    {
      charter: string;
      id: string | null;
      title: string;
      milestone: string | null;
      by: string | null;
      done: boolean;
      pct: number;
      linkedTasks: number;
    }[]
  > {
    const charters = input.project
      ? [await getCharter(parseScope(input.project).type, parseScope(input.project).slug)]
      : await listCharters();

    const out = [];
    for (const c of charters) {
      const tasks = await listTasks(c.type, c.id).catch(() => []);
      for (const t of targetsOf(c.mvpScope)) {
        const progress = targetProgress(t, tasks);
        out.push({
          charter: c.type === "area" ? `area:${c.id}` : c.id,
          id: t.id,
          title: t.title,
          milestone: t.milestone,
          by: t.by,
          done: t.done,
          pct: progress.pct,
          linkedTasks: progress.total,
        });
      }
    }
    return out;
  },

  /**
   * The system map as data. An arrow saying "camera control must exist before
   * YOLO nano is worth building" is knowledge, not decoration — and knowledge
   * only the canvas can see is knowledge the assistant cannot use.
   */
  async listComponents(input: { project: string }): Promise<
    {
      id: string;
      title: string;
      summary: string;
      requires: string[];
      requiredBy: string[];
      triggers: string[];
      triggeredBy: string[];
      tasks: { done: number; total: number };
    }[]
  > {
    if (!input.project) throw new Error("listComponents requires a project or area");
    const { type, slug } = parseScope(input.project);
    const scopeKey = type === "area" ? `area:${slug}` : slug;
    const [notes, file, tasks] = await Promise.all([
      listNotes(),
      readCanvas({ kind: "system", type, slug }),
      listTasks(type, slug).catch(() => []),
    ]);

    const scoped = notes.filter((n) => n.scope.includes(scopeKey));
    const live = new Set(scoped.map((n) => n.id));
    const pick = (kind: string, dir: "from" | "to", id: string) =>
      file.edges
        .filter((e) => e.kind === kind && e[dir] === id)
        .map((e) => (dir === "from" ? e.to : e.from))
        .filter((ref) => live.has(ref));

    return scoped.map((n) => {
      const p = noteProgress(n.id, tasks);
      return {
        id: n.id,
        title: n.title,
        summary: n.summary,
        requires: pick("requires", "from", n.id),
        requiredBy: pick("requires", "to", n.id),
        triggers: pick("triggers", "from", n.id),
        triggeredBy: pick("triggers", "to", n.id),
        tasks: { done: p.done, total: p.total },
      };
    });
  },

  async nextActions(): Promise<NextAction[]> {
    return getNextActions();
  },

  async getDaily(): Promise<DailyData & { logDays: number }> {
    const data = await getDaily();
    const from = shiftIso(isoToday(), -(DAILY_LOG_DAYS - 1));
    return { ...data, log: data.log.filter((e) => e.date >= from), logDays: DAILY_LOG_DAYS };
  },

  async logDaily(input: { id: string }): Promise<{ id: string; delta: number | "reset" }> {
    if (!input.id) throw new Error("logDaily requires a habit or rhythm id");
    return logDaily(input.id);
  },

  async createHabit(input: { name: string; goal: number; unit?: string }): Promise<Habit> {
    if (!input.name) throw new Error("createHabit requires a name");
    const goal = Number(input.goal);
    if (!Number.isInteger(goal) || goal < 1) {
      throw new Error("createHabit requires goal as a positive whole number");
    }
    return addHabit(input.name, goal, input.unit);
  },

  async createRhythm(input: { name: string; per: number }): Promise<Rhythm> {
    if (!input.name) throw new Error("createRhythm requires a name");
    const per = Number(input.per);
    if (!Number.isInteger(per) || per < 1) {
      throw new Error("createRhythm requires per as a positive whole number");
    }
    return addRhythm(input.name, per);
  },

  async createMeal(input: { name: string; servings: number }): Promise<Meal> {
    if (!input.name) throw new Error("createMeal requires a name");
    const servings = Number(input.servings);
    if (!Number.isInteger(servings) || servings < 1) {
      throw new Error("createMeal requires servings as a positive whole number");
    }
    return addMeal(input.name, servings);
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

  /**
   * Copy an image the agent can already see into the data repo and, when a note
   * is named, link it from that note's body.
   *
   * The path is read on the agent's own machine rather than sent as bytes over
   * HTTP: an MCP client is already trusted with the filesystem, so this adds no
   * reach it did not have. What it must not do is let the path decide the
   * stored name — saveAsset derives that from the bytes.
   */
  async attachImage(input: {
    path: string;
    noteId?: string;
    alt?: string;
  }): Promise<{ ref: string; name: string; bytes: number; deduped: boolean; noteId?: string }> {
    if (!input.path) throw new Error("attachImage requires a path");
    const bytes = await fs.readFile(input.path).catch(() => null);
    if (!bytes) throw new Error(`Could not read ${input.path}`);

    const saved = await saveAsset(new Uint8Array(bytes));
    if (!input.noteId) return { ...saved };

    const { note } = await readNote(input.noteId);
    const alt = (input.alt ?? "").replace(/[\[\]]/g, "");
    const body = note.body.trimEnd();
    await updateNote(input.noteId, {
      body: `${body}${body === "" ? "" : "\n\n"}![${alt}](${saved.ref})\n`,
    });
    return { ...saved, noteId: input.noteId };
  },

  async lifeTrends(): Promise<LifeTrends> {
    return getLifeTrends();
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
