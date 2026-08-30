import {
  proposalActionSchema,
  type Proposal,
  type ProposalAction,
  type ProposalActionKind,
  type ProposalApplyResult,
  type ProposalPreviewRow,
} from "@/lib/ai/schemas";

/**
 * Everything the review modal decides, kept pure so it can be tested — vitest
 * is environment: "node" here and collects lib/** only, so a decision left
 * inside the React component is a decision with no test.
 *
 * The load-bearing fact this module relies on: `/api/proposals/apply` trusts
 * only `actions`, re-validating them against the same discriminated union and
 * discarding title, summary and preview. So an edited or filtered subset is
 * already a legal thing to post, and none of this needs a backend change.
 */

export interface ReviewRow {
  index: number;
  kind: ProposalActionKind;
  action: ProposalAction;
  /** What the model sent, kept so `edited` means something after several edits. */
  original: ProposalAction;
  preview: ProposalPreviewRow;
  selected: boolean;
  /** True once the row differs from what the model actually sent. */
  edited: boolean;
  applied?: "ok" | "failed" | "skipped";
  error?: string;
}

export interface ReviewDraft {
  /** Stable across supersedes, so one accepted batch can disable its siblings. */
  lineageId: string;
  toolCallId: string;
  proposalId: string;
  title: string;
  summary?: string;
  rows: ReviewRow[];
  supersedes?: string;
}

export function buildDraft(
  proposal: Proposal,
  toolCallId: string,
  lineageId = toolCallId,
): ReviewDraft {
  return {
    lineageId,
    toolCallId,
    proposalId: proposal.proposalId,
    title: proposal.title,
    summary: proposal.summary,
    rows: proposal.actions.map((action, index) => ({
      index,
      kind: action.kind,
      action,
      original: action,
      // preview[i] is built in the same loop as actions[i], so they align.
      preview: proposal.preview[index],
      selected: true,
      edited: false,
    })),
  };
}

export function toggleRow(draft: ReviewDraft, index: number): ReviewDraft {
  return {
    ...draft,
    rows: draft.rows.map((r) =>
      r.index === index && r.applied !== "ok" ? { ...r, selected: !r.selected } : r,
    ),
  };
}

export function setAllSelected(draft: ReviewDraft, selected: boolean): ReviewDraft {
  return {
    ...draft,
    rows: draft.rows.map((r) => (r.applied === "ok" ? r : { ...r, selected })),
  };
}

const NUMERIC_KEYS = new Set(["goal", "per", "servings"]);

/**
 * Never throws. A field editor is a text input the user can put anything in,
 * and an exception here would take down the whole rail. Validation is a
 * separate step, reported rather than raised.
 */
export function applyEdit(
  draft: ReviewDraft,
  index: number,
  key: string,
  value: string | boolean,
): ReviewDraft {
  const rows = draft.rows.map((row) => {
    if (row.index !== index) return row;
    if (!fieldsForKind(row.kind).some((f) => f.key === key)) return row;

    const next: Record<string, unknown> = { ...row.action };
    if (typeof value === "boolean") {
      if (value) next[key] = true;
      else delete next[key];
    } else if (NUMERIC_KEYS.has(key)) {
      const n = Number(value);
      next[key] = value.trim() === "" || Number.isNaN(n) ? value : n;
    } else if (value === "" && !isRequired(row.kind, key)) {
      // An empty optional is absent, not the empty string — except where the
      // tool layer reads "" as "clear this field", which is its own meaning.
      if (CLEARABLE.has(key)) next[key] = "";
      else delete next[key];
    } else {
      next[key] = value;
    }

    const action = next as unknown as ProposalAction;
    return { ...row, action, edited: !sameAction(action, row.original) };
  });

  return { ...draft, rows };
}

/**
 * `waitsOn`, `target` and `note` read an empty string as "clear it" in the tool
 * layer, so emptying one of those must survive as "" rather than vanishing.
 */
const CLEARABLE = new Set(["waitsOn", "target", "note", "time", "action", "scope", "source"]);

