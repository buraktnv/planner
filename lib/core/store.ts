import fs from "node:fs/promises";
import path from "node:path";
import type { Charter, ProjectType, Task, TaskLane, TaskSection, TaskSize } from "./types";
import {
  parseCharter,
  serializeCharter,
  parseTasks,
  serializeTasks,
  nextTaskId,
} from "./schema";
import { charterPath, tasksPath, aboutPath, dataRoot, archiveDir } from "./paths";
import { appendJournal } from "./journal";
import { commitData } from "./git";

function today(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanWaitsOn(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (trimmed.includes(" | ")) {
    throw new Error('A waits: value may not contain " | "');
  }
  return trimmed;
}

function dataDir(type: ProjectType): string {
  return type === "project" ? "projects" : "areas";
}

async function writeCharter(c: Charter): Promise<void> {
  await fs.mkdir(path.dirname(charterPath(c.type, slugify(c.name))), { recursive: true });
  await fs.writeFile(charterPath(c.type, slugify(c.name)), serializeCharter(c), "utf8");
}

export async function listCharters(type?: ProjectType): Promise<Charter[]> {
  const types = type ? [type] : (["project", "area"] as ProjectType[]);
  const out: Charter[] = [];
  for (const t of types) {
    const dir = path.join(dataRoot(), dataDir(t));
    let files: string[];
    try {
      files = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".md")) continue;
      const raw = await fs.readFile(path.join(dir, f), "utf8");
      out.push(parseCharter(raw));
    }
  }
  return out;
}

export async function getCharter(type: ProjectType, slug: string): Promise<Charter> {
  let raw: string;
  try {
    raw = await fs.readFile(charterPath(type, slug), "utf8");
  } catch {
    throw new Error(`Charter not found: ${type}/${slug}`);
  }
  return parseCharter(raw);
}

export async function createCharter(input: {
  type: ProjectType;
  name: string;
  why: string;
  mvp?: string;
  priority?: number;
}): Promise<Charter> {
  if (input.type === "project" && !input.mvp) {
    throw new Error("Project charter requires an mvp");
  }
  const date = today();
  const slug = slugify(input.name);
  if (!slug) {
    throw new Error(`Charter name does not produce a usable slug: ${input.name}`);
  }
  const existing = await listCharters();
  const clash = existing.find((c) => c.id === slug);
  if (clash) {
    throw new Error(
      `A ${clash.type} charter named "${clash.name}" already uses the slug ${slug}; refusing to overwrite it`,
    );
  }
  const c: Charter = {
    id: slug,
    name: input.name,
    type: input.type,
    status: "active",
    priority: input.priority ?? 2,
    mvp: input.mvp,
    repo: undefined,
    created: date,
    updated: date,
    why: input.why,
    mvpScope: [],
    parkingLot: [],
  };
  await writeCharter(c);
  await appendJournal(slug, "charter created");
  await commitData(`charter created: ${slug}`);
  return c;
}

export async function updateCharter(
  type: ProjectType,
  slug: string,
  patch: Partial<Pick<Charter, "name" | "status" | "priority" | "mvp" | "repo" | "why" | "mvpScope" | "parkingLot">>,
): Promise<Charter> {
  const c = await getCharter(type, slug);
  const next: Charter = { ...c, ...patch, updated: today() };
  if (next.type === "project" && next.mvp === undefined) {
    throw new Error("Project charter requires an mvp");
  }
  const newSlug = slugify(next.name);
  if (newSlug !== slug) {
    await fs.rm(charterPath(type, slug));
  }
  await writeCharter({ ...next, id: newSlug });
  await appendJournal(newSlug, "charter updated");
  await commitData(`charter updated: ${newSlug}`);
  return { ...next, id: newSlug };
}

export async function listTasks(type: ProjectType, slug: string): Promise<Task[]> {
  let raw: string;
  try {
    raw = await fs.readFile(tasksPath(type, slug), "utf8");
  } catch {
    return [];
  }
  return parseTasks(raw);
}

