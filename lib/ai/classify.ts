import { generateObject } from "ai";
import { z } from "zod";
import { listCharters, createCharter, slugify } from "../core/store";
import { tokenize } from "../core/knowledge";
import { appendJournal, readJournal } from "../core/journal";
import { getProviders } from "../core/providers";
import type { Charter, ProvidersFile } from "../core/types";
import { resolveModel } from "./providers";
import { pickDistillProfile } from "./distill";

export interface ScopeCandidate {
  key: string;
  name: string;
  type: "project" | "area";
  slug: string;
}

export type ClassifyMethod = "explicit" | "literal" | "model" | "created" | "abstained";

export interface ClassifyResult {
  scope: string[];
  createdArea?: Charter;
  reason: string;
  method: ClassifyMethod;
}

const MIN_TEXT_TOKENS_FOR_NEW_AREA = 8;
const AUTO_AREA_BUDGET_DAYS = 7;
const AUTO_AREA_BUDGET = 1;
const AUTO_AREA_MARKER = "area auto-created";

export const NEVER_MINT = [
  "misc",
  "general",
  "personal",
  "other",
  "notes",
  "note",
  "life",
  "stuff",
  "random",
  "knowledge",
  "memory",
  "self",
  "me",
  "things",
  "various",
];

export function scopeKeyOf(charter: { type: "project" | "area"; id: string }): string {
  return charter.type === "area" ? `area:${charter.id}` : charter.id;
}

export function buildCandidates(charters: Charter[]): ScopeCandidate[] {
  return charters
    .filter((c) => c.status === "active" || c.status === "paused")
    .map((c) => ({ key: scopeKeyOf(c), name: c.name, type: c.type, slug: c.id }));
}

function phrases(candidate: ScopeCandidate): string[] {
  return [
    candidate.key.toLowerCase(),
    candidate.slug.toLowerCase(),
    candidate.slug.replace(/-/g, " ").toLowerCase(),
    candidate.name.toLowerCase(),
  ];
}

function containsPhrase(haystack: string, phrase: string): boolean {
  if (phrase.length < 3) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack);
}

export function literalScopeHit(text: string, candidates: ScopeCandidate[]): string | null {
  const haystack = text.toLowerCase();
  const hits = candidates.filter((c) => phrases(c).some((p) => containsPhrase(haystack, p)));
  const keys = [...new Set(hits.map((h) => h.key))];
  return keys.length === 1 ? keys[0] : null;
}

export function normaliseScope(raw: string, candidates: ScopeCandidate[]): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/^(area:)+/, "");
  for (const c of candidates) {
    if (
      trimmed === c.key.toLowerCase() ||
      stripped === c.slug.toLowerCase() ||
      trimmed === c.name.toLowerCase() ||
      stripped === c.name.toLowerCase()
    ) {
      return c.key;
    }
  }
  return null;
}

export function nearestExistingSlug(slug: string, existing: string[]): string | null {
  for (const e of existing) {
    if (e === slug) return e;
    if (e.startsWith(slug) || slug.startsWith(e)) return e;
    if (e.includes(slug) || slug.includes(e)) return e;
  }
  return null;
}

export function noteText(input: { title?: string; summary: string; body?: string }): string {
  return [input.title ?? "", input.summary, input.body ?? ""].join(" ").trim();
}

const choiceSchema = z.object({
  scope: z.string().optional().default(""),
  newAreaName: z.string().optional().default(""),
  newAreaWhy: z.string().optional().default(""),
  reason: z.string().optional().default(""),
});

export function classifyPrompt(text: string, candidates: ScopeCandidate[]): string {
  const list = candidates.length
    ? candidates.map((c) => `- ${c.key} — ${c.name}`).join("\n")
    : "(no scopes exist yet)";
  return [
    "A note is being filed in a personal knowledge base. Decide which subject it belongs to.",
    "",
    "The note:",
    text,
    "",
    "Existing scopes:",
    list,
    "",
    "Rules:",
    "- Pick exactly one existing scope key from the list when the note plainly belongs there. Copy the key exactly.",
    '- Only if it clearly belongs to a lasting subject no existing scope covers, leave scope empty and give newAreaName (one or two words, e.g. "Travel") plus a one-sentence newAreaWhy.',
    "- Never invent a scope key that is not in the list.",
    "- If it fits nothing and is not a lasting subject of its own, leave every field empty.",
    "",
    'Return JSON: {"scope":"","newAreaName":"","newAreaWhy":"","reason":"one short sentence"}',
  ].join("\n");
}

