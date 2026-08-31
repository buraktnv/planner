import { proposalActionSchema, type ProposalAction } from "@/lib/ai/schemas";
import type { ProposalStatus, StoredProposal } from "@/lib/core/proposals";

/**
 * What the `/proposals` page decides, kept pure so it can be tested — vitest
 * runs in a node environment here, so anything decided inside a `.tsx` file is
 * decided untested.
 */

export interface ProposalRow {
  id: string;
  status: ProposalStatus;
  title: string;
  summary?: string;
  agent: string;
  created: string;
  outcome?: string;
  /** Actions the schema still accepts. */
  actions: ProposalAction[];
  /** How many the schema refused, plus lines that no longer parsed as JSON. */
  invalid: number;
  /** True when there is nothing left to apply. */
  empty: boolean;
}

/**
 * Re-validate on the way in. The file is on disk and hand-editable, so the page
 * must never hand `applyProposal` an action the schema would refuse. A refused
 * action is counted, not thrown — one bad row must not hide the other twelve.
 */
export function toRow(p: StoredProposal): ProposalRow {
  const actions: ProposalAction[] = [];
  let invalid = p.dropped;
  for (const raw of p.actions) {
    const parsed = proposalActionSchema.safeParse(raw);
    if (parsed.success) actions.push(parsed.data);
    else invalid += 1;
  }
  return {
    id: p.id,
    status: p.status,
    title: p.title,
    summary: p.summary,
    agent: p.agent,
    created: p.created,
    outcome: p.outcome,
    actions,
    invalid,
    empty: actions.length === 0,
  };
}

const OPEN: ProposalStatus[] = ["pending", "applying"];

export function isOpen(status: ProposalStatus): boolean {
  return OPEN.includes(status);
}

export interface ProposalGroups {
  open: ProposalRow[];
  settled: ProposalRow[];
}

/** Waiting on a decision first; everything already dealt with after. */
export function groupProposals(rows: ProposalRow[]): ProposalGroups {
  return {
    open: rows.filter((r) => isOpen(r.status)),
    settled: rows.filter((r) => !isOpen(r.status)),
  };
}

export function pendingCount(rows: ProposalRow[]): number {
  return rows.filter((r) => r.status === "pending" && !r.empty).length;
}

const LABELS: Record<ProposalStatus, string> = {
  pending: "WAITING",
  applying: "APPLYING",
  applied: "APPLIED",
  partial: "PART APPLIED",
  discarded: "DISCARDED",
};

export function statusLabel(status: ProposalStatus): string {
  return LABELS[status] ?? "WAITING";
}

/**
 * One line describing the batch by what it would write, so the list is readable
 * without opening anything.
 */
export function rowSummary(row: ProposalRow): string {
  if (row.empty) {
    return row.invalid > 0 ? `nothing usable · ${row.invalid} unreadable` : "nothing to apply";
  }
  const counts = new Map<string, number>();
  for (const a of row.actions) {
    const noun = NOUNS[a.kind] ?? a.kind.replace(/_/g, " ");
    counts.set(noun, (counts.get(noun) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([noun, n]) => (n === 1 ? `1 ${noun}` : `${n} ${noun}s`));
  const tail = row.invalid > 0 ? ` · ${row.invalid} unreadable` : "";
  return parts.join(", ") + tail;
}

const NOUNS: Record<string, string> = {
  create_task: "task",
  update_task: "task edit",
  decompose_task: "breakdown",
  move_to_parking_lot: "parked idea",
  create_event: "event",
  update_event: "event edit",
  add_note: "note",
  update_note: "note edit",
  create_habit: "habit",
  create_rhythm: "rhythm",
  create_meal: "meal",
  create_project: "project",
  create_area: "life area",
};

/**
 * Relative age from the stored `created` stamp ("YYYY-MM-DD HH:mm:ss").
 *
 * The `Z` is load-bearing: the store writes the stamp in UTC, and a
 * date-time string with no zone is parsed as *local* time. Without it, every
 * proposal on a machine east of UTC reads as hours old the moment it is filed —
 * which is exactly what the test for this caught.
 *
 * Total: an unparseable stamp reads as empty rather than "NaN days ago".
 */
export function ageLabel(created: string, now: Date = new Date()): string {
  const at = Date.parse(`${created.trim().replace(" ", "T")}Z`);
  if (!Number.isFinite(at)) return "";
  const mins = Math.floor((now.getTime() - at) / 60_000);
  if (mins < 0) return "just now";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/** Describes a finished apply for the stored `outcome` field. */
export function outcomeText(applied: number, total: number, failedIndex: number | null): string {
  if (failedIndex === null) return `${applied} of ${total} applied`;
  return `${applied} of ${total} applied, stopped at row ${failedIndex + 1}`;
}
