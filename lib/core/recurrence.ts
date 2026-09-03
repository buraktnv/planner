import type { CalendarEvent, EventRepeat } from "./types";
import { isoToday, parseIso, shiftIso } from "../ui/momentum";

export type Occurrence = Pick<CalendarEvent, "date" | "repeat" | "lead">;

export const EVENT_REPEATS: readonly EventRepeat[] = ["yearly", "monthly", "weekly"];
export const LEAD_MAX = 999;

const OCCURRENCE_CAP = 60;
const DAY_MS = 86_400_000;

export function isEventRepeat(value: unknown): value is EventRepeat {
  return typeof value === "string" && (EVENT_REPEATS as readonly string[]).includes(value);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clamped(year: number, monthIndex: number, day: number): string {
  return isoToday(new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex))));
}

function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY_MS);
}

export function nextOccurrence(event: Occurrence, today: string): string {
  if (!event.repeat || event.date >= today) return event.date;
  const anchor = parseIso(event.date);
  const now = parseIso(today);
  if (event.repeat === "yearly") {
    const thisYear = clamped(now.getFullYear(), anchor.getMonth(), anchor.getDate());
    return thisYear >= today
      ? thisYear
      : clamped(now.getFullYear() + 1, anchor.getMonth(), anchor.getDate());
  }
  if (event.repeat === "monthly") {
    const thisMonth = clamped(now.getFullYear(), now.getMonth(), anchor.getDate());
    if (thisMonth >= today) return thisMonth;
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return clamped(next.getFullYear(), next.getMonth(), anchor.getDate());
  }
  const weeks = Math.ceil(daysBetween(event.date, today) / 7);
  return shiftIso(event.date, weeks * 7);
}

export function advancedAnchor(event: Occurrence, today: string): string {
  const next = nextOccurrence(event, today);
  if (!event.repeat) return next;
  return nextOccurrence(event, shiftIso(next, 1));
}

export function occurrencesBetween(event: Occurrence, from: string, to: string): string[] {
  if (to < from) return [];
  if (!event.repeat) return event.date >= from && event.date <= to ? [event.date] : [];
  const out: string[] = [];
  let cur = nextOccurrence(event, from);
  while (cur <= to && out.length < OCCURRENCE_CAP) {
    out.push(cur);
    cur = nextOccurrence(event, shiftIso(cur, 1));
  }
  return out;
}

export function surfaceDate(event: Occurrence, occurs: string): string {
  return event.lead ? shiftIso(occurs, -event.lead) : occurs;
}

export function isSurfaced(event: Occurrence, today: string): boolean {
  return surfaceDate(event, nextOccurrence(event, today)) <= today;
}

export function daysUntil(occurs: string, today: string): number {
  return daysBetween(today, occurs);
}
