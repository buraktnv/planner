import type { JournalDay } from "@/lib/core/journal";
import type { CardModel, Workspace } from "./workspace";
import type { EventModel } from "./calendar";
import { LANES, parseIso, shortDate } from "@/lib/ui/momentum";

export interface RankedItem {
  card: CardModel;
  why: string;
  effort: string;
  pinned: boolean;
}

export interface StreakModel {
  name: string;
  n: number;
  pct: number;
  color: string;
}

export interface FocusModel {
  ranked: RankedItem[];
  todayEvents: EventModel[];
  oneThing: RankedItem | null;
  /**
   * Index of oneThing in `ranked`, so the view can start there and still do
   * its own index arithmetic when you skip. 0 when nothing qualifies.
   */
  oneIndex: number;
  streaks: StreakModel[];
  held: { n: number; label: string }[];
  overdue: number;
  openTotal: number;
  planLead: string;
  quietLead: string;
  dailyNote: string | null;
  stuckFacts: string[];
  stuckOffers: { kind: "physical" | "small"; text: string; cardKey?: string }[];
}

const EFFORT: Record<string, string> = { S: "15 min", M: "1 h", L: "2 h+" };

/** A low mood cuts the day's plan to two rows. Moods are 1-4; 1-2 is a low day. */
export function isLowDay(mood: number | null): boolean {
  return mood !== null && mood <= 2;
}

export function planRowsFor(ranked: RankedItem[], mood: number | null): RankedItem[] {
  return ranked.slice(0, isLowDay(mood) ? 2 : 5);
}

export type SkipReason = "energy" | "blocked" | "urgent" | "quick";

/**
 * Where the One Thing pointer lands after a skip. "quick" and "energy" look
 * for the cheapest other task; anything else steps down the ranking. Clamped,
 * so skipping the last row leaves it there rather than pointing past the end.
 */
export function nextIndexAfterSkip(
  ranked: RankedItem[],
  index: number,
  reason: SkipReason,
): number {
  if (ranked.length === 0) return 0;
  const step = Math.min(index + 1, ranked.length - 1);
  if (reason !== "quick" && reason !== "energy") return step;
  const small = ranked.findIndex((r, i) => i !== index && r.card.size === "S");
  return small >= 0 ? small : step;
}

