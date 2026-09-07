export type ProjectType = "project" | "area";
export type ProjectStatus = "active" | "paused" | "done" | "abandoned";
export type TaskSize = "S" | "M" | "L";
export type TaskSection = "backlog" | "in-progress" | "done";
export type TaskLane = "quick" | "deep" | "wait" | "some";

export interface Charter {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  priority: number;
  mvp?: string;
  repo?: string;
  created: string;
  updated: string;
  why: string;
  mvpScope: string[];
  parkingLot: string[];
}

export interface Task {
  id: string;
  title: string;
  size: TaskSize;
  lane?: TaskLane;
  done: boolean;
  section: TaskSection;
  created?: string;
  doneDate?: string;
  est?: string;
  due?: string;
  target?: string;
  /** Knowledge note this task does the work of (a component on a system canvas). */
  note?: string;
  waitsOn?: string;
  parentId?: string | null;
}

export type EventRepeat = "yearly" | "monthly" | "weekly";

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  done: boolean;
  time?: string;
  note?: string;
  scope?: string;
  action?: string;
  repeat?: EventRepeat;
  lead?: number;
}

export interface Habit {
  id: string;
  name: string;
  goal: number;
  unit?: string;
}

export interface Rhythm {
  id: string;
  name: string;
  per: number;
}

export interface Meal {
  id: string;
  name: string;
  servings: number;
}

export interface Grocery {
  id: string;
  name: string;
  cat: string;
  got: boolean;
}

export type DailyDelta = number | "reset";

export interface DailyLogEntry {
  date: string;
  time: string;
  id: string;
  delta: DailyDelta;
}

export interface DailyData {
  habits: Habit[];
  rhythms: Rhythm[];
  meals: Meal[];
  groceries: Grocery[];
  log: DailyLogEntry[];
}

export type ProviderType =
  | "claude-subscription"
  | "anthropic-api"
  | "openai-compatible"
  | "openrouter"
  | "deepseek";

export type ProviderEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ProviderProfile {
  id: string;
  type: ProviderType;
  model: string;
  label: string;
  baseUrl?: string;
  apiKeyEnv?: string;
  effort?: ProviderEffort;
}

export interface CatalogModel {
  id: string;
  name: string;
  source: "openrouter" | "deepseek";
  contextLength?: number;
  promptPrice?: number;
  completionPrice?: number;
  reasoning: boolean;
}

export interface ProvidersFile {
  profiles: ProviderProfile[];
  default: string;
}

export interface KnowledgeNote {
  id: string;
  title: string;
  summary: string;
  scope: string[];
  tags: string[];
  created: string;
  updated: string;
  source?: string;
  body: string;
  /**
   * A sixteen-hex-character hash of the human part of the body when the
   * `## For the AI` section was last confirmed against it (`humanHash` in
   * `note-sections.ts`). A hash rather than a date: `updated` has day
   * resolution and a re-save that changed nothing would flag a note that is
   * still true.
   */
  aiChecked?: string;
}

export interface KnowledgeHit {
  id: string;
  title: string;
  summary: string;
  scope: string[];
  tags: string[];
  updated: string;
  score: number;
  snippet: string;
}

export type SearchKind =
  | "note"
  | "charter"
  | "task"
  | "description"
  | "log"
  | "event"
  | "habit"
  | "rhythm"
  | "meal"
  | "grocery"
  | "journal";

/**
 * One searchable row of the whole data repo. Lives here rather than beside
 * the index because the palette is a client component: a type-only import is
 * erased, where a value import from `lib/core` is not.
 */
export interface SearchItem {
  kind: SearchKind;
  /** Unique and stable, e.g. `log:project/acme-bot/T-007/2026-09-01 14:22`. */
  key: string;
  /** Never empty. */
  title: string;
  /** Charter name, id, date — the hint column. */
  subtitle: string;
  /** The long searchable text, "" when none, capped. */
  body: string;
  tags: string[];
  /** ISO day, for the tiebreak. */
  updated: string;
  type?: ProjectType;
  slug?: string;
  /** Dotted subtask ids included. */
  taskId?: string;
  /** Journal / event day. */
  date?: string;
}
