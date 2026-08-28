import type { ProjectStatus, TaskLane } from "@/lib/core/types";

export interface LaneMeta {
  key: TaskLane;
  label: string;
  color: string;
  tint: string;
  ink: string;
}

export const LANES: Record<TaskLane, LaneMeta> = {
  quick: { key: "quick", label: "Quick win", color: "#63b894", tint: "#e2f2ec", ink: "#3f8f70" },
  deep: { key: "deep", label: "Deep work", color: "#7d95dd", tint: "#e6eaf9", ink: "#4a63b0" },
  wait: { key: "wait", label: "Waiting", color: "#d9a463", tint: "#f7ecdc", ink: "#a06f2c" },
  some: { key: "some", label: "Someday", color: "#a9a3b5", tint: "#eeecf1", ink: "#6f6a7a" },
};

export const LANE_KEYS: TaskLane[] = ["quick", "deep", "wait", "some"];

export const PALETTE = [
  { color: "#7d95dd", tint: "#e6eaf9" },
  { color: "#63b894", tint: "#e2f2ec" },
  { color: "#d9a463", tint: "#f7ecdc" },
  { color: "#c48bc9", tint: "#f4e9f5" },
  { color: "#8fbfc9", tint: "#e4f0f3" },
  { color: "#c9857a", tint: "#f7e8e5" },
];

export function hueOf(slug: string): { color: string; tint: string } {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 100000;
  return PALETTE[h % PALETTE.length];
}

export function dashOf(pct: number, r = 40): string {
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return `${((c * clamped) / 100).toFixed(1)} ${c.toFixed(1)}`;
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "ACTIVE",
  paused: "PAUSED",
  done: "DONE",
  abandoned: "PARKED",
};

export function isQuiet(status: ProjectStatus): boolean {
  return status === "paused" || status === "abandoned";
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function isoToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function shortDate(iso: string): string {
  const d = parseIso(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

export function weekdayOf(iso: string): string {
  return WEEKDAYS[parseIso(iso).getDay()];
}

export function monthName(index: number): string {
  return MONTHS[index];
}

export function dayGap(iso: string, from: Date = new Date()): number {
  const a = parseIso(iso).getTime();
  const b = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

export function relativeLabel(iso: string, from: Date = new Date()): string {
  const gap = dayGap(iso, from);
  if (gap === 0) return "TODAY";
  if (gap === 1) return "TOMORROW";
  if (gap === -1) return "YESTERDAY";
  if (gap < 0) return `${Math.abs(gap)}D AGO`;
  return `IN ${gap} DAYS`;
}

export function isoWeek(now: Date = new Date()): number {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + 1) / 7);
}

export const SIZE_MINUTES: Record<string, string> = { S: "15 min", M: "1 h", L: "2 h+" };
