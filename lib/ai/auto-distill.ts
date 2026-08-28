import { appendJournal, readJournal } from "../core/journal";
import { listNotes } from "../core/knowledge";
import { getProviders } from "../core/providers";
import { isoToday } from "../ui/momentum";
import {
  AUTO_RUN_MARKER,
  AUTO_RUN_SCOPE,
  AUTO_RUN_WINDOW_DAYS,
  buildDistillStatus,
  dueForDistill,
  lastAutoRunFrom,
} from "../view/distill";
import { distillJournal } from "./distill";
import {
  attemptedRecently,
  beginRun,
  clearPending,
  endRun,
  getPending,
  markAttempt,
  setPending,
} from "./pending";
import type { Proposal } from "./schemas";

export async function markAutoRun(outcome: string): Promise<void> {
  await appendJournal(AUTO_RUN_SCOPE, `${AUTO_RUN_MARKER}: ${outcome}`);
}

export async function runDistillIfDue(): Promise<Proposal | null> {
  const existing = getPending();
  if (existing) return existing;
  if (attemptedRecently()) return null;
  if (!beginRun()) return null;

  try {
    markAttempt();
    const [journal, notes] = await Promise.all([
      readJournal(Math.max(AUTO_RUN_WINDOW_DAYS, 7)),
      listNotes(),
    ]);
    const status = buildDistillStatus(journal, notes, isoToday());
    if (!dueForDistill(status, lastAutoRunFrom(journal), isoToday())) return null;

    const providers = await getProviders();
    const proposal = await distillJournal({ providers, days: AUTO_RUN_WINDOW_DAYS });
    if (!proposal) {
      await markAutoRun("nothing worth filing");
      return null;
    }
    setPending(proposal);
    return proposal;
  } catch {
    return null;
  } finally {
    endRun();
  }
}

export async function resolvePending(outcome: "accepted" | "discarded", count = 0): Promise<void> {
  clearPending();
  await markAutoRun(outcome === "accepted" ? `${count} notes accepted` : "discarded");
}
