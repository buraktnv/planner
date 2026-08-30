import { normaliseOutput } from "./chat-parts";
import type { TaskLane } from "@/lib/core/types";

/**
 * The model picks its UI by picking a tool, and the client owns a registry of
 * renderers keyed by tool name. This is the only shape of generative UI the two
 * provider paths allow: a new stream part type would have to be implemented
 * twice, once in a hand-written mapper, and there is deliberately no tool that
 * lets the model emit arbitrary layout — it could not be typed, could not be
 * tested in a node environment, and would hand the look of the app to the least
 * reliable component in the system.
 *
 * Everything here reads *normalised* output, so a card works identically on the
 * AI SDK path (objects) and the claude-subscription path (JSON strings).
 *
 * Every reader below returns null rather than throwing on a shape it does not
 * recognise. A tool result is model-adjacent data arriving mid-stream, half
 * built; a card that throws takes the whole rail down with it.
 */

function rows(output: unknown): unknown[] | null {
  const value = normaliseOutput(output);
  return Array.isArray(value) ? value : null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/* ------------------------------------------------------------ next_actions */

export interface NextActionCard {
  id: string;
  title: string;
  charter: string;
  scope: string | null;
  lane: TaskLane | null;
  blocked: boolean;
  due: string | null;
}

const LANES = new Set(["quick", "deep", "wait", "some"]);

function laneOf(value: unknown): TaskLane | null {
  return typeof value === "string" && LANES.has(value) ? (value as TaskLane) : null;
}

/** A charter's scope key, the form task links already take elsewhere. */
function scopeOf(charter: Record<string, unknown> | null): string | null {
  if (!charter) return null;
  const id = str(charter.id);
  if (!id) return null;
  return charter.type === "area" ? `area:${id}` : id;
}

export function readNextActions(output: unknown): NextActionCard[] | null {
  const list = rows(output);
  if (!list) return null;
  const out: NextActionCard[] = [];
  for (const entry of list) {
    const row = obj(entry);
    const task = obj(row?.task);
    const charter = obj(row?.charter);
    const id = str(task?.id);
    const title = str(task?.title);
    if (!id || !title) continue;
    out.push({
      id,
      title,
      charter: str(charter?.name) ?? "",
      scope: scopeOf(charter),
      lane: laneOf(task?.lane),
      blocked: row?.blocked === true,
      due: str(task?.due),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- get_daily */

export interface DailyRowCard {
  id: string;
  name: string;
  goal: number;
  unit: string | null;
}

export interface DailyCard {
  habits: DailyRowCard[];
  rhythms: DailyRowCard[];
  meals: { id: string; name: string; servings: number }[];
  groceriesOpen: number;
}

export function readDaily(output: unknown): DailyCard | null {
  const data = obj(normaliseOutput(output));
  if (!data) return null;
  if (!Array.isArray(data.habits) && !Array.isArray(data.rhythms) && !Array.isArray(data.meals)) {
    return null;
  }

  const readRows = (value: unknown, goalKey: "goal" | "per"): DailyRowCard[] => {
    if (!Array.isArray(value)) return [];
    const out: DailyRowCard[] = [];
    for (const entry of value) {
      const row = obj(entry);
      const id = str(row?.id);
      const name = str(row?.name);
      if (!id || !name) continue;
      out.push({ id, name, goal: num(row?.[goalKey]) ?? 0, unit: str(row?.unit) });
    }
    return out;
  };

  const meals: DailyCard["meals"] = [];
  if (Array.isArray(data.meals)) {
    for (const entry of data.meals) {
      const row = obj(entry);
      const id = str(row?.id);
      const name = str(row?.name);
      if (!id || !name) continue;
      meals.push({ id, name, servings: num(row?.servings) ?? 0 });
    }
  }

  const groceries = Array.isArray(data.groceries) ? data.groceries : [];
  const groceriesOpen = groceries.filter((g) => obj(g)?.got !== true).length;

  return {
    habits: readRows(data.habits, "goal"),
    rhythms: readRows(data.rhythms, "per"),
    meals,
    groceriesOpen,
  };
}

/* ------------------------------------------------------------- list_targets */

export interface TargetCard {
  id: string | null;
  title: string;
  charter: string;
  milestone: string | null;
  by: string | null;
  done: boolean;
  pct: number;
  linkedTasks: number;
}

export function readTargets(output: unknown): TargetCard[] | null {
  const list = rows(output);
  if (!list) return null;
  const out: TargetCard[] = [];
  for (const entry of list) {
    const row = obj(entry);
    const title = str(row?.title);
    if (!title) continue;
    out.push({
      id: str(row?.id),
      title,
      charter: str(row?.charter) ?? "",
      milestone: str(row?.milestone),
      by: str(row?.by),
      done: row?.done === true,
      pct: Math.max(0, Math.min(100, num(row?.pct) ?? 0)),
      linkedTasks: num(row?.linkedTasks) ?? 0,
    });
  }
  return out;
}

/* --------------------------------------------------- search_knowledge / read_note */

export interface NoteCard {
  id: string;
  title: string;
  summary: string;
  scope: string[];
  tags: string[];
}

function readNoteRow(value: unknown): NoteCard | null {
  const row = obj(value);
  const id = str(row?.id);
  const title = str(row?.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    summary: str(row?.summary) ?? "",
    scope: Array.isArray(row?.scope) ? row.scope.filter((s): s is string => typeof s === "string") : [],
    tags: Array.isArray(row?.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [],
  };
}

export function readNotes(output: unknown): NoteCard[] | null {
  const list = rows(output);
  if (!list) return null;
  return list.map(readNoteRow).filter((n): n is NoteCard => n !== null);
}

/** read_note answers with { note, links, backlinks }, not a bare note. */
export function readOneNote(output: unknown): NoteCard | null {
  const value = obj(normaliseOutput(output));
  if (!value) return null;
  return readNoteRow(value.note ?? value);
}

/* ------------------------------------------------------------- write receipts */

export interface ReceiptCard {
  id: string;
  title: string;
  scope: string | null;
}

/**
 * What a direct write actually did. The tools answer with the written record,
 * so the id is real and the card can link straight to it.
 */
export function readTaskReceipt(output: unknown, project?: unknown): ReceiptCard | null {
  const row = obj(normaliseOutput(output));
  const id = str(row?.id);
  if (!id) return null;
  return {
    id,
    title: str(row?.title) ?? id,
    scope: str(obj(project)?.project) ?? null,
  };
}