export async function addTask(
  type: ProjectType,
  slug: string,
  input: {
    title: string;
    size: TaskSize;
    lane?: TaskLane;
    parentId?: string;
    est?: string;
    due?: string;
    waitsOn?: string;
  },
): Promise<Task> {
  const tasks = await listTasks(type, slug);
  let task: Task;
  if (input.parentId) {
    const parent = tasks.find((t) => t.id === input.parentId);
    if (!parent) throw new Error(`Parent task not found: ${input.parentId}`);
    const children = tasks.filter((t) => t.parentId === input.parentId).length;
    const parentSection = parent.section === "done" ? "backlog" : parent.section;
    if (parent.section === "done") {
      const pIdx = tasks.findIndex((t) => t.id === parent.id);
      tasks[pIdx] = {
        ...tasks[pIdx],
        done: false,
        section: "backlog",
        doneDate: undefined,
        created: today(),
      };
    }
    task = {
      id: `${input.parentId}.${children + 1}`,
      title: input.title,
      size: input.size,
      lane: input.lane,
      done: false,
      created: today(),
      est: input.est,
      due: input.due,
      waitsOn: cleanWaitsOn(input.waitsOn),
      parentId: input.parentId,
      section: parentSection,
    };
    const parentIdx = tasks.findIndex((t) => t.id === input.parentId);
    tasks.splice(parentIdx + 1, 0, task);
  } else {
    task = {
      id: nextTaskId(tasks),
      title: input.title,
      size: input.size,
      lane: input.lane,
      done: false,
      section: "backlog",
      created: today(),
      est: input.est,
      due: input.due,
      waitsOn: cleanWaitsOn(input.waitsOn),
      parentId: null,
    };
    tasks.push(task);
  }
  await fs.mkdir(path.dirname(tasksPath(type, slug)), { recursive: true });
  await fs.writeFile(tasksPath(type, slug), serializeTasks(tasks), "utf8");
  await appendJournal(slug, `${task.id} added: ${task.title}`);
  await commitData(`task added: ${task.id} (${slug})`);
  return task;
}

export async function updateTask(
  type: ProjectType,
  slug: string,
  taskId: string,
  patch: Partial<Pick<Task, "title" | "size" | "section" | "est" | "due" | "lane" | "waitsOn">> & {
    complete?: boolean;
  },
): Promise<Task> {
  const tasks = await listTasks(type, slug);
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) throw new Error(`Task not found: ${taskId}`);
  const t = { ...tasks[idx] };
  if (patch.title !== undefined) t.title = patch.title;
  if (patch.size !== undefined) t.size = patch.size;
  if (patch.est !== undefined) t.est = patch.est;
  if (patch.due !== undefined) t.due = patch.due;
  if (patch.lane !== undefined) t.lane = patch.lane;
  if (patch.waitsOn !== undefined) t.waitsOn = cleanWaitsOn(patch.waitsOn);
  if (patch.complete) {
    t.done = true;
    t.section = "done";
    t.doneDate = today();
    t.created = undefined;
  } else if (patch.complete === false) {
    t.done = false;
    t.section = "backlog";
    t.doneDate = undefined;
    t.created = today();
  } else if (patch.section !== undefined) {
    t.section = patch.section as TaskSection;
  }
  tasks[idx] = t;
  await fs.writeFile(tasksPath(type, slug), serializeTasks(tasks), "utf8");
  const message = patch.complete ? `${taskId} done` : `${taskId} updated`;
  await appendJournal(slug, message);
  await commitData(`task ${message} (${slug})`);
  return t;
}

export async function getAbout(): Promise<string> {
  try {
    return await fs.readFile(aboutPath(), "utf8");
  } catch {
    return "";
  }
}

export async function saveAbout(md: string): Promise<void> {
  await fs.mkdir(path.dirname(aboutPath()), { recursive: true });
  await fs.writeFile(aboutPath(), md, "utf8");
  await appendJournal("about", "about updated");
  await commitData("about updated");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

export async function archiveCharter(
  type: ProjectType,
  slug: string,
): Promise<{ slug: string; archivedAs: string }> {
  await getCharter(type, slug);
  const dir = archiveDir(type);
  await fs.mkdir(dir, { recursive: true });

  let archivedAs = slug;
  let n = 1;
  while (
    (await pathExists(path.join(dir, `${archivedAs}.md`))) ||
    (await pathExists(path.join(dir, archivedAs)))
  ) {
    n += 1;
    archivedAs = `${slug}-${n}`;
  }

  await fs.rename(charterPath(type, slug), path.join(dir, `${archivedAs}.md`));
  const taskDir = path.dirname(tasksPath(type, slug));
  if (await pathExists(taskDir)) {
    await fs.rename(taskDir, path.join(dir, archivedAs));
  }

  await appendJournal(slug, "charter archived");
  await commitData(`charter archived: ${slug}`);
  return { slug, archivedAs };
}