function sameAction(a: ProposalAction, b: ProposalAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Rows the Accept button will actually post, in their original order. */
export function selectedActions(draft: ReviewDraft): ProposalAction[] {
  return draft.rows
    .filter((r) => r.selected && r.applied !== "ok")
    .map((r) => stripEmpty(r.action));
}

function stripEmpty(action: ProposalAction): ProposalAction {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(action)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out as unknown as ProposalAction;
}

export interface DraftStats {
  total: number;
  selected: number;
  edited: number;
  applied: number;
  label: string;
}

export function draftStats(draft: ReviewDraft): DraftStats {
  const rows = draft.rows;
  const pending = rows.filter((r) => r.applied !== "ok");
  const selected = pending.filter((r) => r.selected).length;
  const edited = rows.filter((r) => r.edited).length;
  const applied = rows.filter((r) => r.applied === "ok").length;
  const label =
    selected === 0
      ? "Nothing selected"
      : selected === pending.length
        ? `Accept ${selected} change${selected === 1 ? "" : "s"}`
        : `Accept ${selected} of ${pending.length}`;
  return { total: rows.length, selected, edited, applied, label };
}

/* ------------------------------------------------------------------ fields */

export type FieldType = "text" | "textarea" | "date" | "select" | "boolean" | "number";

export interface FieldDescriptor {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  required: boolean;
  placeholder?: string;
}

const SIZES = ["S", "M", "L"] as const;
const LANES = ["quick", "deep", "wait", "some"] as const;
const SECTIONS = ["backlog", "in-progress", "done"] as const;

/**
 * Hand-written rather than introspected out of zod: introspection yields no
 * labels, no placeholders and no ordering, and changes shape between zod
 * versions. The drift risk that buys is covered by a test which builds an
 * object from these descriptors and asserts proposalActionSchema accepts it.
 */
const FIELDS = {
  create_task: [
    { key: "project", label: "Charter", type: "text", required: true },
    { key: "title", label: "Title", type: "text", required: true },
    { key: "size", label: "Size", type: "select", options: SIZES, required: true },
    { key: "lane", label: "Lane", type: "select", options: LANES, required: false },
    { key: "due", label: "Due", type: "date", required: false, placeholder: "2026-09-04" },
    { key: "est", label: "Estimate", type: "text", required: false, placeholder: "2h" },
    { key: "target", label: "Target", type: "text", required: false, placeholder: "G-001" },
    { key: "note", label: "Component", type: "text", required: false, placeholder: "K-001" },
    { key: "waitsOn", label: "Waits on", type: "text", required: false },
  ],
  update_task: [
    { key: "project", label: "Charter", type: "text", required: true },
    { key: "id", label: "Task", type: "text", required: true },
    { key: "title", label: "Title", type: "text", required: false },
    { key: "size", label: "Size", type: "select", options: SIZES, required: false },
    { key: "section", label: "Section", type: "select", options: SECTIONS, required: false },
    { key: "due", label: "Due", type: "date", required: false, placeholder: "2026-09-04" },
    { key: "est", label: "Estimate", type: "text", required: false },
    { key: "target", label: "Target", type: "text", required: false, placeholder: "G-001" },
    { key: "note", label: "Component", type: "text", required: false, placeholder: "K-001" },
    { key: "waitsOn", label: "Waits on", type: "text", required: false },
    { key: "complete", label: "Mark done", type: "boolean", required: false },
  ],
  decompose_task: [
    { key: "project", label: "Charter", type: "text", required: true },
    { key: "id", label: "Parent task", type: "text", required: true },
  ],
  move_to_parking_lot: [
    { key: "project", label: "Charter", type: "text", required: true },
    { key: "idea", label: "Idea", type: "textarea", required: true },
  ],
  create_event: [
    { key: "date", label: "Date", type: "date", required: true, placeholder: "2026-09-04" },
    { key: "title", label: "Title", type: "text", required: true },
    { key: "time", label: "Time", type: "text", required: false, placeholder: "09:40" },
    { key: "note", label: "Note", type: "text", required: false },
    { key: "scope", label: "Scope", type: "text", required: false, placeholder: "area:admin" },
    { key: "action", label: "Needs doing first", type: "text", required: false },
  ],
  update_event: [
    { key: "id", label: "Event", type: "text", required: true },
    { key: "date", label: "Date", type: "date", required: false },
    { key: "title", label: "Title", type: "text", required: false },
    { key: "time", label: "Time", type: "text", required: false },
    { key: "note", label: "Note", type: "text", required: false },
    { key: "scope", label: "Scope", type: "text", required: false },
    { key: "action", label: "Needs doing first", type: "text", required: false },
    { key: "done", label: "Mark done", type: "boolean", required: false },
  ],
  add_note: [
    { key: "title", label: "Title", type: "text", required: false },
    {
      key: "summary",
      label: "Summary",
      type: "textarea",
      required: true,
      placeholder: "One line stating the conclusion, not the topic",
    },
    { key: "body", label: "Body", type: "textarea", required: false },
    { key: "source", label: "Source", type: "text", required: false },
  ],
  update_note: [
    { key: "id", label: "Note", type: "text", required: true },
    { key: "title", label: "Title", type: "text", required: false },
    { key: "summary", label: "Summary", type: "textarea", required: false },
    { key: "body", label: "Body", type: "textarea", required: false },
    { key: "source", label: "Source", type: "text", required: false },
  ],
  create_habit: [
    { key: "name", label: "Habit", type: "text", required: true },
    { key: "goal", label: "Times a day", type: "number", required: true },
    { key: "unit", label: "Unit", type: "text", required: false, placeholder: "× 15 min" },
  ],
  create_rhythm: [
    { key: "name", label: "Rhythm", type: "text", required: true },
    { key: "per", label: "Times a week", type: "number", required: true },
  ],
  create_meal: [
    { key: "name", label: "Meal", type: "text", required: true },
    { key: "servings", label: "Servings", type: "number", required: true },
  ],
} satisfies Record<ProposalActionKind, readonly FieldDescriptor[]>;

export function fieldsForKind(kind: ProposalActionKind): readonly FieldDescriptor[] {
  return FIELDS[kind] ?? [];
}

function isRequired(kind: ProposalActionKind, key: string): boolean {
  return fieldsForKind(kind).some((f) => f.key === key && f.required);
}

/** Fields the editor cannot express — shown read-only rather than pretended away. */
export function opaqueFieldsFor(action: ProposalAction): { label: string; value: string }[] {
  if (action.kind === "decompose_task") {
    return action.subtasks.map((s, i) => ({
      label: `Subtask ${i + 1} (${s.size})`,
      value: s.title,
    }));
  }
  if ((action.kind === "add_note" || action.kind === "update_note") && action.scope?.length) {
    return [{ label: "Scope", value: action.scope.join(", ") }];
  }
  return [];
}

/* -------------------------------------------------------------- validation */

export interface FieldIssue {
  key: string | null;
  message: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TARGET_ID = /^G-\d{3,}$/;
const NOTE_ID = /^K-\d{3,}$/;
const TASK_ID = /^T-\d+(\.\d+)*$/;
const EVENT_ID = /^E-\d{3,}$/;

/**
 * Catching a bad field here rather than at apply time matters more than it
 * looks: applyProposal stops at the first throw and every action before it has
 * already been written and git-committed. A rejected date is cheap; a
 * half-applied batch is not.
 */
export function validateAction(
  value: unknown,
): { ok: true; action: ProposalAction } | { ok: false; issues: FieldIssue[] } {
  const parsed = proposalActionSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        key: typeof i.path[0] === "string" ? i.path[0] : null,
        message: i.message,
      })),
    };
  }

  const action = parsed.data;
  const issues: FieldIssue[] = [];
  const record = action as unknown as Record<string, unknown>;

  const shape = (key: string, re: RegExp, hint: string) => {
    const v = record[key];
    if (typeof v === "string" && v !== "" && !re.test(v)) {
      issues.push({ key, message: hint });
    }
  };

  shape("due", ISO_DATE, "Use an ISO date, like 2026-09-04");
  shape("date", ISO_DATE, "Use an ISO date, like 2026-09-04");
  shape("target", TARGET_ID, "A target id looks like G-001");
  shape("note", NOTE_ID, "A component id looks like K-001");

  if (action.kind === "update_task" || action.kind === "decompose_task") {
    shape("id", TASK_ID, "A task id looks like T-007, or T-007.2 for a subtask");
  }
  if (action.kind === "update_event") shape("id", EVENT_ID, "An event id looks like E-001");
  if (action.kind === "update_note") shape("id", NOTE_ID, "A note id looks like K-001");

  if (typeof record.time === "string" && record.time.length > 12) {
    issues.push({ key: "time", message: "Time is at most 12 characters" });
  }
  if (typeof record.waitsOn === "string" && record.waitsOn.includes(" | ")) {
    issues.push({ key: "waitsOn", message: "Free text cannot contain \" | \"" });
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, action };
}

