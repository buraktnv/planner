import { z } from "zod";
import { proposalActionSchema, toolNames, type ProposalAction, type ToolName } from "./schemas";

/**
 * Asking the model to change a batch it already proposed.
 *
 * The payload travels in the chat request *body*, not inside the user's message
 * text. A hidden marker in the message was the obvious design and is wrong:
 * the claude-subscription path flattens the whole conversation to text and
 * re-sends it every turn, so round three would carry rounds one and two's JSON
 * verbatim, for ever. It would also have gone into `recallQuery`, which feeds
 * the latest user message to knowledge search — so every revise would have
 * searched the notes for raw JSON.
 *
 * In the body it is sent once, is never persisted into the transcript, and each
 * revise carries a fresh snapshot of the current working copy. Rounds do not
 * compound, and round N never depends on the model remembering round N-1.
 */

export const MAX_REVISE_ACTIONS = 40;
export const MAX_REVISE_BYTES = 32_000;

export const revisePayloadSchema = z.object({
  instruction: z.string().min(1).max(4000),
  proposalId: z.string().max(120).optional(),
  title: z.string().max(300).optional(),
  actions: z.array(proposalActionSchema).min(1).max(MAX_REVISE_ACTIONS),
  /** How many rows the user removed, so the model is told not to re-add them. */
  dropped: z.number().int().min(0).max(500).optional(),
});

export type RevisePayload = z.infer<typeof revisePayloadSchema>;

export interface ReviseParseFailure {
  ok: false;
  error: string;
}

export type ReviseParseResult = { ok: true; payload: RevisePayload } | ReviseParseFailure;

/**
 * Validated before it is interpolated into a prompt, and capped by byte size as
 * well as row count — `decompose_task.subtasks[].plan` is free markdown and is
 * the one field that can blow the budget on its own.
 */
export function parseRevise(value: unknown): ReviseParseResult {
  if (value === undefined || value === null) return { ok: false, error: "No revise payload" };

  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return { ok: false, error: "Revise payload is not serialisable" };
  }
  if (bytes > MAX_REVISE_BYTES) {
    return { ok: false, error: `Revise payload is too large (${bytes} bytes)` };
  }

  const parsed = revisePayloadSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true, payload: parsed.data };
}

/** The eight kinds a proposal can carry — exactly the direct writes to withhold. */
const PROPOSAL_WRITE_TOOLS = new Set<string>([
  "create_task",
  "update_task",
  "decompose_task",
  "move_to_parking_lot",
  "create_event",
  "update_event",
  "add_note",
  "update_note",
  "create_habit",
  "create_rhythm",
  "create_meal",
]);

/**
 * Prompts leak, so the instruction is backed by removing the tools. On a revise
 * turn the model keeps every read tool and `propose_changes`, and loses the
 * direct writers — it cannot quietly apply the change instead of re-proposing
 * it, which is the failure the instruction alone would only discourage.
 */
export function toolNamesForRevise(all: readonly ToolName[] = toolNames): ToolName[] {
  return all.filter((name) => !PROPOSAL_WRITE_TOOLS.has(name));
}

function describeAction(action: ProposalAction): string {
  const a = action as unknown as Record<string, unknown>;
  const name = (a.title ?? a.name ?? a.idea ?? a.summary ?? a.id ?? "") as string;
  const flat = String(name).replace(/\s+/g, " ").trim();
  return `${action.kind}: ${flat.length > 90 ? `${flat.slice(0, 90)}…` : flat}`;
}

/**
 * A numbered human index above the JSON, so "the third one" and "drop the
 * review task" both resolve to a row. The JSON itself is canonical because the
 * model has to return a modified copy — describing the batch in prose invites
 * it to re-derive fields it should have carried through untouched.
 */
export function renderRevisePrompt(payload: RevisePayload): string {
  const lines = [
    "# Batch under revision",
    "",
    "Nothing below has been written. The user is reviewing this batch on a card",
    "and has asked for changes to it.",
    "",
  ];

  if (payload.title) lines.push(`Batch: ${payload.title}`, "");
  lines.push("Rows the user kept:");
  payload.actions.forEach((action, i) => lines.push(`${i + 1}. ${describeAction(action)}`));

  if (payload.dropped && payload.dropped > 0) {
    lines.push(
      "",
      `The user removed ${payload.dropped} row${payload.dropped === 1 ? "" : "s"} from this batch.`,
      "Do not re-add them. They are gone on purpose.",
    );
  }

  lines.push(
    "",
    "Some rows may carry the user's own edits. Treat the text below as what they",
    "want, not as your earlier draft.",
    "",
    "```json",
    JSON.stringify(payload.actions, null, 2),
    "```",
    "",
    "What they asked for:",
    payload.instruction.trim(),
    "",
    "Reply with exactly one propose_changes call carrying the COMPLETE corrected",
    "batch — every row above that they did not ask you to change, unmodified,",
    "alongside the ones you changed. Do not write anything directly.",
  );

  return lines.join("\n");
}
