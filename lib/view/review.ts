import { isoWeek, parseIso, shiftIso } from "@/lib/ui/momentum";

/**
 * The week arithmetic and chart geometry that Review, Dashboard and Activity
 * each had their own inline copy of. Every function here takes `today` as a
 * string rather than reading the clock, which is what makes it testable.
 */

export interface Closable {
  doneDate?: string;
  created?: string;
  done: boolean;
}

export interface Front {
  name: string;
  color: string;
  cards: Closable[];
}

export function daysAgo(today: string, n: number): string {
  return shiftIso(today, -n);
}

export function closedSince(cards: Closable[], since: string): number {
  return cards.filter((c) => c.doneDate && c.doneDate >= since).length;
}

/** Opened in the window and still open — "new open", not "created". */
export function openedSince(cards: Closable[], since: string): number {
  return cards.filter((c) => c.created && c.created >= since && !c.done).length;
}

/**
 * Consecutive days with a journal entry, counting back from today. A gap today
 * is forgiven — the day is not over yet — but a gap yesterday ends the run.
 */
export function journalStreak(dates: Iterable<string>, today: string, cap = 30): number {
  const set = new Set(dates);
  let streak = 0;
  const cursor = set.has(today) ? 0 : 1;
  while (streak < cap && set.has(daysAgo(today, cursor + streak))) streak++;
  return streak;
}

export interface MovedFront {
  name: string;
  color: string;
  done: number;
}

export function movedFronts(fronts: Front[], since: string): MovedFront[] {
  return fronts
    .map((f) => ({ name: f.name, color: f.color, done: closedSince(f.cards, since) }))
    .filter((f) => f.done > 0)
    .sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));
}

/** Week-over-week change in closed cards, per project. */
export function weekDeltas<T extends Front>(projects: T[], today: string): (T & { delta: number })[] {
  const since7 = daysAgo(today, 7);
  const since14 = daysAgo(today, 14);
  return projects.map((p) => {
    const last7 = closedSince(p.cards, since7);
    const prev7 = p.cards.filter(
      (c) => c.doneDate && c.doneDate >= since14 && c.doneDate < since7,
    ).length;
    return { ...p, delta: last7 - prev7 };
  });
}

export interface MomentumChart {
  pts: [number, number][];
  line: string;
  area: string;
  firstWeek: number;
  midWeek: number;
  lastWeek: number;
  deltaLabel: string;
}

const CHART = { left: 12, right: 288, top: 14, bottom: 100 };

export function momentumChart(
  weeks: { weekStart: string; done: number }[],
): MomentumChart {
  const span = CHART.right - CHART.left;
  const height = CHART.bottom - CHART.top;
  const maxDone = Math.max(1, ...weeks.map((w) => w.done));
  const pts: [number, number][] = weeks.map((w, i) => [
    CHART.left + i * (span / Math.max(1, weeks.length - 1)),
    CHART.bottom - (w.done / maxDone) * height,
  ]);
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const weekOf = (i: number) => (weeks.length ? isoWeek(parseIso(weeks[i].weekStart)) : 0);
  const thisDone = weeks.length ? weeks[weeks.length - 1].done : 0;
  const prevDone = weeks.length > 1 ? weeks[weeks.length - 2].done : 0;

  return {
    pts,
    line,
    area: pts.length ? `${line} L${CHART.right} ${CHART.bottom} L${CHART.left} ${CHART.bottom} Z` : "",
    firstWeek: weekOf(0),
    midWeek: weeks.length ? weekOf(Math.floor(weeks.length / 2)) : 0,
    lastWeek: weeks.length ? weekOf(weeks.length - 1) : 0,
    deltaLabel:
      prevDone > 0
        ? `${thisDone >= prevDone ? "+" : ""}${Math.round(((thisDone - prevDone) / prevDone) * 100)}% VS W${weekOf(weeks.length - 2)}`
        : `${thisDone} DONE THIS WEEK`,
  };
}

export interface SplitSlice {
  name: string;
  color: string;
  pct: number;
  dash: string;
  offset: string;
}

const DONUT_C = 2 * Math.PI * 38;

/** Open work per charter as donut arcs, busiest first, capped so the legend stays readable. */
export function openSplit(
  charters: { name: string; color: string; open: number }[],
  max = 4,
): SplitSlice[] {
  const openTotal = charters.reduce((a, c) => a + c.open, 0);
  return charters
    .filter((c) => c.open > 0)
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
    .slice(0, max)
    .reduce<SplitSlice[]>((rows, c) => {
      const acc = rows.reduce((sum, r) => sum + r.pct, 0);
      const pct = openTotal ? Math.round((c.open / openTotal) * 100) : 0;
      rows.push({
        name: c.name,
        color: c.color,
        pct,
        dash: `${((DONUT_C * pct) / 100).toFixed(1)} ${DONUT_C.toFixed(1)}`,
        offset: ((-DONUT_C * acc) / 100).toFixed(1),
      });
      return rows;
    }, []);
}
