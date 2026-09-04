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

const NUMERIC_KEYS = new Set(["goal", "per", "servings", "lead"]);

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
      if (value.trim() === "" && !isRequired(row.kind, key)) delete next[key];
      else next[key] = value.trim() === "" || Number.isNaN(n) ? value : n;
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
const CLEARABLE = new Set(["waitsOn", "target", "note", "time", "action", "scope", "source", "repeat"]);

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
const REPEATS = ["yearly", "monthly", "weekly"] as const;
const MAPS = ["system", "tasks"] as const;
const RELATIONS = ["requires", "triggers", "rel"] as const;

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
    { key: "description", label: "Description", type: "textarea", required: false },
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
    { key: "reason", label: "Why split", type: "textarea", required: false },
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
    { key: "repeat", label: "Repeats", type: "select", options: REPEATS, required: false },
    { key: "lead", label: "Lead days", type: "number", required: false, placeholder: "21" },
  ],
  update_event: [
    { key: "id", label: "Event", type: "text", required: true },
    { key: "date", label: "Date", type: "date", required: false },
    { key: "title", label: "Title", type: "text", required: false },
    { key: "time", label: "Time", type: "text", required: false },
    { key: "note", label: "Note", type: "text", required: false },
    { key: "scope", label: "Scope", type: "text", required: false },
    { key: "action", label: "Needs doing first", type: "text", required: false },
    { key: "repeat", label: "Repeats", type: "select", options: REPEATS, required: false },
    { key: "lead", label: "Lead days", type: "number", required: false },
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
  /**
   * `project` is optional here and nowhere else: an arrow with no charter is
   * one on the global knowledge board. Leave Map blank and it means the
   * charter's component map, which is what an agent almost always intends.
   */
  connect_cards: [
    { key: "project", label: "Charter", type: "text", required: false, placeholder: "acme-app" },
    { key: "map", label: "Map", type: "select", options: MAPS, required: false },
    { key: "from", label: "From", type: "text", required: true, placeholder: "K-001" },
    { key: "to", label: "To", type: "text", required: true, placeholder: "K-002" },
    { key: "relation", label: "Relation", type: "select", options: RELATIONS, required: false },
    { key: "label", label: "Label", type: "text", required: false },
  ],
  disconnect_cards: [
    { key: "project", label: "Charter", type: "text", required: false, placeholder: "acme-app" },
    { key: "map", label: "Map", type: "select", options: MAPS, required: false },
    { key: "from", label: "From", type: "text", required: true, placeholder: "K-001" },
    { key: "to", label: "To", type: "text", required: true, placeholder: "K-002" },
    { key: "relation", label: "Relation", type: "select", options: RELATIONS, required: false },
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
  /**
   * These two are the only rows where editing before Accept is not a
   * convenience but the whole point: no tool anywhere can edit a charter once
   * it exists, so this modal is the last moment a Why or an MVP scope can be
   * changed without hand-editing markdown.
   */
  create_project: [
    { key: "name", label: "Project", type: "text", required: true },
    {
      key: "why",
      label: "Why",
      type: "textarea",
      required: true,
      placeholder: "Why this exists, and what changes when it is done",
    },
    {
      key: "mvp",
      label: "MVP scope",
      type: "textarea",
      required: true,
      placeholder: "The smallest version worth having",
    },
  ],
  create_area: [
    { key: "name", label: "Area", type: "text", required: true },
    {
      key: "why",
      label: "Why",
      type: "textarea",
      required: true,
      placeholder: "What this area of life is for",
    },
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
/** Mirrors REF_RE in lib/core/canvas.ts — a client cannot import it, that module reaches simple-git. */
const CARD_REF = /^(K-\d{3,}|T-\d+(\.\d+)*|G-\d{3,}|group:[a-z0-9][a-z0-9-]*)$/i;

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
  if (action.kind === "connect_cards" || action.kind === "disconnect_cards") {
    shape("from", CARD_REF, "A card ref looks like K-001, T-007 or G-001");
    shape("to", CARD_REF, "A card ref looks like K-001, T-007 or G-001");
    if (action.from !== "" && action.from === action.to) {
      issues.push({ key: "to", message: "A card cannot point at itself" });
    }
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

/* ------------------------------------------------------------ ask for changes */

export interface RevisePayloadDraft {
  instruction: string;
  proposalId: string;
  title: string;
  actions: ProposalAction[];
  dropped: number;
}

/**
 * What goes to the model: the rows still ticked, carrying the user's edits.
 *
 * Deselected rows are deliberately left out. Sending them would have the model
 * re-propose the row the user just removed, on every round — the single most
 * irritating thing this feature could do. Edits go along, because the
 * alternative is silently discarding text the user typed.
 */
export function buildRevisePayload(
  draft: ReviewDraft,
  instruction: string,
): RevisePayloadDraft | null {
  const actions = selectedActions(draft);
  if (actions.length === 0 || instruction.trim().length === 0) return null;
  const dropped = draft.rows.filter((r) => !r.selected && r.applied !== "ok").length;
  return {
    instruction: instruction.trim(),
    proposalId: draft.proposalId,
    title: draft.title,
    actions,
    dropped,
  };
}

/** The bubble in the transcript: the instruction, plus what actually left. */
export function reviseBubbleText(payload: RevisePayloadDraft): string {
  const n = payload.actions.length;
  const kept = `revising ${n} change${n === 1 ? "" : "s"}`;
  const dropped = payload.dropped > 0 ? `, ${payload.dropped} dropped` : "";
  return `${payload.instruction}\n\n(${kept}${dropped})`;
}

export interface ReviseOrigin {
  sessionId: string;
  lineageId: string;
  toolCallId: string;
  /** The last message present when the revise was sent. */
  afterMessageId: string | null;
  sentAt: number;
}

export interface SuccessorMessage {
  id: string;
  role: string;
  parts: readonly { type: string; toolName?: string; toolCallId?: string; state?: string }[];
}

function isProposalPart(part: {
  type: string;
  toolName?: string;
  state?: string;
}): boolean {
  const raw = part.toolName ?? part.type.replace(/^tool-/, "");
  return raw.replace(/^mcp__planner__/, "") === "propose_changes";
}

/**
 * Which card replaces the one the user was reviewing.
 *
 * Tracked positionally rather than by asking the model to echo an id: the
 * proposalId is minted server-side in buildProposal, so the model never sees
 * it, and a supersedes field it had to populate would be dropped often enough
 * to leave two live cards offering the same writes.
 *
 * Resolves only once the turn has settled, and to the *last* proposal of it —
 * stepCountIs(6) permits more than one, and picking the first would leave a
 * live second card the user could apply on top.
 */
export function findSuccessor(
  messages: readonly SuccessorMessage[],
  origin: ReviseOrigin,
  settled: boolean,
): { toolCallId: string } | null {
  if (!settled) return null;

  const start = origin.afterMessageId
    ? messages.findIndex((m) => m.id === origin.afterMessageId) + 1
    : 0;
  if (start <= 0 && origin.afterMessageId) return null;

  let found: string | null = null;
  let seenAssistant = false;
  for (const message of messages.slice(start)) {
    // Only the turn that answered *this* revise counts. Without stopping at the
    // next user message, an early revise in a long conversation would claim the
    // card produced by a later one.
    if (message.role === "user" && seenAssistant) break;
    if (message.role !== "assistant") continue;
    seenAssistant = true;
    for (const part of message.parts) {
      if (!isProposalPart(part)) continue;
      if (part.state !== "output-available") continue;
      if (part.toolCallId && part.toolCallId !== origin.toolCallId) found = part.toolCallId;
    }
  }
  return found ? { toolCallId: found } : null;
}

export interface LineageState {
  /** Card key → the key of the card that replaced it. */
  supersededBy: Record<string, string>;
  /** Card key → the lineage it belongs to, inherited across revisions. */
  lineageOf: Record<string, string>;
  /** A revision still in flight, if any. */
  pending: ReviseOrigin | null;
  /** A revision that settled without producing a new batch. */
  unanswered: ReviseOrigin | null;
}

/**
 * The whole supersede chain, derived from the transcript rather than stored.
 *
 * Deriving it matters beyond tidiness: the successor of a revise is a pure
 * function of the messages and the origin, so keeping it in state would mean
 * writing state from an effect that watches the stream — which this repo's
 * React Compiler lint rejects, and rightly, since it cascades renders.
 */
export function resolveLineage(
  origins: readonly ReviseOrigin[],
  messages: readonly SuccessorMessage[],
  busy: boolean,
  sessionId: string,
): LineageState {
  const supersededBy: Record<string, string> = {};
  const lineageOf: Record<string, string> = {};
  let pending: ReviseOrigin | null = null;
  let unanswered: ReviseOrigin | null = null;

  for (const origin of origins) {
    // A session switch does not abort the stream, so an origin from another
    // conversation must simply stop counting rather than resolve wrongly.
    if (origin.sessionId !== sessionId) continue;

    const settled = !busy || origins.indexOf(origin) < origins.length - 1;
    const successor = findSuccessor(messages, origin, settled);
    if (successor) {
      supersededBy[origin.toolCallId] = successor.toolCallId;
      lineageOf[successor.toolCallId] = origin.lineageId;
      continue;
    }
    if (busy) pending = origin;
    else unanswered = origin;
  }

  return { supersededBy, lineageOf, pending, unanswered };
}

/** Follows a card key through however many revisions replaced it. */
export function latestOf(key: string, supersededBy: Readonly<Record<string, string>>): string {
  const seen = new Set<string>();
  let current = key;
  while (supersededBy[current] && !seen.has(current)) {
    seen.add(current);
    current = supersededBy[current];
  }
  return current;
}

/**
 * Once any card in a lineage has been applied, its predecessors and successors
 * are stale — applying one of those too would run every action a second time,
 * and addTask mints a fresh id each call, so there is no collision to stop it.
 */
export function staleKeys(
  drafts: Readonly<Record<string, ReviewDraft>>,
  appliedKeys: readonly string[],
): string[] {
  const lineages = new Set(
    appliedKeys.map((k) => drafts[k]?.lineageId).filter((v): v is string => Boolean(v)),
  );
  return Object.entries(drafts)
    .filter(([key, d]) => lineages.has(d.lineageId) && !appliedKeys.includes(key))
    .map(([key]) => key);
}
