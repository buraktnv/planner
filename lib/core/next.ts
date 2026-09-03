import type { Charter, Task, TaskSize } from "./types";
import { listCharters, listTasks } from "./store";
import { isBlocked } from "./deps";

export interface NextAction {
  task: Task;
  charter: Charter;
  blocked: boolean;
}

const SIZE_RANK: Record<TaskSize, number> = { S: 0, M: 1, L: 2 };

function today(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

/**
 * Tiers must match `groupOf` in lib/view/focus.ts. Blocked work is checked
 * first and sinks to the bottom, so the assistant cannot recommend something
 * the Focus page deliberately buries — they used to disagree.
 */
function groupOf(action: NextAction, todayStr: string): number {
  if (action.blocked) return 4;
  const t = action.task;
  if (t.due) {
    return t.due < todayStr ? 0 : 1;
  }
  if (t.section === "in-progress") return 2;
  return 3;
}

function compareActions(a: NextAction, b: NextAction, todayStr: string): number {
  const ga = groupOf(a, todayStr);
  const gb = groupOf(b, todayStr);
  if (ga !== gb) return ga - gb;

  if (ga <= 1) {
    const da = a.task.due ?? "";
    const db = b.task.due ?? "";
    if (da !== db) return da < db ? -1 : 1;
  }

  const pa = a.charter.priority;
  const pb = b.charter.priority;
  if (pa !== pb) return pa - pb;

  const sa = SIZE_RANK[a.task.size];
  const sb = SIZE_RANK[b.task.size];
  if (sa !== sb) return sa - sb;

  return a.task.title.localeCompare(b.task.title);
}

/**
 * One charter's open tasks in the order the assistant would recommend them —
 * the same tiers as `getNextActions`, so a capped list in the system prompt
 * shows the tasks that matter rather than the first thirty in the file.
 */
export function rankOpenTasks(
  tasks: Task[],
  charter: Charter,
  todayStr: string = today(),
): Task[] {
  const actions: NextAction[] = tasks
    .filter((t) => t.section !== "done" && !t.done)
    .map((t) => ({ task: t, charter, blocked: isBlocked(t, tasks) }));
  actions.sort((a, b) => compareActions(a, b, todayStr));
  return actions.map((a) => a.task);
}

export async function getNextActions(
  limit = 10,
  todayStr: string = today(),
): Promise<NextAction[]> {
  const charters = await listCharters();
  const actions: NextAction[] = [];
  for (const c of charters) {
    const tasks = await listTasks(c.type, c.id);
    for (const t of tasks) {
      if (t.section === "done" || t.done) continue;
      actions.push({ task: t, charter: c, blocked: isBlocked(t, tasks) });
    }
  }
  actions.sort((a, b) => compareActions(a, b, todayStr));
  return actions.slice(0, limit);
}
