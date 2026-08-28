import { listCharters, listTasks } from "@/lib/core/store";
import { laneOf } from "@/lib/core/lanes";
import { blockerOf, isBlocked } from "@/lib/core/deps";
import type {
  Charter,
  ProjectStatus,
  ProjectType,
  Task,
  TaskLane,
  TaskSection,
  TaskSize,
} from "@/lib/core/types";
import { hueOf, isoToday, STATUS_LABEL } from "@/lib/ui/momentum";

export interface SubModel {
  id: string;
  title: string;
  done: boolean;
  size: TaskSize;
}

export interface CardModel {
  key: string;
  type: ProjectType;
  slug: string;
  charterName: string;
  color: string;
  tint: string;
  id: string;
  title: string;
  size: TaskSize;
  lane: TaskLane;
  section: TaskSection;
  done: boolean;
  due?: string;
  est?: string;
  created?: string;
  doneDate?: string;
  waitsOn?: string;
  blocked: boolean;
  blockedByTitle?: string;
  overdue: boolean;
  pct: number;
  subDone: number;
  subTotal: number;
  subs: SubModel[];
  priority: string;
}

export interface CharterModel {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  statusLabel: string;
  priority: number;
  priorityLabel: string;
  mvp?: string;
  repo?: string;
  why: string;
  mvpScope: string[];
  parkingLot: string[];
  color: string;
  tint: string;
  open: number;
  doneTotal: number;
  total: number;
  pct: number;
  lastActivity: string | null;
  cards: CardModel[];
  next: CardModel | null;
}

export interface Workspace {
  charters: CharterModel[];
  projects: CharterModel[];
  areas: CharterModel[];
  cards: CardModel[];
  byId: Map<string, CharterModel>;
  today: string;
}

function priorityLabel(priority: number): string {
  return `P${Math.max(1, Math.min(9, Math.round(priority)))}`;
}

function buildCards(charter: Charter, tasks: Task[], today: string): CardModel[] {
  const tone = hueOf(charter.id);
  const tops = tasks.filter((t) => !t.parentId);
  return tops.map((t) => {
    const subs = tasks
      .filter((s) => s.parentId === t.id)
      .map((s) => ({ id: s.id, title: s.title, done: s.done, size: s.size }));
    const subDone = subs.filter((s) => s.done).length;
    const blocker = blockerOf(t, tasks);
    const pct = subs.length
      ? Math.round((subDone / subs.length) * 100)
      : t.done
        ? 100
        : t.section === "in-progress"
          ? 50
          : 0;
    return {
      key: `${charter.type}/${charter.id}/${t.id}`,
      type: charter.type,
      slug: charter.id,
      charterName: charter.name,
      color: tone.color,
      tint: tone.tint,
      id: t.id,
      title: t.title,
      size: t.size,
      lane: laneOf(t),
      section: t.section,
      done: t.done,
      due: t.due,
      est: t.est,
      created: t.created,
      doneDate: t.doneDate,
      waitsOn: t.waitsOn,
      blocked: isBlocked(t, tasks),
      blockedByTitle: blocker?.title,
      overdue: !!t.due && !t.done && t.due < today,
      pct,
      subDone,
      subTotal: subs.length,
      subs,
      priority: priorityLabel(charter.priority),
    };
  });
}

function lastActivityOf(cards: CardModel[]): string | null {
  let latest: string | null = null;
  for (const c of cards) {
    const stamp = c.doneDate ?? c.created;
    if (!stamp) continue;
    if (!latest || stamp > latest) latest = stamp;
  }
  return latest;
}

export async function loadWorkspace(now: Date = new Date()): Promise<Workspace> {
  const today = isoToday(now);
  const charters = await listCharters();
  charters.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

  const models: CharterModel[] = [];
  for (const c of charters) {
    const tasks = await listTasks(c.type, c.id);
    const cards = buildCards(c, tasks, today);
    const open = cards.filter((t) => !t.done).length;
    const doneTotal = cards.filter((t) => t.done).length;
    const total = cards.length;
    const tone = hueOf(c.id);
    const next =
      cards.find((t) => !t.done && t.section === "in-progress") ??
      cards.find((t) => !t.done && t.overdue) ??
      cards.find((t) => !t.done) ??
      null;
    models.push({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      statusLabel: STATUS_LABEL[c.status],
      priority: c.priority,
      priorityLabel: priorityLabel(c.priority),
      mvp: c.mvp,
      repo: c.repo,
      why: c.why,
      mvpScope: c.mvpScope,
      parkingLot: c.parkingLot,
      color: tone.color,
      tint: tone.tint,
      open,
      doneTotal,
      total,
      pct: total ? Math.round((doneTotal / total) * 100) : 0,
      lastActivity: lastActivityOf(cards),
      cards,
      next,
    });
  }

  const all = models.flatMap((m) => m.cards);
  return {
    charters: models,
    projects: models.filter((m) => m.type === "project"),
    areas: models.filter((m) => m.type === "area"),
    cards: all,
    byId: new Map(models.map((m) => [`${m.type}/${m.id}`, m])),
    today,
  };
}

export async function loadCharterModel(
  type: ProjectType,
  slug: string,
  now: Date = new Date(),
): Promise<CharterModel | null> {
  const ws = await loadWorkspace(now);
  return ws.byId.get(`${type}/${slug}`) ?? null;
}
