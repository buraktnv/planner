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
  waitsOn?: string;
  parentId?: string | null;
}

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  done: boolean;
  time?: string;
  note?: string;
  scope?: string;
  action?: string;
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

export type ProviderType = "claude-subscription" | "anthropic-api" | "openai-compatible";

export interface ProviderProfile {
  id: string;
  type: ProviderType;
  model: string;
  label: string;
  baseUrl?: string;
  apiKeyEnv?: string;
}

export interface ProvidersFile {
  profiles: ProviderProfile[];
  default: string;
}
