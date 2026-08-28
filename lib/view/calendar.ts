import type { CalendarEvent, ProjectType } from "@/lib/core/types";
import type { CardModel, Workspace } from "./workspace";
import { hueOf, monthName, parseIso, weekdayOf } from "@/lib/ui/momentum";

export interface EventModel {
  key: string;
  id: string;
  date: string;
  title: string;
  done: boolean;
  time?: string;
  note?: string;
  action?: string;
  scope?: string;
  scopeType?: ProjectType;
  scopeSlug?: string;
  charterName?: string;
  color: string;
  tint: string;
  past: boolean;
}

export interface CalendarDot {
  color: string;
  kind: "event" | "task";
  overdue: boolean;
}

export interface CalendarDay {
  iso: string;
  num: number;
  weekday: string;
  isToday: boolean;
  past: boolean;
  events: EventModel[];
  cards: CardModel[];
  dots: CalendarDot[];
}

export interface CalendarModel {
  today: string;
  label: string;
  rows: CalendarDay[][];
  upNext: CalendarDay[];
  needsAction: EventModel[];
  overdueCards: CardModel[];
  pastEvents: EventModel[];
  eventCount: number;
  datedCount: number;
  overdueCount: number;
}

const EVENT_FALLBACK = { color: "#a9a3b5", tint: "#eeecf1" };
const UP_NEXT_DAYS = 14;

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftIso(iso: string, days: number): string {
  const base = parseIso(iso);
  return isoOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
}

function splitScope(scope: string | undefined): { type: ProjectType; slug: string } | null {
  if (!scope) return null;
  if (scope.startsWith("area:")) return { type: "area", slug: scope.slice("area:".length) };
  return { type: "project", slug: scope };
}

export function toEventModels(events: CalendarEvent[], ws: Workspace): EventModel[] {
  return events.map((e) => {
    const ref = splitScope(e.scope);
    const charter = ref
      ? (ws.byId.get(`${ref.type}/${ref.slug}`) ?? ws.byId.get(`project/${ref.slug}`) ?? ws.byId.get(`area/${ref.slug}`))
      : undefined;
    const tone = ref ? hueOf(charter?.id ?? ref.slug) : EVENT_FALLBACK;
    return {
      key: `event/${e.id}`,
      id: e.id,
      date: e.date,
      title: e.title,
      done: e.done,
      time: e.time,
      note: e.note,
      action: e.action,
      scope: e.scope,
      scopeType: charter?.type ?? ref?.type,
      scopeSlug: charter?.id ?? ref?.slug,
      charterName: charter?.name,
      color: tone.color,
      tint: tone.tint,
      past: !e.done && e.date < ws.today,
    };
  });
}

export function buildCalendar(ws: Workspace, events: CalendarEvent[]): CalendarModel {
  const models = toEventModels(events, ws).sort(
    (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.id.localeCompare(b.id),
  );
  const openEvents = models.filter((e) => !e.done);
  const datedCards = ws.cards.filter((c) => !c.done && !!c.due);

  const eventsByDay = new Map<string, EventModel[]>();
  for (const e of openEvents) {
    const list = eventsByDay.get(e.date) ?? [];
    list.push(e);
    eventsByDay.set(e.date, list);
  }
  const cardsByDay = new Map<string, CardModel[]>();
  for (const c of datedCards) {
    const list = cardsByDay.get(c.due as string) ?? [];
    list.push(c);
    cardsByDay.set(c.due as string, list);
  }

  const dayAt = (iso: string): CalendarDay => {
    const dayEvents = eventsByDay.get(iso) ?? [];
    const dayCards = cardsByDay.get(iso) ?? [];
    const dots: CalendarDot[] = [
      ...dayEvents.map((e) => ({ color: e.color, kind: "event" as const, overdue: !!e.action })),
      ...dayCards.map((c) => ({ color: c.color, kind: "task" as const, overdue: c.overdue })),
    ].slice(0, 4);
    const d = parseIso(iso);
    return {
      iso,
      num: d.getDate(),
      weekday: weekdayOf(iso),
      isToday: iso === ws.today,
      past: iso < ws.today,
      events: dayEvents,
      cards: dayCards,
      dots,
    };
  };

  const todayDate = parseIso(ws.today);
  const gridStart = shiftIso(ws.today, -((todayDate.getDay() + 6) % 7));
  const rows: CalendarDay[][] = [0, 1, 2].map((w) =>
    [0, 1, 2, 3, 4, 5, 6].map((i) => dayAt(shiftIso(gridStart, w * 7 + i))),
  );

  const first = parseIso(gridStart);
  const last = parseIso(shiftIso(gridStart, 20));
  const label =
    first.getMonth() === last.getMonth()
      ? `${monthName(first.getMonth())} ${first.getFullYear()}`
      : `${monthName(first.getMonth())} — ${monthName(last.getMonth())} ${last.getFullYear()}`;

  const upNext: CalendarDay[] = [];
  for (let i = 0; i < UP_NEXT_DAYS; i += 1) {
    const day = dayAt(shiftIso(ws.today, i));
    if (day.events.length || day.cards.length) upNext.push(day);
  }

  return {
    today: ws.today,
    label,
    rows,
    upNext,
    needsAction: openEvents.filter((e) => !!e.action),
    overdueCards: datedCards.filter((c) => c.overdue),
    pastEvents: openEvents.filter((e) => e.past),
    eventCount: openEvents.length,
    datedCount: datedCards.length,
    overdueCount: datedCards.filter((c) => c.overdue).length + openEvents.filter((e) => e.past).length,
  };
}
