import { generateObject } from "ai";
import { z } from "zod";
import { indexLine, listNotes } from "../core/knowledge";
import { readJournal } from "../core/journal";
import { listCharters } from "../core/store";
import type { KnowledgeNote, ProviderProfile, ProvidersFile } from "../core/types";
import { resolveModel } from "./providers";
import { buildProposal } from "./tools";
import type { Proposal, ProposalAction } from "./schemas";

export const candidateSchema = z.object({
  title: z.string().optional().default(""),
  summary: z.string(),
  body: z.string().optional().default(""),
  scope: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  source: z.string().optional().default(""),
});

export const distillSchema = z.object({
  candidates: z.array(candidateSchema).optional().default([]),
});

export type Candidate = z.infer<typeof candidateSchema>;

export class DistillError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DistillError";
  }
}

export function isStructuredProfile(profile: ProviderProfile): boolean {
  return profile.type !== "claude-subscription";
}

export function pickDistillProfile(
  providers: ProvidersFile,
  requestedId?: string,
): ProviderProfile {
  const { profiles } = providers;
  if (!profiles.length) {
    throw new DistillError("No provider profiles configured. Add one in Settings.");
  }
  if (requestedId) {
    const found = profiles.find((p) => p.id === requestedId);
    if (!found) throw new DistillError(`Unknown provider profile: ${requestedId}`);
    if (!isStructuredProfile(found)) {
      throw new DistillError(
        `${found.label} cannot be used for distillation — the Claude subscription path is chat-only. Pick an API profile.`,
      );
    }
    return found;
  }
  const preferred = profiles.find((p) => p.id === providers.default);
  if (preferred && isStructuredProfile(preferred)) return preferred;
  const fallback = profiles.find(isStructuredProfile);
  if (!fallback) {
    throw new DistillError(
      "Distillation needs an API provider profile (OpenRouter, DeepSeek or an OpenAI-compatible one). The Claude subscription path is chat-only.",
    );
  }
  return fallback;
}

function normaliseTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function deriveTitle(summary: string): string {
  const firstSentence = summary.trim().split(/(?<=[.!?])\s/)[0] ?? summary.trim();
  const base = firstSentence.replace(/[.!?]+$/, "").trim();
  if (base.length <= 60) return base;
  const cut = base.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
}

export function dedupeCandidates(
  candidates: Candidate[],
  existing: KnowledgeNote[],
): Candidate[] {
  const taken = new Set(existing.map((n) => normaliseTitle(n.title)));
  const out: Candidate[] = [];
  for (const c of candidates) {
    const summary = c.summary.trim();
    if (!summary) continue;
    const title = c.title.trim() || deriveTitle(summary);
    const key = normaliseTitle(title);
    if (!key || taken.has(key)) continue;
    taken.add(key);
    out.push({ ...c, title });
  }
  return out;
}

export function candidateToAction(c: Candidate): ProposalAction {
  const action: ProposalAction = {
    kind: "add_note",
    title: c.title.trim(),
    summary: c.summary.trim(),
  };
  const body = c.body.trim();
  if (body) action.body = body;
  const scope = c.scope.map((s) => s.trim()).filter(Boolean);
  if (scope.length) action.scope = scope;
  const tags = c.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (tags.length) action.tags = tags;
  const source = c.source.trim();
  if (source) action.source = source;
  return action;
}

export function distillPrompt(input: {
  journalDigest: string;
  indexLines: string[];
  scopeKeys: string[];
  days: number;
}): string {
  const known = input.indexLines.length ? input.indexLines.join("\n") : "(nothing filed yet)";
  const scopes = input.scopeKeys.length ? input.scopeKeys.join(", ") : "(none)";
  return [
    `Here is the owner's journal for the last ${input.days} days:`,
    "",
    input.journalDigest || "(no entries)",
    "",
    "Notes already filed in the knowledge base:",
    "",
    known,
    "",
    `Valid scope values: ${scopes}`,
    "",
    "Propose knowledge notes worth keeping. Rules:",
    "- Only propose something a future reader could not re-derive from the task list. A durable conclusion, decision, constraint, or lesson.",
    "- Never propose a note that restates an activity ('finished T-004'). Activity is already in the journal.",
    "- Never duplicate or lightly reword a note already filed above.",
    "- summary must be one line stating the conclusion, not the topic. It is the only text loaded into context until someone searches.",
    "- body is the reasoning and evidence, a short paragraph. Leave it empty only if the summary genuinely says everything.",
    "- scope must use only the valid values above. Use an empty list when a note belongs to nothing in particular.",
    "- tags are lowercase single words or hyphenated slugs.",
    "- source should say where it came from, e.g. 'journal 2026-08-27'.",
    "- Propose at most 5. Propose zero if the week genuinely holds no durable lesson — an empty list is the correct answer more often than not.",
    "",
    "Return JSON in exactly this shape, using every key on every candidate:",
    '{"candidates":[{"title":"short name for the note","summary":"one line conclusion","body":"reasoning and evidence","scope":["slug"],"tags":["tag"],"source":"journal YYYY-MM-DD"}]}',
    "Use an empty candidates array when there is nothing worth keeping.",
  ].join("\n");
}

export async function distillJournal(input: {
  providers: ProvidersFile;
  days?: number;
  profileId?: string;
}): Promise<Proposal | null> {
  const days = input.days && input.days > 0 ? input.days : 7;
  const profile = pickDistillProfile(input.providers, input.profileId);

  const [journal, notes, projects, areas] = await Promise.all([
    readJournal(days),
    listNotes(),
    listCharters("project"),
    listCharters("area"),
  ]);

  const journalDigest = journal
    .map(
      (d) =>
        `## ${d.date}\n` +
        d.entries
          .filter((e) => !e.scope.startsWith("agent:"))
          .map((e) => `- ${e.time} [${e.scope}] ${e.message}`)
          .join("\n"),
    )
    .filter((block) => block.includes("\n- "))
    .join("\n\n");

  if (!journalDigest) return null;

  const scopeKeys = [
    ...projects.map((p) => p.id),
    ...areas.map((a) => `area:${a.id}`),
  ];

  const { model, providerOptions } = resolveModel(profile);

  let candidates: Candidate[];
  try {
    const { object } = await generateObject({
      model,
      schema: distillSchema,
      system:
        "You distill a personal planner's journal into durable knowledge notes. You are strict: most weeks yield one or two notes, often none. You never invent facts that are not in the journal. Answer with JSON matching the requested schema and nothing else.",
      prompt: distillPrompt({ journalDigest, indexLines: notes.map(indexLine), scopeKeys, days }),
      ...(providerOptions ? { providerOptions } : {}),
    });
    candidates = object.candidates;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const raw =
      err && typeof err === "object" && "text" in err && typeof err.text === "string"
        ? ` Raw response: ${err.text.slice(0, 300)}`
        : "";
    throw new DistillError(`${profile.label} could not produce candidates: ${reason}.${raw}`);
  }

  const kept = dedupeCandidates(candidates, notes);
  if (!kept.length) return null;

  return buildProposal({
    title: `Distilled ${kept.length} note${kept.length === 1 ? "" : "s"} from the journal`,
    summary: `From ${days} days of journal, reviewed by ${profile.label}. Nothing is written until you accept.`,
    actions: kept.map(candidateToAction),
  });
}
