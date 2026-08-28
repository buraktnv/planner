import type { Task, TaskLane } from "./types";

export const LANE_ORDER: TaskLane[] = ["quick", "deep", "wait", "some"];

export function laneOf(task: Task): TaskLane {
  if (task.lane) return task.lane;
  if (task.done || task.section === "done") return "quick";
  if (task.size === "S") return "quick";
  return "deep";
}

export function isLane(value: unknown): value is TaskLane {
  return typeof value === "string" && (LANE_ORDER as string[]).includes(value);
}