export interface DraftValidation {
  ok: boolean;
  rowIssues: Record<number, FieldIssue[]>;
}

export function validateDraft(draft: ReviewDraft): DraftValidation {
  const rowIssues: Record<number, FieldIssue[]> = {};
  for (const row of draft.rows) {
    if (!row.selected || row.applied === "ok") continue;
    const result = validateAction(row.action);
    if (!result.ok) rowIssues[row.index] = result.issues;
  }
  return { ok: Object.keys(rowIssues).length === 0, rowIssues };
}

/* ------------------------------------------------------- intra-batch links */

export interface RowRef {
  index: number;
  id: string;
  label: string;
}

/**
 * A row pointing at a task that does not exist. The commonest way to get one is
 * a batch that creates a task and then decomposes it: decompose_task needs an
 * id, and a task created in the same batch has none until addTask runs, so the
 * model can only guess. The guess fails at apply time — *after* the create has
 * been written and committed, with no rollback. Catching it before the user
 * clicks anything is the only place this can be caught at all.
 *
 * The signal is server-side and already in the preview: previewRow sets `scope`
 * on an update_task or decompose_task row only when findTask actually resolved
 * the id. A missing scope on those kinds means the task is not there. Guessing
 * from the action alone could not tell a valid decompose of an existing task
 * from an impossible one.
 */
