import type { Task } from "./types";

export function blockerOf(task: Task, tasks: Task[]): Task | null {
  if (!task.waitsOn) return null;
  return tasks.find((t) => t.id === task.waitsOn) ?? null;
}

export function isBlocked(task: Task, tasks: Task[]): boolean {
  if (!task.waitsOn) return false;
  const blocker = blockerOf(task, tasks);
  if (!blocker) return true;
  return !blocker.done;
}