export function clockOf(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function groupOf(card: CardModel, today: string): number {
  if (card.blocked) return 4;
  if (card.due) return card.due < today ? 0 : 1;
  if (card.section === "in-progress") return 2;
  return 3;
}

export function rankCards(ws: Workspace): RankedItem[] {
  const open = ws.cards.filter((c) => !c.done && c.section !== "done");
  const charterPriority = new Map(ws.charters.map((c) => [`${c.type}/${c.id}`, c.priority]));
  const sized: Record<string, number> = { S: 0, M: 1, L: 2 };

  const sorted = [...open].sort((a, b) => {
    const ga = groupOf(a, ws.today);
    const gb = groupOf(b, ws.today);
    if (ga !== gb) return ga - gb;
    if (ga <= 1) {
      const da = a.due ?? "";
      const db = b.due ?? "";
      if (da !== db) return da < db ? -1 : 1;
    }
    const pa = charterPriority.get(`${a.type}/${a.slug}`) ?? 9;
    const pb = charterPriority.get(`${b.type}/${b.slug}`) ?? 9;
    if (pa !== pb) return pa - pb;
    if (sized[a.size] !== sized[b.size]) return sized[a.size] - sized[b.size];
    return a.title.localeCompare(b.title);
  });

  return sorted.map((card) => ({
    card,
    why: reasonFor(card, ws.today),
    effort: card.est ?? EFFORT[card.size] ?? "",
    pinned: card.overdue && !card.blocked,
  }));
}

export function reasonFor(card: CardModel, today: string): string {
  if (card.blocked) {
    return `Waits on ${card.blockedByTitle ?? card.waitsOn ?? "something else"}`;
  }
  if (card.overdue && card.due) {
    const days = Math.max(
      1,
      Math.round((parseIso(today).getTime() - parseIso(card.due).getTime()) / 86400000),
    );
    return `Past its date by ${days} day${days === 1 ? "" : "s"} — ${shortDate(card.due)}`;
  }
  if (card.due) return `Dated ${shortDate(card.due)}`;
  if (card.section === "in-progress") {
    return card.subTotal
      ? `Already started — ${card.subDone} of ${card.subTotal} steps done`
      : "Already started";
  }
  if (card.subTotal > 0) return `${card.subTotal} steps waiting under it`;
  if (card.lane === "wait") return `Parked in ${LANES.wait.label.toLowerCase()} — needs a nudge`;
  if (card.size === "S") return "Cheapest thing on the list";
  return `${card.charterName} · nothing blocking it`;
}

function isoOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function shiftIso(iso: string, days: number): string {
  const base = parseIso(iso);
  return isoOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
}

function streakOf(
  days: JournalDay[],
  predicate: (day: JournalDay) => boolean,
  today: string,
): number {
  const hit = new Set(days.filter(predicate).map((d) => d.date));
  const offset = hit.has(today) ? 0 : 1;
  let n = 0;
  while (n < 400 && hit.has(shiftIso(today, -(offset + n)))) n += 1;
  return n;
}

export function buildFocus(
  ws: Workspace,
  journal: JournalDay[],
  events: EventModel[] = [],
  daily?: { habitsLeft: number },
): FocusModel {
  const todayEvents = events
    .filter((e) => !e.done && e.date === ws.today)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.id.localeCompare(b.id));
  const ranked = rankCards(ws);
  const overdue = ranked.filter((r) => r.card.overdue).length;
  const sorted = [...journal].sort((a, b) => (a.date < b.date ? 1 : -1));

  const activeStreak = streakOf(sorted, (d) => d.entries.length > 0, ws.today);
  const morningStreak = streakOf(
    sorted,
    (d) => d.entries.some((e) => Number(e.time.slice(0, 2)) < 12),
    ws.today,
  );

  const weekAgo = new Date(parseIso(ws.today).getTime() - 6 * 86400000);
  const weekStart = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, "0")}-${String(
    weekAgo.getDate(),
  ).padStart(2, "0")}`;
  const closedThisWeek = ws.cards.filter(
    (c) => c.done && c.doneDate && c.doneDate >= weekStart,
  ).length;
  const doneToday = ws.cards.filter((c) => c.done && c.doneDate === ws.today).length;
  const entriesToday = sorted.find((d) => d.date === ws.today)?.entries.length ?? 0;

  const streaks: StreakModel[] = [
    {
      name: "Days with activity",
      n: activeStreak,
      pct: Math.min(100, (activeStreak / 14) * 100),
      color: "#63b894",
    },
    {
      name: "Morning starts",
      n: morningStreak,
      pct: Math.min(100, (morningStreak / 14) * 100),
      color: "#7d95dd",
    },
    {
      name: "Closed this week",
      n: closedThisWeek,
      pct: Math.min(100, (closedThisWeek / 12) * 100),
      color: "#d9a463",
    },
  ];

  const smallest = ranked.find((r) => r.card.size === "S" && !r.card.blocked);
  const stalest = [...ranked].sort((a, b) =>
    (a.card.created ?? "9").localeCompare(b.card.created ?? "9"),
  )[0];

  const stuckFacts: string[] = [];
  if (overdue > 0) {
    const worst = ranked.find((r) => r.card.overdue);
    stuckFacts.push(
      `${overdue} thing${overdue === 1 ? "" : "s"} sat past its date. The oldest is ${worst?.card.title}, dated ${
        worst?.card.due ? shortDate(worst.card.due) : "—"
      }.`,
    );
  }
  if (stalest?.card.created && stalest.card.created < weekStart) {
    stuckFacts.push(
      `${stalest.card.id} has been open since ${shortDate(stalest.card.created)} and has not moved.`,
    );
  }
  if (entriesToday === 0) {
    stuckFacts.push("Nothing logged today yet, so there is no first move written down.");
  }
  if (stuckFacts.length === 0) {
    stuckFacts.push(
      `Nothing is overdue and ${ranked.length} thing${ranked.length === 1 ? " is" : "s are"} open. There is no emergency here — pick the cheapest one.`,
    );
  }

  const stuckOffers: FocusModel["stuckOffers"] = [
    { kind: "physical", text: "Stand up, water, five minutes away from the screen." },
  ];
  if (smallest) {
    stuckOffers.push({
      kind: "small",
      text: `Open ${smallest.card.id} — ${smallest.card.title}. Change nothing else.`,
      cardKey: smallest.card.key,
    });
  }

  const openTotal = ranked.length;
  // Blocked work is never the One Thing. -1 means everything open is blocked,
  // in which case the view still has to show something, so fall back to first.
  const firstUnblocked = ranked.findIndex((r) => !r.card.blocked);
  const oneIndex = firstUnblocked === -1 ? 0 : firstUnblocked;

  return {
    ranked,
    todayEvents,
    oneThing: firstUnblocked === -1 ? null : ranked[firstUnblocked],
    oneIndex,
    streaks,
    held: [
      { n: doneToday, label: "DONE TODAY" },
      { n: entriesToday, label: "LOGGED" },
      { n: overdue, label: "PAST DATE" },
    ],
    overdue,
    openTotal,
    planLead:
      overdue > 0
        ? `${overdue} dated thing${overdue === 1 ? "" : "s"} first, then the block you have room for.`
        : openTotal === 0
          ? "Nothing open. Capture something, or close the day."
          : "Nothing is overdue, so this is ordered by what is closest to done.",
    quietLead:
      openTotal === 0
        ? "Nothing open. Genuinely."
        : "Low day. Cut to the top two and put movement first — the rest can wait.",
    dailyNote:
      daily && daily.habitsLeft > 0
        ? `${daily.habitsLeft} habit${daily.habitsLeft === 1 ? "" : "s"} left today.`
        : null,
    stuckFacts,
    stuckOffers,
  };
}
