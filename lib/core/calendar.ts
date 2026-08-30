import fs from "node:fs/promises";
import path from "node:path";
import type { CalendarEvent } from "./types";
import { calendarPath } from "./paths";
import { appendJournal } from "./journal";
import { commitData } from "./git";
import { withDataLock } from "./locks";

export class CalendarParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarParseError";
  }
}

const EVENT_PREFIX_RE = /^- \[( |x)\] (.*)$/;
const EVENT_ID_RE = /^E-\d{3,}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SCOPE_RE = /^(area:)?[a-z0-9][a-z0-9-]*$/;
const EVENT_FIELD_KEYS = ["time", "note", "scope", "action"] as const;
const TIME_MAX = 12;

type EventFieldKey = (typeof EVENT_FIELD_KEYS)[number];

function toLF(raw: string): string {
  return raw.replace(/\r\n/g, "\n");
}

function isFieldKey(key: string): key is EventFieldKey {
  return (EVENT_FIELD_KEYS as readonly string[]).includes(key);
}

export function parseEvents(raw: string): CalendarEvent[] {
  const lines = toLF(raw).split("\n");
  const events: CalendarEvent[] = [];
  const seen = new Set<string>();

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (line.trim() === "") return;
    if (line.startsWith("#")) return;

    const prefix = EVENT_PREFIX_RE.exec(line);
    if (!prefix) {
      throw new CalendarParseError(`Line ${lineNo}: malformed event line: ${line}`);
    }
    const done = prefix[1] === "x";
    const parts = prefix[2].split(" | ");
    const id = (parts[0] ?? "").trim();
    const date = (parts[1] ?? "").trim();
    const title = (parts[2] ?? "").trim();

    if (!EVENT_ID_RE.test(id)) {
      throw new CalendarParseError(
        `Line ${lineNo}: invalid event id "${id}"; expected E- followed by at least 3 digits`,
      );
    }
    if (seen.has(id)) {
      throw new CalendarParseError(`Line ${lineNo}: duplicate event id "${id}"`);
    }
    if (!ISO_DATE_RE.test(date)) {
      throw new CalendarParseError(
        `Line ${lineNo}: event ${id} has an invalid date "${date}"; expected YYYY-MM-DD`,
      );
    }
    if (title === "") {
      throw new CalendarParseError(`Line ${lineNo}: event ${id} is missing a title: ${line}`);
    }
    seen.add(id);

    const event: CalendarEvent = { id, date, title, done };
    for (const field of parts.slice(3)) {
      const colon = field.indexOf(":");
      if (colon < 0) {
        throw new CalendarParseError(`Line ${lineNo}: malformed field "${field}" in: ${line}`);
      }
      const key = field.slice(0, colon).trim();
      const value = field.slice(colon + 1).trim();
      if (!isFieldKey(key)) {
        throw new CalendarParseError(
          `Line ${lineNo}: unknown field key "${key}" in: ${line}; expected one of: ${EVENT_FIELD_KEYS.join(", ")}`,
        );
      }
      if (value === "") {
        throw new CalendarParseError(`Line ${lineNo}: event ${id} has an empty ${key}: value: ${line}`);
      }
      if (event[key] !== undefined) {
        throw new CalendarParseError(`Line ${lineNo}: event ${id} repeats the ${key}: field: ${line}`);
      }
      if (key === "time" && value.length > TIME_MAX) {
        throw new CalendarParseError(
          `Line ${lineNo}: event ${id} has a time: longer than ${TIME_MAX} characters: ${value}`,
        );
      }
      if (key === "scope" && !SCOPE_RE.test(value)) {
        throw new CalendarParseError(
          `Line ${lineNo}: event ${id} has an invalid scope "${value}"; expected <slug> or area:<slug>`,
        );
      }
      event[key] = value;
    }

    events.push(event);
  });

  return events;
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ta = a.time ?? "";
    const tb = b.time ?? "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function serializeEvents(events: CalendarEvent[]): string {
  const lines = sortEvents(events).map((e) => {
    const fields: string[] = [];
    if (e.time) fields.push(`time:${e.time}`);
    if (e.note) fields.push(`note:${e.note}`);
    if (e.scope) fields.push(`scope:${e.scope}`);
    if (e.action) fields.push(`action:${e.action}`);
    const tail = fields.length ? ` | ${fields.join(" | ")}` : "";
    return `- [${e.done ? "x" : " "}] ${e.id} | ${e.date} | ${e.title}${tail}`;
  });
  return lines.length ? `${lines.join("\n")}\n` : "";
}