export function unresolvableRefs(draft: ReviewDraft): RowRef[] {
  const out: RowRef[] = [];
  for (const row of draft.rows) {
    if (row.applied === "ok") continue;
    if (row.kind !== "update_task" && row.kind !== "decompose_task") continue;
    if (row.preview?.scope) continue;
    const id = (row.action as { id?: string }).id ?? "?";
    out.push({
      index: row.index,
      id,
      label:
        row.kind === "decompose_task"
          ? `${id} does not exist, so there is nothing to break into subtasks. A task created in this same batch has no id yet.`
          : `${id} does not exist in that charter, so there is nothing to update.`,
    });
  }
  return out;
}

/**
 * Rows blocking Accept: the ones still selected that point at nothing.
 *
 * Note what is deliberately *not* here. Deselecting a row cannot orphan another
 * one, because a row this batch creates has no id until it is written — so
 * nothing in the batch can reference it in the first place. That is the same
 * fact `unresolvableRefs` exists for, seen from the other side.
 */
export function blockingRefs(draft: ReviewDraft): RowRef[] {
  const selected = new Set(
    draft.rows.filter((r) => r.selected && r.applied !== "ok").map((r) => r.index),
  );
  return unresolvableRefs(draft).filter((r) => selected.has(r.index));
}

/* --------------------------------------------------- partial apply repair */

/**
 * applyProposal stops at the first failure with no rollback, and everything
 * before it is already committed. Pressing Accept again would re-apply those
 * rows as duplicates — the only route the rail offered. This rebuilds a draft
 * of just what has not landed, so Accept resumes instead.
 *
 * The failed row is pre-selected for editing, never auto-retried.
 */
export function remainderDraft(draft: ReviewDraft, result: ProposalApplyResult): ReviewDraft {
  const attempted = draft.rows.filter((r) => r.selected && r.applied !== "ok");
  const outcomes = new Map<number, ReviewRow["applied"]>();
  const errors = new Map<number, string>();

  attempted.forEach((row, i) => {
    const r = result.results[i];
    if (!r) {
      outcomes.set(row.index, "skipped");
      return;
    }
    outcomes.set(row.index, r.ok ? "ok" : "failed");
    if (!r.ok && r.error) errors.set(row.index, r.error);
  });

  return {
    ...draft,
    rows: draft.rows.map((row) => {
      const outcome = outcomes.get(row.index) ?? row.applied;
      if (outcome === "ok") return { ...row, applied: "ok", selected: false };
      if (outcome === "failed") {
        return { ...row, applied: "failed", selected: true, error: errors.get(row.index) };
      }
      return { ...row, applied: undefined, selected: row.selected };
    }),
  };
}

export function isSettled(draft: ReviewDraft): boolean {
  return draft.rows.every((r) => r.applied === "ok");
}
