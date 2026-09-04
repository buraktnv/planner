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
import {
  addCanvasEdge,
  canvasRefOk,
  edgeKey,
  readCanvas,
  removeCanvasEdge,
  saveNodePositions,
  type CanvasEdgeKind,
  type CanvasSurface,
} from "../core/canvas";
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

export interface CanvasToolInput {
  project?: string;
  map?: "system" | "tasks";
}

/** What one card on a map looks like to a caller that cannot see the screen. */
export interface CanvasCardView {
  ref: string;
  title: string;
  type: "note" | "task" | "target" | "group" | "missing";
  /** null when the card exists but has never been placed, so the board auto-positions it. */
  x: number | null;
  y: number | null;
  w?: number;
  h?: number;
  placed: boolean;
}

/** A whole board is a poor answer to a question about one map; cap it. */
const CANVAS_CARD_CAP = 200;

/**
 * Which canvas a tool call means: no `project` is the global knowledge board,
 * and with a project `map` picks its component map or its task map.
 *
 * The charter is resolved through `getCharter` before anything else, and the
 * surface carries `charter.id` rather than the caller's string. `canvasPathFor`
 * interpolates the slug straight into a file path, and a slug that resolved to
 * a real charter cannot be a traversal.
 */
async function canvasSurfaceOf(input: CanvasToolInput): Promise<CanvasSurface> {
  if (!input.project) {
    if (input.map) {
      throw new Error("map applies to a project or area — omit it for the knowledge board");
    }
    return { kind: "knowledge" };
  }
  const { type, slug } = parseScope(input.project);
  const charter = await getCharter(type, slug);
  return { kind: input.map ?? "system", type, slug: charter.id };
}

/**
 * The cards that *could* be on this map, by ref. A node line records where a
 * card sits and nothing about what it is, so this is the only thing that can
 * turn `K-014` back into a title — and the only way to tell a card whose note
 * was deleted from one that is merely unplaced.
 */
async function canvasCards(
  surface: CanvasSurface,
): Promise<Map<string, { title: string; type: CanvasCardView["type"] }>> {
  const out = new Map<string, { title: string; type: CanvasCardView["type"] }>();

  if (surface.kind === "tasks") {
    const [tasks, charter] = await Promise.all([
      listTasks(surface.type, surface.slug).catch(() => []),
      getCharter(surface.type, surface.slug),
    ]);
    for (const t of tasks) out.set(t.id, { title: t.title, type: "task" });
    for (const g of targetsOf(charter.mvpScope)) {
      if (g.id) out.set(g.id, { title: g.title, type: "target" });
    }
    return out;
  }

  const scopeKey =
    surface.kind === "system"
      ? surface.type === "area"
        ? `area:${surface.slug}`
        : surface.slug
      : null;
  for (const n of await listNotes()) {
    if (scopeKey && !n.scope.includes(scopeKey)) continue;
    out.set(n.id, { title: n.title, type: "note" });
  }
  return out;
}

/** `group:core` is synthetic — the charter's own Why, with no record behind it. */
function isGroupRef(ref: string): boolean {
  return ref.toLowerCase().startsWith("group:");
}