async function askModel(
  text: string,
  candidates: ScopeCandidate[],
  providers: ProvidersFile,
): Promise<z.infer<typeof choiceSchema> | null> {
  let profile;
  try {
    profile = pickDistillProfile(providers);
  } catch {
    return null;
  }
  try {
    const { model, providerOptions } = resolveModel(profile);
    const { object } = await generateObject({
      model,
      schema: choiceSchema,
      system:
        "You file notes into a small, stable set of life areas and projects. You strongly prefer an existing scope, and suggest a new area only for a subject that will recur. Answer with JSON and nothing else.",
      prompt: classifyPrompt(text, candidates),
      ...(providerOptions ? { providerOptions } : {}),
    });
    return object;
  } catch {
    return null;
  }
}

export function autoAreasCreatedRecently(
  journal: Array<{ entries: Array<{ message: string }> }>,
): number {
  let n = 0;
  for (const day of journal) {
    for (const e of day.entries) if (e.message.includes(AUTO_AREA_MARKER)) n++;
  }
  return n;
}

export async function classifyNote(
  input: { title?: string; summary: string; body?: string; scope?: string[] },
  opts: { allowCreate?: boolean } = {},
): Promise<ClassifyResult> {
  if (input.scope && input.scope.length) {
    return { scope: input.scope, reason: "scope supplied by caller", method: "explicit" };
  }

  const text = noteText(input);
  const charters = await listCharters();
  const candidates = buildCandidates(charters);

  const literal = literalScopeHit(text, candidates);
  if (literal) {
    return { scope: [literal], reason: `names ${literal} directly`, method: "literal" };
  }

  const providers = await getProviders();
  const choice = await askModel(text, candidates, providers);
  if (!choice) {
    return {
      scope: [],
      reason: "no literal match and no structured provider available",
      method: "abstained",
    };
  }

  const picked = normaliseScope(choice.scope, candidates);
  if (picked) {
    return { scope: [picked], reason: choice.reason || `model chose ${picked}`, method: "model" };
  }

  const wanted = choice.newAreaName.trim();
  if (!opts.allowCreate || !wanted) {
    return { scope: [], reason: choice.reason || "nothing fit", method: "abstained" };
  }

  const created = await createAreaGuarded(wanted, choice.newAreaWhy, text, charters);
  if (created) {
    return {
      scope: [scopeKeyOf(created)],
      createdArea: created,
      reason: choice.reason || `created area ${created.id}`,
      method: "created",
    };
  }

  const near = nearestExistingSlug(slugify(wanted), charters.map((c) => c.id));
  const fallback = near ? charters.find((c) => c.id === near) : undefined;
  if (fallback) {
    return {
      scope: [scopeKeyOf(fallback)],
      reason: `reused ${scopeKeyOf(fallback)} rather than minting a near-duplicate`,
      method: "model",
    };
  }
  return { scope: [], reason: "new area refused by guardrails", method: "abstained" };
}

export async function createAreaGuarded(
  name: string,
  why: string,
  text: string,
  charters: Charter[],
): Promise<Charter | null> {
  const slug = slugify(name);
  if (!slug || slug.length < 3) return null;
  if (NEVER_MINT.includes(slug)) return null;
  if (tokenize(text).length < MIN_TEXT_TOKENS_FOR_NEW_AREA) return null;
  if (nearestExistingSlug(slug, charters.map((c) => c.id))) return null;

  const recent = await readJournal(AUTO_AREA_BUDGET_DAYS);
  if (autoAreasCreatedRecently(recent) >= AUTO_AREA_BUDGET) return null;

  const reason = why.trim() || `Holds notes about ${name.trim()}.`;
  try {
    const charter = await createCharter({
      type: "area",
      name: name.trim(),
      why: `${reason}\n\nAuto-created while filing a note. Rename, merge or delete it if it is not a real life area.`,
      priority: 4,
    });
    await appendJournal(charter.id, `${AUTO_AREA_MARKER} while filing a note`);
    return charter;
  } catch {
    return null;
  }
}
