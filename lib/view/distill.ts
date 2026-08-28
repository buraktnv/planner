import type { JournalDay } from "@/lib/core/journal";
import type { KnowledgeNote } from "@/lib/core/types";

export interface DistillStatus {
  journalDays: number;
  entries: number;
  lastNoteDate: string | null;
  daysSinceLastNote: number | null;
  ready: boolean;
  headline: string;
}

const MIN_ENTRIES = 3;

function dayGap(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export const AUTO_RUN_SCOPE = "agent:distill";
export const AUTO_RUN_MARKER = "auto distill run";
export const AUTO_RUN_WINDOW_DAYS = 7;

export function lastAutoRunFrom(journal: JournalDay[]): string | null {
  let latest: string | null = null;
  for (const day of journal) {
    if (!day.entries.some((e) => e.message.includes(AUTO_RUN_MARKER))) continue;
    if (latest === null || day.date > latest) latest = day.date;
  }
  return latest;
}

export function dueForDistill(
  status: DistillStatus,
  lastAutoRun: string | null,
  today: string,
  windowDays = AUTO_RUN_WINDOW_DAYS,
): boolean {
  if (!status.ready) return false;
  if (lastAutoRun === null) return true;
  return dayGap(lastAutoRun, today) >= windowDays;
}

export function latestNoteDate(notes: KnowledgeNote[]): string | null {
  let latest: string | null = null;
  for (const n of notes) {
    if (latest === null || n.created > latest) latest = n.created;
  }
  return latest;
}

export function buildDistillStatus(
  journal: JournalDay[],
  notes: KnowledgeNote[],
  today: string,
): DistillStatus {
  const journalDays = journal.filter((d) => d.entries.length > 0).length;
  const entries = journal.reduce(
    (sum, d) => sum + d.entries.filter((e) => !e.scope.startsWith("agent:")).length,
    0,
  );
  const lastNoteDate = latestNoteDate(notes);
  const daysSinceLastNote = lastNoteDate ? dayGap(lastNoteDate, today) : null;
  const ready = entries >= MIN_ENTRIES;

  return {
    journalDays,
    entries,
    lastNoteDate,
    daysSinceLastNote,
    ready,
    headline: headlineFor(journalDays, entries, daysSinceLastNote, ready),
  };
}

function headlineFor(
  journalDays: number,
  entries: number,
  daysSinceLastNote: number | null,
  ready: boolean,
): string {
  if (!ready) {
    return entries === 0
      ? "No journal activity to distill yet."
      : `Only ${entries} journal ${entries === 1 ? "entry" : "entries"} — not enough to distill yet.`;
  }
  const left = `${entries} journal ${entries === 1 ? "entry" : "entries"} across ${journalDays} ${
    journalDays === 1 ? "day" : "days"
  }`;
  if (daysSinceLastNote === null) {
    return `${left} and nothing filed yet. Distill to turn what happened into notes.`;
  }
  if (daysSinceLastNote === 0) {
    return `${left}. You filed a note today.`;
  }
  return `${left}, last note filed ${daysSinceLastNote} ${
    daysSinceLastNote === 1 ? "day" : "days"
  } ago.`;
}
