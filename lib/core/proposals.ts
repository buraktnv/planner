import fs from "node:fs/promises";
import path from "node:path";
import { proposalsDir } from "./paths";
import { appendJournal } from "./journal";
import { commitData } from "./git";
import { withDataLock } from "./locks";

/**
 * Pending change-proposals, on disk.
 *
 * This exists because `propose_changes` built a preview and stored it nowhere,
 * so a proposal made by the MCP server — a *separate OS process* — could never
 * be accepted: the only Accept button lived in a chat transcript held in that
 * browser's `localStorage`.
 *
 * In-memory would not do. `lib/ai/pending.ts` keeps the journal-distillation
 * queue in a module-level singleton, which works only because that queue is
 * filled and drained inside the one Next process. The MCP server shares nothing
 * with the web app but the filesystem lock and the data repo, so the inbox has
 * to live in the data repo too.
 *
 * The file is machine-written and read by two processes, so the parser here is
 * **total** in the manner of `parseCanvas` and unlike `parseTasks`: a malformed
 * proposal must never take down the page that lists it.
 */

export type ProposalStatus = "pending" | "applying" | "applied" | "partial" | "discarded";

const STATUSES: ProposalStatus[] = ["pending", "applying", "applied", "partial", "discarded"];

/**
 * `buildProposal` mints `p-<base36 time>-<base36 random>`. Validated before it
 * is ever interpolated into a path, following `assertTaskId`: the id arrives
 * from a long-lived agent process and is whatever that agent passed.
 */
const PROPOSAL_ID = /^p-[a-z0-9]{1,20}-[a-z0-9]{1,20}$/;

export function proposalIdOk(id: unknown): id is string {
  return typeof id === "string" && PROPOSAL_ID.test(id);
}

export function assertProposalId(id: string): string {
  if (!proposalIdOk(id)) throw new Error(`Invalid proposal id: ${String(id)}`);
  return id;
}

export interface StoredProposal {
  id: string;
  status: ProposalStatus;
  title: string;
  summary?: string;
  agent: string;
  created: string;
  applied?: string;
  /** Free-text outcome, e.g. "12 of 14 applied, stopped at row 13". */
  outcome?: string;
  /**
   * The actions, re-validated on read. A line that no longer parses is dropped
   * from here and counted in `dropped` — never silently treated as valid, and
   * never thrown, because one bad line must not hide the other twelve.
   */
  actions: unknown[];
  dropped: number;
  /** Anything the file carried that this build does not understand. */
  unknown: string[];
}

function esc(v: string): string {
  return JSON.stringify(v);
}

export function serializeProposal(p: StoredProposal): string {
  const rows = [
    `id: ${p.id}`,
    `status: ${p.status}`,
    `title: ${esc(p.title)}`,
    ...(p.summary ? [`summary: ${esc(p.summary)}`] : []),
    `agent: ${esc(p.agent)}`,
    `created: ${p.created}`,
    ...(p.applied ? [`applied: ${p.applied}`] : []),
    ...(p.outcome ? [`outcome: ${esc(p.outcome)}`] : []),
  ];
  const body = [
    "```jsonl",
    // One action per line: a torn write costs the line it cut, not the batch.
    ...p.actions.map((a) => JSON.stringify(a)),
    "```",
  ];
  const tail = p.unknown.length ? ["", ...p.unknown] : [];
  return `---\n${rows.join("\n")}\n---\n\n${body.join("\n")}\n${tail.join("\n")}`.trimEnd() + "\n";
}

function readValue(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(t);
      if (typeof parsed === "string") return parsed;
    } catch {
      // A hand-edited quote that no longer parses: fall through to the raw text
      // rather than losing the value.
    }
  }
  return t;
}

/**
 * Never throws. Deliberately hand-rolled rather than reaching for `gray-matter`
 * the way `parseNote` does: that parser *throws on an unknown key* on purpose,
 * which is the opposite instinct from what this file needs.
 */
export function parseProposalFile(raw: string, fallbackId: string): StoredProposal {
  const out: StoredProposal = {
    id: fallbackId,
    status: "pending",
    title: "Untitled proposal",
    agent: "agent",
    created: "",
    actions: [],
    dropped: 0,
    unknown: [],
  };
  if (typeof raw !== "string" || raw.trim() === "") return out;

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  if (lines[0]?.trim() === "---") {
    i = 1;
    for (; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        i++;
        break;
      }
      const line = lines[i];
      const at = line.indexOf(":");
      if (at <= 0) continue;
      const key = line.slice(0, at).trim();
      const value = readValue(line.slice(at + 1));
      if (key === "id") {
        if (proposalIdOk(value)) out.id = value;
      } else if (key === "status") {
        // An unrecognised status reads as pending: better to offer it again than
        // to hide it in a state nothing can act on.
        out.status = (STATUSES as string[]).includes(value)
          ? (value as ProposalStatus)
          : "pending";
      } else if (key === "title") out.title = value || out.title;
      else if (key === "summary") out.summary = value || undefined;
      else if (key === "agent") out.agent = value || out.agent;
      else if (key === "created") out.created = value;
      else if (key === "applied") out.applied = value || undefined;
      else if (key === "outcome") out.outcome = value || undefined;
      // Unknown keys are ignored, not fatal.
    }
  }

  let inFence = false;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!inFence && trimmed.startsWith("```")) {
      inFence = true;
      continue;
    }
    if (inFence && trimmed.startsWith("```")) {
      inFence = false;
      continue;
    }
    if (!inFence) {
      if (trimmed !== "") out.unknown.push(line);
      continue;
    }
    if (trimmed === "") continue;
    // JSON.parse throws SyntaxError; a schema safeParse never would. Guarding
    // only the schema is the easy mistake, so this catch is its own.
    try {
      out.actions.push(JSON.parse(trimmed));
    } catch {
      out.dropped += 1;
    }
  }

  return out;
}

