import type { DailyData, DailyLogEntry } from "./types";
import { countIn, countOnDay, habitStreak } from "./daily";
import { parseIso, shiftIso, weekRange } from "../ui/momentum";

export interface WeekCell {
  weekStart: string;
  met: number;
  days: number;
  partial: boolean;
}

export interface HabitTrend {
  id: string;
  name: string;
  goal: number;
  weeks: WeekCell[];
  streak: number;
  lastLogged: string | null;
  daysSinceLogged: number | null;
}

export interface RhythmWeek {
  weekStart: string;
  count: number;
  met: boolean;
  partial: boolean;
}

export interface RhythmTrend {
  id: string;
  name: string;
  per: number;
  weeks: RhythmWeek[];
}

export const TREND_WEEKS = 8;
const DIGEST_WEEKS = 4;
const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / DAY_MS);
}

/** Monday-based week starts, oldest first; the last one is the week `today` sits in. */
export function weekStarts(today: string, n: number): string[] {
  const { start } = weekRange(today);
  return Array.from({ length: n }, (_, i) => shiftIso(start, -7 * (n - 1 - i)));
}

function lastLoggedDate(log: DailyLogEntry[], id: string): string | null {
  let last: string | null = null;
  for (const e of log) {
    if (e.id === id && (last === null || e.date > last)) last = e.date;
  }
  return last;
}

export function habitTrends(data: DailyData, today: string, weeks = TREND_WEEKS): HabitTrend[] {
  const starts = weekStarts(today, weeks);
  return data.habits.map((h) => {
    const cells: WeekCell[] = starts.map((weekStart) => {
      const end = shiftIso(weekStart, 6);
      const partial = end > today;
      const days = partial ? daysBetween(weekStart, today) + 1 : 7;
      let met = 0;
      for (let i = 0; i < days; i += 1) {
        if (countOnDay(data.log, h.id, shiftIso(weekStart, i)) >= h.goal) met += 1;
      }
      return { weekStart, met, days, partial };
    });
    const lastLogged = lastLoggedDate(data.log, h.id);
    return {
      id: h.id,
      name: h.name,
      goal: h.goal,
      weeks: cells,
      streak: habitStreak(data.log, h.id, h.goal, today),
      lastLogged,
      daysSinceLogged: lastLogged ? daysBetween(lastLogged, today) : null,
    };
  });
}

export function rhythmTrends(data: DailyData, today: string, weeks = TREND_WEEKS): RhythmTrend[] {
  const starts = weekStarts(today, weeks);
  return data.rhythms.map((r) => ({
    id: r.id,
    name: r.name,
    per: r.per,
    weeks: starts.map((weekStart) => {
      const end = shiftIso(weekStart, 6);
      const count = countIn(data.log, r.id, weekStart, end);
      return { weekStart, count, met: count >= r.per, partial: end > today };
    }),
  }));
}

function ago(days: number | null): string {
  if (days === null) return "never logged";
  if (days === 0) return "logged today";
  if (days === 1) return "last logged yesterday";
  return `last logged ${days}d ago`;
}

/**
 * Compact enough to sit in a system prompt: one line per habit and rhythm over
 * the last four weeks, the current week starred as partial. Capped by line
 * count, because a life with thirty habits is not a reason to spend a page.
 */
export function renderTrendsDigest(
  trends: { habits: HabitTrend[]; rhythms: RhythmTrend[] },
  maxLines = 10,
): string {
  const lines: string[] = [];
  for (const h of trends.habits) {
    const cells = h.weeks
      .slice(-DIGEST_WEEKS)
      .map((w) => `${w.met}/${w.days}${w.partial ? "*" : ""}`)
      .join(" ");
    lines.push(`${h.id} ${h.name}: last ${DIGEST_WEEKS} wks ${cells} · streak ${h.streak} · ${ago(h.daysSinceLogged)}`);
  }
  for (const r of trends.rhythms) {
    const cells = r.weeks
      .slice(-DIGEST_WEEKS)
      .map((w) => `${w.count}/${r.per}${w.partial ? "*" : ""}`)
      .join(" ");
    lines.push(`${r.id} ${r.name}: last ${DIGEST_WEEKS} wks ${cells} (per week)`);
  }
  if (lines.length === 0) return "";
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines), `(+${lines.length - maxLines} more)`].join("\n");
}
