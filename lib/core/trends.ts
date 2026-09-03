import type { DailyData, DailyLogEntry } from "./types";
import { countIn, countOnDay, getDaily, habitStreak } from "./daily";
import { getInsights, type Insights } from "./insights";
import { isoToday, parseIso, shiftIso, weekRange } from "../ui/momentum";

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
  /** Mean adherence (% of days met) over the last four complete weeks. */
  recent4: number;
  /** Mean adherence over the complete weeks before those. */
  prior4: number;
  /** Least-squares slope of weekly adherence, in percentage points per week, over complete weeks. */
  slope: number;
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

export interface ProjectThroughput {
  slug: string;
  name: string;
  type: "project" | "area";
  open: number;
  doneTotal: number;
  lastActivity: string | null;
}

export interface LifeTrends {
  today: string;
  weeks: string[];
  habits: HabitTrend[];
  rhythms: RhythmTrend[];
  throughput: { weekStart: string; done: number; created: number }[];
  projects: ProjectThroughput[];
  stalled: { slug: string; name: string; days: number }[];
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

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Least-squares slope of `values` against their index; 0 when there is nothing to fit. */
export function slopeOf(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
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
    const complete = cells.filter((c) => !c.partial).map((c) => (c.met / c.days) * 100);
    const recent = complete.slice(-DIGEST_WEEKS);
    const prior = complete.slice(0, Math.max(0, complete.length - DIGEST_WEEKS));
    const lastLogged = lastLoggedDate(data.log, h.id);
    return {
      id: h.id,
      name: h.name,
      goal: h.goal,
      weeks: cells,
      streak: habitStreak(data.log, h.id, h.goal, today),
      lastLogged,
      daysSinceLogged: lastLogged ? daysBetween(lastLogged, today) : null,
      recent4: mean(recent),
      prior4: mean(prior),
      slope: slopeOf(complete),
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

export function buildLifeTrends(data: DailyData, insights: Insights, today: string): LifeTrends {
  return {
    today,
    weeks: weekStarts(today, TREND_WEEKS),
    habits: habitTrends(data, today),
    rhythms: rhythmTrends(data, today),
    throughput: insights.weeks,
    projects: insights.perProject,
    stalled: insights.stalled,
  };
}

export async function getLifeTrends(now: Date = new Date()): Promise<LifeTrends> {
  const [data, insights] = await Promise.all([getDaily(), getInsights(now)]);
  return buildLifeTrends(data, insights, isoToday(now));
}

function ago(days: number | null): string {
  if (days === null) return "never logged";
  if (days === 0) return "logged today";
  if (days === 1) return "last logged yesterday";
  return `last logged ${days}d ago`;
}

function trendWord(slope: number): string {
  const rounded = Math.round(slope);
  if (rounded === 0) return "flat";
  return `${rounded > 0 ? "+" : ""}${rounded} pts/wk`;
}

/**
 * Compact enough to sit in a system prompt: one line per habit and rhythm over
 * the last four weeks, the current week starred as partial, plus one line of
 * task throughput and one of stalled charters when those are supplied. Capped
 * by line count, because a life with thirty habits is not a reason to spend a
 * page.
 */
export function renderTrendsDigest(
  trends: Pick<LifeTrends, "habits" | "rhythms"> & Partial<Pick<LifeTrends, "throughput" | "stalled">>,
  maxLines = 10,
): string {
  const lines: string[] = [];
  if (trends.throughput?.some((w) => w.done > 0 || w.created > 0)) {
    const cells = trends.throughput
      .slice(-DIGEST_WEEKS)
      .map((w, i, arr) => `${w.done}/${w.created}${i === arr.length - 1 ? "*" : ""}`)
      .join(" ");
    lines.push(`Tasks done/created, last ${DIGEST_WEEKS} wks: ${cells}`);
  }
  if (trends.stalled?.length) {
    lines.push(`Stalled: ${trends.stalled.map((s) => `${s.name} (${s.days}d idle)`).join(", ")}`);
  }
  for (const h of trends.habits) {
    const cells = h.weeks
      .slice(-DIGEST_WEEKS)
      .map((w) => `${w.met}/${w.days}${w.partial ? "*" : ""}`)
      .join(" ");
    lines.push(
      `${h.id} ${h.name}: last ${DIGEST_WEEKS} wks ${cells} · streak ${h.streak} · trend ${trendWord(h.slope)} · ${ago(h.daysSinceLogged)}`,
    );
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
