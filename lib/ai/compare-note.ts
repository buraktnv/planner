import { generateObject } from "ai";
import { z } from "zod";
import { getNote, updateNote } from "../core/knowledge";
import { splitAiSection } from "../core/note-sections";
import type { ProvidersFile } from "../core/types";
import { DistillError, pickDistillProfile } from "./distill";
import { resolveModel } from "./providers";
import { toolImpls } from "./tools";
import type { Proposal, ProposalAction } from "./schemas";

/**
 * Does the one-line summary still say what the note says, and does the
 * section written for the assistant cover what the body now covers?
 *
 * The answer is a proposal, never a write. It is filed through
 * `propose_changes` so it lands on /proposals as well as on the note page: a
 * card the owner closes without deciding is still waiting there, and Accept
 * goes through the same claiming route as every other proposal.
 */
export const compareSchema = z.object({
  summaryStillTrue: z.boolean().optional().default(true),
  verdict: z.string().optional().default(""),
  summary: z.string().optional().default(""),
  forAi: z.string().optional().default(""),
});

export type CompareResult = z.infer<typeof compareSchema>;

export interface CompareOutcome {
  verdict: string;
  summaryStillTrue: boolean;
  proposal: Proposal | null;
}

export function comparePrompt(input: {
  id: string;
  title: string;
  summary: string;
  human: string;
  forAi: string | null;
}): string {
  return [
    `Knowledge note ${input.id}: ${input.title}`,
    "",
    "SUMMARY (one line; the only text the assistant sees until it reads the note):",
    input.summary,
    "",
    "BODY (written for the owner to read):",
    input.human || "(empty)",
    "",
    "FOR THE AI (written for the assistant; loaded when the note is mentioned or read):",
    input.forAi || "(nothing written yet)",
    "",
    "Judge the summary and the FOR THE AI section against the body. Rules:",
    "- summaryStillTrue is false only if the body now contradicts the summary or the summary names a conclusion the body no longer supports. A summary that is merely incomplete is still true.",
    "- verdict is two or three sentences, plain, naming what is missing or wrong. Say 'Nothing to change.' when both hold up.",
    "- summary: a rewritten one-line claim ONLY if the current one is untrue or names the topic instead of the conclusion. Otherwise return an empty string. Never a newline, never ' | '.",
    "- forAi: a rewritten FOR THE AI section ONLY if the body says something the assistant needs that the section does not — a constraint, a decision, a thing not to propose again. Terse markdown, facts first, at most ten lines. Return an empty string if the current section is adequate. Never restate the whole body.",
    "",
    "Return JSON in exactly this shape:",
    '{"summaryStillTrue":true,"verdict":"…","summary":"","forAi":""}',
  ].join("\n");
}

function oneLine(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\n") || trimmed.includes(" | ")) return null;
  return trimmed;
}

/**
 * One `update_note` carrying only what actually changed, or null when the
 * model returned nothing new. A proposed summary that could not be written —
 * a newline, the index delimiter — is dropped here rather than failing later
 * at the writer, after the owner has already pressed Accept.
 */
export type UpdateNoteAction = Extract<ProposalAction, { kind: "update_note" }>;

export function compareToActions(
  result: CompareResult,
  current: { id: string; summary: string; forAi: string | null },
): UpdateNoteAction | null {
  const action: UpdateNoteAction = { kind: "update_note", id: current.id };
  const summary = oneLine(result.summary ?? "");
  if (summary && summary !== current.summary.trim()) action.summary = summary;
  const forAi = (result.forAi ?? "").trim();
  if (forAi && forAi !== (current.forAi ?? "").trim()) action.forAi = forAi;
  if (action.summary === undefined && action.forAi === undefined) return null;
  // The section was read against the body and found adequate: accepting the
  // card should also clear the unchecked flag, not leave it for a second pass.
  if (action.forAi === undefined && current.forAi !== null) action.confirmAi = true;
  return action;
}

export async function compareNote(input: {
  id: string;
  providers: ProvidersFile;
  profileId?: string;
}): Promise<CompareOutcome> {
  const profile = pickDistillProfile(input.providers, input.profileId);
  const note = await getNote(input.id);
  const { human, forAi } = splitAiSection(note.body);
  const { model, providerOptions } = resolveModel(profile);

  let result: CompareResult;
  try {
    const { object } = await generateObject({
      model,
      schema: compareSchema,
      system:
        "You audit one knowledge note in a personal planner. You are strict and terse. You never invent facts that are not in the body. Answer with JSON matching the requested schema and nothing else.",
      prompt: comparePrompt({ id: note.id, title: note.title, summary: note.summary, human, forAi }),
      ...(providerOptions ? { providerOptions } : {}),
    });
    result = object;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new DistillError(`${profile.label} could not compare the note: ${reason}.`);
  }

  const action = compareToActions(result, { id: note.id, summary: note.summary, forAi });
  const verdict = result.verdict.trim();
  if (!action) {
    // Nothing to change is still a check that happened; recording it needs no
    // review, and leaving the note flagged after a clean compare would be odd.
    if (forAi !== null) await updateNote(note.id, { confirmAi: true });
    return { verdict, summaryStillTrue: result.summaryStillTrue, proposal: null };
  }

  const changed = [action.summary !== undefined ? "summary" : null, action.forAi !== undefined ? "For the AI section" : null]
    .filter(Boolean)
    .join(" and ");
  const proposal = await toolImpls.proposeChanges({
    title: `Compare ${note.id}: rewrite the ${changed}`,
    summary: verdict || `${profile.label} suggests a new ${changed} for ${note.title}.`,
    actions: [action],
  });
  return { verdict, summaryStillTrue: result.summaryStillTrue, proposal };
}