function filePath(id: string): string {
  return path.join(proposalsDir(), `${assertProposalId(id)}.md`);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

async function readRaw(id: string): Promise<StoredProposal | null> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath(id), "utf8");
  } catch {
    return null;
  }
  return parseProposalFile(raw, id);
}

export async function getProposal(id: string): Promise<StoredProposal | null> {
  if (!proposalIdOk(id)) return null;
  return readRaw(id);
}

export async function listProposals(status?: ProposalStatus): Promise<StoredProposal[]> {
  let files: string[];
  try {
    files = await fs.readdir(proposalsDir());
  } catch {
    return [];
  }
  const out: StoredProposal[] = [];
  for (const f of files) {
    if (!f.endsWith(".md")) continue;
    const id = f.slice(0, -3);
    if (!proposalIdOk(id)) continue;
    const p = await readRaw(id);
    if (!p) continue;
    if (status && p.status !== status) continue;
    out.push(p);
  }
  // Newest first: the id's first segment is a base36 timestamp.
  return out.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
}

/**
 * Writes the proposal. Follows `canvas.ts`'s `mutate()`: lock, then read, then
 * write, then journal, then commit. `appendJournal` and `commitData` do not take
 * the lock themselves — the caller must hold it.
 */
export async function fileProposal(
  input: { proposalId: string; title: string; summary?: string; actions: unknown[] },
  agent: string,
): Promise<StoredProposal> {
  assertProposalId(input.proposalId);
  return withDataLock(async () => {
    const existing = await readRaw(input.proposalId);
    if (existing) return existing;
    const p: StoredProposal = {
      id: input.proposalId,
      status: "pending",
      title: input.title || "Untitled proposal",
      summary: input.summary,
      agent: agent || "agent",
      created: stamp(),
      actions: input.actions,
      dropped: 0,
      unknown: [],
    };
    await fs.mkdir(proposalsDir(), { recursive: true });
    await fs.writeFile(filePath(p.id), serializeProposal(p), "utf8");
    await appendJournal(`agent:${p.agent}`, `proposed ${p.id}: ${p.title}`);
    await commitData(`proposal filed: ${p.id} (${p.agent})`);
    return p;
  });
}

/**
 * Flip `pending → applying`, refusing if it is anything else.
 *
 * This is what stops two readers of the same URL both applying the batch. It
 * has to happen BEFORE the actions run: marking the outcome afterwards leaves
 * exactly the window open where a second request slips through, and nothing in
 * the write path is idempotent — `addTask` mints a fresh id every call, so a
 * double apply produces duplicates rather than an error.
 */
export async function claimProposal(
  id: string,
): Promise<{ ok: true; proposal: StoredProposal } | { ok: false; reason: string }> {
  if (!proposalIdOk(id)) return { ok: false, reason: "Invalid proposal id" };
  return withDataLock(async () => {
    const p = await readRaw(id);
    if (!p) return { ok: false as const, reason: "Proposal not found" };
    if (p.status !== "pending") {
      return { ok: false as const, reason: `Proposal is already ${p.status}` };
    }
    const next: StoredProposal = { ...p, status: "applying" };
    await fs.writeFile(filePath(id), serializeProposal(next), "utf8");
    await appendJournal(`agent:${p.agent}`, `applying ${id}`);
    await commitData(`proposal applying: ${id}`);
    return { ok: true as const, proposal: next };
  });
}

export async function recordOutcome(
  id: string,
  status: Exclude<ProposalStatus, "pending" | "applying">,
  outcome?: string,
): Promise<void> {
  if (!proposalIdOk(id)) return;
  await withDataLock(async () => {
    const p = await readRaw(id);
    if (!p) return;
    const next: StoredProposal = {
      ...p,
      status,
      applied: status === "discarded" ? p.applied : stamp(),
      outcome,
    };
    await fs.writeFile(filePath(id), serializeProposal(next), "utf8");
    await appendJournal(`agent:${p.agent}`, `${status} ${id}${outcome ? `: ${outcome}` : ""}`);
    await commitData(`proposal ${status}: ${id}`);
  });
}

/** Releases a claim when applying could not even be attempted. */
export async function releaseProposal(id: string): Promise<void> {
  if (!proposalIdOk(id)) return;
  await withDataLock(async () => {
    const p = await readRaw(id);
    if (!p || p.status !== "applying") return;
    await fs.writeFile(filePath(id), serializeProposal({ ...p, status: "pending" }), "utf8");
  });
}
