import type { CharterModel } from "./workspace";

export interface Target {
  /** Index into the charter's raw mvpScope array — what toggledScope writes by. */
  index: number;
  /** `G-001` when the line carries one. Older lines have no id and cannot be linked to tasks. */
  id: string | null;
  title: string;
  by: string | null;
  done: boolean;
  /** Display name of the `### ` heading above this line, if any. */
  milestone: string | null;
}

export interface CharterTarget extends Target {
  charter: CharterModel;
}

export interface Milestone {
  name: string | null;
  targets: Target[];
}

export interface CharterMilestone {
  name: string | null;
  charter: CharterModel;
  targets: CharterTarget[];
}

const MARKER_RE = /^-\s*\[( |x|X)\]\s*/;
const BY_RE = /\s*(?:—|--)\s*by\s+(.+)$/i;
const HEADING_RE = /^#{3,}\s*(.+?)\s*#*$/;
const ID_PREFIX_RE = /^(G-\d{3,})\s*\|\s*/;

export const TARGET_ID_RE = /^G-\d{3,}$/;

export function parseMilestoneLine(line: string): string | null {
  const m = HEADING_RE.exec(line.trim());
  return m ? m[1].trim() || null : null;
}

export function parseTargetLine(line: string, index = 0, milestone: string | null = null): Target | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#")) return null;

  const marker = MARKER_RE.exec(trimmed);
  const done = marker ? marker[1].toLowerCase() === "x" : false;
  let rest = marker ? trimmed.slice(marker[0].length) : trimmed.replace(/^-\s*/, "");

  let id: string | null = null;
  const idMatch = ID_PREFIX_RE.exec(rest);
  if (idMatch) {
    id = idMatch[1];
    rest = rest.slice(idMatch[0].length);
  }

  let by: string | null = null;
  const byMatch = BY_RE.exec(rest);
  if (byMatch) {
    by = byMatch[1].trim();
    rest = rest.slice(0, byMatch.index).trim();
  }

  if (!rest) return null;
  return { index, id, title: rest, by, done, milestone };
}

export function serializeTargetLine(
  target: Pick<Target, "title" | "by" | "done"> & { id?: string | null },
): string {
  const box = target.done ? "[x]" : "[ ]";
  const id = target.id ? `${target.id} | ` : "";
  const by = target.by ? ` — by ${target.by}` : "";
  return `- ${box} ${id}${target.title}${by}`;
}

export function serializeMilestoneLine(name: string): string {
  return `### ${name}`;
}

/**
 * Maps over the raw scope array so `Target.index` stays the index into it —
 * `toggledScope` writes back by that index, and milestone headings occupy
 * slots without being targets themselves. Never throws: this runs inside
 * loadWorkspace, where an exception would take down every page.
 */
export function targetsOf(scope: string[]): Target[] {
  let milestone: string | null = null;
  const out: Target[] = [];
  scope.forEach((line, index) => {
    const heading = parseMilestoneLine(line);
    if (heading !== null) {
      milestone = heading;
      return;
    }
    const target = parseTargetLine(line, index, milestone);
    if (target) out.push(target);
  });
  return out;
}

export function milestonesOf(scope: string[]): Milestone[] {
  const out: Milestone[] = [];
  for (const target of targetsOf(scope)) {
    const last = out[out.length - 1];
    if (last && last.name === target.milestone) last.targets.push(target);
    else out.push({ name: target.milestone, targets: [target] });
  }
  return out;
}

export function nextTargetId(scope: string[]): string {
  let max = 0;
  for (const line of scope) {
    const target = parseTargetLine(line);
    if (!target?.id) continue;
    const n = Number(target.id.slice(2));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `G-${String(max + 1).padStart(3, "0")}`;
}

export function milestoneNames(scope: string[]): string[] {
  const out: string[] = [];
  for (const line of scope) {
    const name = parseMilestoneLine(line);
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export function charterTargets(charter: CharterModel): CharterTarget[] {
  return targetsOf(charter.mvpScope).map((t) => ({ ...t, charter }));
}

export function allTargets(charters: CharterModel[]): CharterTarget[] {
  return charters.flatMap(charterTargets);
}

export function charterMilestones(charter: CharterModel): CharterMilestone[] {
  return milestonesOf(charter.mvpScope).map((m) => ({
    name: m.name,
    charter,
    targets: m.targets.map((t) => ({ ...t, charter })),
  }));
}

export interface TargetProgress {
  pct: number;
  done: number;
  total: number;
  /** True when no task points at this target, so the tick is all there is. */
  binary: boolean;
}

/**
 * Progress comes from the tasks that name this target. With none linked it
 * falls back to the tick. A target is never auto-closed when its tasks finish:
 * a target claims an outcome, and finishing the tasks you thought of is
 * evidence, not proof.
 */
export function targetProgress(
  target: Pick<Target, "id" | "done">,
  tasks: { target?: string; done: boolean }[] = [],
): TargetProgress {
  const linked = target.id ? tasks.filter((t) => t.target === target.id) : [];
  if (linked.length === 0) {
    return { pct: target.done ? 100 : 0, done: 0, total: 0, binary: true };
  }
  const done = linked.filter((t) => t.done).length;
  return {
    pct: Math.round((done / linked.length) * 100),
    done,
    total: linked.length,
    binary: false,
  };
}

export function targetPct(
  target: Pick<Target, "id" | "done">,
  tasks: { target?: string; done: boolean }[] = [],
): number {
  return targetProgress(target, tasks).pct;
}

export function toggledScope(scope: string[], index: number, done: boolean): string[] {
  return scope.map((line, i) => {
    if (i !== index) return line;
    const parsed = parseTargetLine(line, i);
    if (!parsed) return line;
    return serializeTargetLine({ ...parsed, done });
  });
}
