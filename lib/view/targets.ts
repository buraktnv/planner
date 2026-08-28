import type { CharterModel } from "./workspace";

export interface Target {
  index: number;
  title: string;
  by: string | null;
  done: boolean;
}

export interface CharterTarget extends Target {
  charter: CharterModel;
}

const MARKER_RE = /^-\s*\[( |x|X)\]\s*/;
const BY_RE = /\s*(?:—|--)\s*by\s+(.+)$/i;

export function parseTargetLine(line: string, index = 0): Target | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const marker = MARKER_RE.exec(trimmed);
  const done = marker ? marker[1].toLowerCase() === "x" : false;
  let rest = marker ? trimmed.slice(marker[0].length) : trimmed.replace(/^-\s*/, "");

  let by: string | null = null;
  const byMatch = BY_RE.exec(rest);
  if (byMatch) {
    by = byMatch[1].trim();
    rest = rest.slice(0, byMatch.index).trim();
  }

  if (!rest) return null;
  return { index, title: rest, by, done };
}

export function serializeTargetLine(target: Pick<Target, "title" | "by" | "done">): string {
  const box = target.done ? "[x]" : "[ ]";
  const by = target.by ? ` — by ${target.by}` : "";
  return `- ${box} ${target.title}${by}`;
}

export function targetsOf(scope: string[]): Target[] {
  return scope
    .map((line, index) => parseTargetLine(line, index))
    .filter((t): t is Target => t !== null);
}

export function charterTargets(charter: CharterModel): CharterTarget[] {
  return targetsOf(charter.mvpScope).map((t) => ({ ...t, charter }));
}

export function allTargets(charters: CharterModel[]): CharterTarget[] {
  return charters.flatMap(charterTargets);
}

export function targetPct(target: Pick<Target, "done">): number {
  return target.done ? 100 : 0;
}

export function toggledScope(scope: string[], index: number, done: boolean): string[] {
  return scope.map((line, i) => {
    if (i !== index) return line;
    const parsed = parseTargetLine(line, i);
    if (!parsed) return line;
    return serializeTargetLine({ ...parsed, done });
  });
}
