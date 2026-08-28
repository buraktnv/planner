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
  parentId?: string | null;
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