export function nextEventId(events: CalendarEvent[]): string {
  let max = 0;
  for (const e of events) {
    const m = /^E-(\d+)$/.exec(e.id);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return `E-${String(max + 1).padStart(3, "0")}`;
}

export function scopeSlugOf(scope: string | undefined): string {
  if (!scope) return "calendar";
  return scope.startsWith("area:") ? scope.slice("area:".length) : scope;
}

function cleanValue(key: EventFieldKey, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (trimmed.includes(" | ")) {
    throw new Error(`A calendar ${key}: value may not contain " | "`);
  }
  if (key === "time" && trimmed.length > TIME_MAX) {
    throw new Error(`A calendar time: value may not exceed ${TIME_MAX} characters`);
  }
  if (key === "scope" && !SCOPE_RE.test(trimmed)) {
    throw new Error(`Invalid scope "${trimmed}"; expected <slug> or area:<slug>`);
  }
  return trimmed;
}

function cleanDate(date: string): string {
  const trimmed = date.trim();
  if (!ISO_DATE_RE.test(trimmed)) {
    throw new Error(`Invalid event date "${date}"; expected YYYY-MM-DD`);
  }
  return trimmed;
}

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === "") throw new Error("An event requires a title");
  if (trimmed.includes(" | ")) throw new Error('An event title may not contain " | "');
  return trimmed;
}

async function writeEvents(events: CalendarEvent[]): Promise<void> {
  const file = calendarPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, serializeEvents(events), "utf8");
}

export async function listEvents(range?: { from?: string; to?: string }): Promise<CalendarEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(calendarPath(), "utf8");
  } catch {
    return [];
  }
  const events = sortEvents(parseEvents(raw));
  if (!range) return events;
  return events.filter(
    (e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to),
  );
}

export function addEvent(
  ...args: Parameters<typeof addEventUnlocked>
): ReturnType<typeof addEventUnlocked> {
  return withDataLock(() => addEventUnlocked(...args));
}

async function addEventUnlocked(input: {
  date: string;
  title: string;
  time?: string;
  note?: string;
  scope?: string;
  action?: string;
  done?: boolean;
}): Promise<CalendarEvent> {
  const events = await listEvents();
  const event: CalendarEvent = {
    id: nextEventId(events),
    date: cleanDate(input.date),
    title: cleanTitle(input.title),
    done: input.done ?? false,
    time: cleanValue("time", input.time),
    note: cleanValue("note", input.note),
    scope: cleanValue("scope", input.scope),
    action: cleanValue("action", input.action),
  };
  await writeEvents([...events, event]);
  await appendJournal(scopeSlugOf(event.scope), `${event.id} event added: ${event.title}`);
  await commitData(`event added: ${event.id} (${event.date})`);
  return event;
}

export function updateEvent(
  ...args: Parameters<typeof updateEventUnlocked>
): ReturnType<typeof updateEventUnlocked> {
  return withDataLock(() => updateEventUnlocked(...args));
}

async function updateEventUnlocked(
  id: string,
  patch: {
    date?: string;
    title?: string;
    time?: string;
    note?: string;
    scope?: string;
    action?: string;
    done?: boolean;
  },
): Promise<CalendarEvent> {
  const events = await listEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx < 0) throw new Error(`Event not found: ${id}`);
  const next: CalendarEvent = { ...events[idx] };
  if (patch.date !== undefined) next.date = cleanDate(patch.date);
  if (patch.title !== undefined) next.title = cleanTitle(patch.title);
  if (patch.time !== undefined) next.time = cleanValue("time", patch.time);
  if (patch.note !== undefined) next.note = cleanValue("note", patch.note);
  if (patch.scope !== undefined) next.scope = cleanValue("scope", patch.scope);
  if (patch.action !== undefined) next.action = cleanValue("action", patch.action);
  if (patch.done !== undefined) next.done = patch.done;
  events[idx] = next;
  await writeEvents(events);
  const message = patch.done === true ? `${id} event done` : `${id} event updated`;
  await appendJournal(scopeSlugOf(next.scope), message);
  await commitData(`${message} (${next.date})`);
  return next;
}
