import type { ProjectType, TaskSection, TaskSize } from "@/lib/core/types";
import type { CardModel, SubModel } from "./workspace";

export interface TaskNode {
  id: string;
  title: string;
  size: TaskSize;
  section: TaskSection;
  done: boolean;
  due?: string;
  est?: string;
  doneDate?: string;
  waitsOn?: string;
  subs: SubModel[];
  isRoot: boolean;
}

export interface TaskPageModel {
  card: CardModel;
  node: TaskNode;
  parentHref: string | null;
}

export function rootIdOf(taskId: string): string {
  const dot = taskId.indexOf(".");
  return dot === -1 ? taskId : taskId.slice(0, dot);
}

export function parentIdOf(taskId: string): string | null {
  const dot = taskId.lastIndexOf(".");
  return dot === -1 ? null : taskId.slice(0, dot);
}

export function taskHref(type: ProjectType, slug: string, taskId: string): string {
  const base = type === "area" ? "areas" : "projects";
  return `/${base}/${slug}/tasks/${taskId}`;
}

export function charterHref(type: ProjectType, slug: string): string {
  return `/${type === "area" ? "areas" : "projects"}/${slug}`;
}

export function findSub(subs: SubModel[], id: string): SubModel | null {
  for (const s of subs) {
    if (s.id === id) return s;
    const deeper = findSub(s.subs, id);
    if (deeper) return deeper;
  }
  return null;
}

function nodeOfCard(card: CardModel): TaskNode {
  return {
    id: card.id,
    title: card.title,
    size: card.size,
    section: card.section,
    done: card.done,
    due: card.due,
    est: card.est,
    doneDate: card.doneDate,
    waitsOn: card.waitsOn,
    subs: card.subs,
    isRoot: true,
  };
}

function nodeOfSub(sub: SubModel): TaskNode {
  return {
    id: sub.id,
    title: sub.title,
    size: sub.size,
    section: sub.section,
    done: sub.done,
    due: sub.due,
    est: sub.est,
    doneDate: sub.doneDate,
    waitsOn: sub.waitsOn,
    subs: sub.subs,
    isRoot: false,
  };
}

/**
 * A subtask has no card of its own — it is resolved through the root id in its
 * own id, which is why a subtask page can be linked to directly.
 */
export function buildTaskPage(
  cards: CardModel[],
  type: ProjectType,
  slug: string,
  taskId: string,
): TaskPageModel | null {
  const rootId = rootIdOf(taskId);
  const card = cards.find((c) => c.type === type && c.slug === slug && c.id === rootId);
  if (!card) return null;
  if (taskId === rootId) return { card, node: nodeOfCard(card), parentHref: null };

  const sub = findSub(card.subs, taskId);
  if (!sub) return null;
  const parentId = parentIdOf(taskId);
  return {
    card,
    node: nodeOfSub(sub),
    parentHref: parentId ? taskHref(type, slug, parentId) : null,
  };
}

const BACK_LABELS: [string, string][] = [
  ["/board", "Board"],
  ["/done", "Done"],
  ["/targets", "Roadmap"],
  ["/branches", "Branches"],
  ["/review", "Review"],
  ["/life", "Life"],
  ["/daily", "Daily"],
];

/**
 * Only the path is trusted: an absolute URL, a protocol-relative one, or
 * anything else a query string can carry must never become an href.
 */
export function safeBackPath(from: string | null | undefined): string | null {
  if (!from) return null;
  if (!from.startsWith("/") || from.startsWith("//")) return null;
  return from;
}

export function backLabelFor(path: string | null, fallback: string): string {
  if (!path) return fallback;
  if (path === "/") return "Focus";
  for (const [prefix, label] of BACK_LABELS) {
    if (path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}/`)) {
      return label;
    }
  }
  return fallback;
}
