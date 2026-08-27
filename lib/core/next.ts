import type { Charter, Task, TaskSize } from "./types";
import { listCharters, listTasks } from "./store";

export interface NextAction {
  task: Task;
  charter: Charter;
}

const SIZE_RANK: Record<TaskSize, number> = { S: 0, M: 1, L: 2 };

function today(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

function groupOf(t: Task, todayStr: string): number {
  if (t.due) {
    return t.due < todayStr ? 0 : 1;
  }
  if (t.section === "in-progress") return 2;
  return 3;
}

function compareActions(a: NextAction, b: NextAction, todayStr: string): number {
  const ga = groupOf(a.task, todayStr);
  const gb = groupOf(b.task, todayStr);
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

export async function getNextActions(limit = 10): Promise<NextAction[]> {
  const charters = await listCharters();
  const todayStr = today();
  const actions: NextAction[] = [];
  for (const c of charters) {
    const tasks = await listTasks(c.type, c.id);
    for (const t of tasks) {
      if (t.section === "done" || t.done) continue;
      actions.push({ task: t, charter: c });
    }
  }
  actions.sort((a, b) => compareActions(a, b, todayStr));
  return actions.slice(0, limit);
}
