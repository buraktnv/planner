import type { Charter, ProjectType, Task, TaskSize } from "../core/types";
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
import { getInsights, type Insights } from "../core/insights";
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
    waitsOn?: string;
  }): Promise<Task> {
    if (!input.project) throw new Error("createTask requires a project (slug or area:<slug>)");
    if (!input.title) throw new Error("createTask requires a title");
    const size = input.size ?? "M";
    const scope = parseScope(input.project);
    return addTask(scope.type, scope.slug, { title: input.title, size, waitsOn: input.waitsOn });
  },

  async updateTask(input: {
    project: string;
    id: string;
    title?: string;
    size?: TaskSize;
    section?: Task["section"];
    est?: string;
    due?: string;
    waitsOn?: string;
    complete?: boolean;
  }): Promise<Task> {
    if (!input.project) throw new Error("updateTask requires a project (slug or area:<slug>)");
    if (!input.id) throw new Error("updateTask requires an id");
    const scope = parseScope(input.project);
    const { title, size, section, est, due, waitsOn, complete } = input;
    return updateTask(scope.type, scope.slug, input.id, {
      title,
      size,
      section,
      est,
      due,
      waitsOn,
      complete,
    });
  },

  async decomposeTask(input: {
    project: string;
    id: string;
    subtasks: { title: string; size: TaskSize }[];
  }): Promise<Task[]> {
    if (!input.project) throw new Error("decomposeTask requires a project (slug or area:<slug>)");
    if (!input.id) throw new Error("decomposeTask requires an id");
    if (!Array.isArray(input.subtasks) || input.subtasks.length === 0) {
      throw new Error("decomposeTask requires a non-empty subtasks array");
    }
    const scope = parseScope(input.project);
    const created: Task[] = [];
    for (const sub of input.subtasks) {
      if (!sub.title) throw new Error("decomposeTask subtask requires a title");
      created.push(
        await addTask(scope.type, scope.slug, {
          title: sub.title,
          size: sub.size ?? "M",
          parentId: input.id,
        }),
      );
    }
    return created;
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

  async nextActions(): Promise<NextAction[]> {
    return getNextActions();
  },

  async weeklySummary(): Promise<{ insights: Insights; journalDigest: string }> {
    const insights = await getInsights();
    const days = await readJournal(7);
    const journalDigest = days
      .map((d) => `## ${d.date}\n` + d.entries.map((e) => `- ${e.time} [${e.scope}] ${e.message}`).join("\n"))
      .join("\n\n");
    return { insights, journalDigest };
  },
};