function cleanRef(value: unknown, field: string): string {
  const ref = typeof value === "string" ? value.trim() : "";
  if (!canvasRefOk(ref)) {
    throw new Error(
      `${field} is not a card ref: ${ref || "(empty)"} — use a note (K-001), a task (T-007) or a target (G-001) id`,
    );
  }
  return ref;
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
  if (action.kind === "connect_cards" || action.kind === "disconnect_cards") {
    const tone = await charterTone(action.project, cache);
    const map = action.project ? `${action.map ?? "system"} map` : "knowledge board";
    const relation = action.relation ?? "rel";
    return {
      kind: action.kind,
      id: "ARROW",
      title: `${action.from} → ${action.to}`,
      lane: null,
      note:
        action.kind === "connect_cards"
          ? `${relation} · ${map}`
          : `remove ${relation} · ${map}`,
      charterName: action.project ? tone.name : "knowledge",
      color: action.project ? tone.color : NEUTRAL,
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

  /**
   * A map as data. `list_components` answers "what requires what" for a
   * project's system map; this answers "what is actually drawn, and where" for
   * any of the three, which is what a caller needs before it moves a card or
   * draws an arrow. Positions are absolute, so placing blind overlaps.
   *
   * The bare `readCanvas` calls below are the `lib/core` reader, not this
   * method — an object's own method names are not in scope inside it.
   */
  async readCanvas(input: CanvasToolInput): Promise<{
    map: CanvasSurface["kind"];
    project: string | null;
    cards: CanvasCardView[];
    truncated: number;
    edges: { from: string; to: string; relation: CanvasEdgeKind; label?: string }[];
    orphans: string[];
  }> {
    const surface = await canvasSurfaceOf(input);
    const [file, live] = await Promise.all([readCanvas(surface), canvasCards(surface)]);

    const placed: CanvasCardView[] = file.nodes.map((n) => {
      const hit = live.get(n.ref);
      return {
        ref: n.ref,
        title: hit?.title ?? (isGroupRef(n.ref) ? n.ref : ""),
        type: hit?.type ?? (isGroupRef(n.ref) ? "group" : "missing"),
        x: n.x,
        y: n.y,
        ...(n.w !== undefined ? { w: n.w } : {}),
        ...(n.h !== undefined ? { h: n.h } : {}),
        placed: true,
      };
    });
    const seen = new Set(file.nodes.map((n) => n.ref));
    const unplaced: CanvasCardView[] = [...live]
      .filter(([ref]) => !seen.has(ref))
      .map(([ref, v]) => ({ ref, title: v.title, type: v.type, x: null, y: null, placed: false }));

    const byRef = (a: CanvasCardView, b: CanvasCardView) => a.ref.localeCompare(b.ref);
    const cards = [...placed.sort(byRef), ...unplaced.sort(byRef)];

    return {
      map: surface.kind,
      project: input.project ?? null,
      cards: cards.slice(0, CANVAS_CARD_CAP),
      truncated: Math.max(0, cards.length - CANVAS_CARD_CAP),
      edges: file.edges.map((e) => ({
        from: e.from,
        to: e.to,
        relation: e.kind,
        ...(e.label ? { label: e.label } : {}),
      })),
      orphans: file.nodes.filter((n) => !live.has(n.ref) && !isGroupRef(n.ref)).map((n) => n.ref),
    };
  },

  async placeCard(
    input: CanvasToolInput & { ref: string; x: number; y: number; w?: number; h?: number },
  ): Promise<{ ref: string; x: number; y: number; w?: number; h?: number }> {
    const surface = await canvasSurfaceOf(input);
    const ref = cleanRef(input.ref, "ref");
    const x = Number(input.x);
    const y = Number(input.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("placeCard requires x and y as numbers");
    }

    // applyMoves silently skips a ref it does not like, so a card that is not
    // on this map would otherwise be a successful call that wrote nothing.
    const live = await canvasCards(surface);
    if (!live.has(ref) && !isGroupRef(ref)) {
      throw new Error(`placeCard: ${ref} is not a card on this map — read_canvas lists the ones that are`);
    }

    const file = await saveNodePositions(surface, [
      {
        ref,
        x,
        y,
        ...(input.w !== undefined ? { w: Number(input.w) } : {}),
        ...(input.h !== undefined ? { h: Number(input.h) } : {}),
      },
    ]);
    const node = file.nodes.find((n) => n.ref === ref);
    return {
      ref,
      x: node?.x ?? Math.round(x),
      y: node?.y ?? Math.round(y),
      ...(node?.w !== undefined ? { w: node.w } : {}),
      ...(node?.h !== undefined ? { h: node.h } : {}),
    };
  },

  /**
   * Both refs must be cards on this map. The parser tolerates a stale ref — it
   * has to, since a note can be deleted after the arrow was drawn — but a
   * *new* arrow to a ref that is not there draws nothing visible, so a typo
   * would look like success and cost an empty commit.
   */
  async connectCards(
    input: CanvasToolInput & {
      from: string;
      to: string;
      relation?: CanvasEdgeKind;
      label?: string;
    },
  ): Promise<{ from: string; to: string; relation: CanvasEdgeKind; label?: string; added: boolean }> {
    const surface = await canvasSurfaceOf(input);
    const from = cleanRef(input.from, "from");
    const to = cleanRef(input.to, "to");
    if (from === to) throw new Error("connectCards: a card cannot point at itself");

    const relation: CanvasEdgeKind = input.relation ?? "rel";
    const live = await canvasCards(surface);
    for (const [field, ref] of [
      ["from", from],
      ["to", to],
    ] as const) {
      if (!live.has(ref) && !isGroupRef(ref)) {
        throw new Error(`connectCards: ${field} ${ref} is not a card on this map`);
      }
    }

    // Informational only — addCanvasEdge re-reads inside the lock and merges,
    // so nothing is decided by what this read saw.
    const before = await readCanvas(surface);
    const key = edgeKey({ from, to, kind: relation });
    const existed = before.edges.some((e) => edgeKey(e) === key);

    await addCanvasEdge(surface, {
      from,
      to,
      kind: relation,
      ...(input.label ? { label: input.label } : {}),
    });
    return {
      from,
      to,
      relation,
      ...(input.label ? { label: input.label } : {}),
      added: !existed,
    };
  },

  /** No existence check: removing an arrow to a note that is already gone is the point. */
  async disconnectCards(
    input: CanvasToolInput & { from: string; to: string; relation?: CanvasEdgeKind },
  ): Promise<{ from: string; to: string; relation: CanvasEdgeKind; removed: boolean }> {
    const surface = await canvasSurfaceOf(input);
    const from = cleanRef(input.from, "from");
    const to = cleanRef(input.to, "to");
    const relation: CanvasEdgeKind = input.relation ?? "rel";

    const before = await readCanvas(surface);
    const key = edgeKey({ from, to, kind: relation });
    const existed = before.edges.some((e) => edgeKey(e) === key);

    await removeCanvasEdge(surface, { from, to, kind: relation });
    return { from, to, relation, removed: existed };
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
