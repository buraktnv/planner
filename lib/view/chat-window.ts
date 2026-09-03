import { partsOf, toolNameOf, toolStatus, toolSummary, type MessageLike } from "./chat-parts";

/**
 * What a turn actually sends. `useChat` keeps every message and so does
 * localStorage; this only shrinks the wire payload, on both provider paths at
 * once, because the subscription path re-sends the whole transcript as text
 * and had no other place to be trimmed. The digest is heuristic and
 * deterministic — no extra model call, identical everywhere — and carries the
 * ids the model would otherwise lose, which is the one thing it must not lose.
 */
export const WINDOW_KEEP_MESSAGES = 12;
export const WINDOW_CHAR_BUDGET = 24_000;
export const DIGEST_MAX_CHARS = 2_000;

const MIN_KEEP = 2;
const FIRST_MAX = 200;
const LAST_MAX = 300;

export interface WindowedTranscript<M extends MessageLike> {
  messages: M[];
  digest: string | null;
  dropped: number;
}

function sizeOf(value: unknown): number {
  if (typeof value === "string") return value.length;
  if (value === undefined || value === null) return 0;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

export function charsOf(message: MessageLike): number {
  let n = 0;
  for (const part of message.parts) {
    if (!part || typeof part !== "object") continue;
    const p = part as { text?: unknown; input?: unknown; output?: unknown };
    n += sizeOf(p.text) + sizeOf(p.input) + sizeOf(p.output);
  }
  return n;
}

export function windowMessages<M extends MessageLike>(
  messages: readonly M[],
  opts: { keep?: number; budget?: number } = {},
): WindowedTranscript<M> {
  const keep = opts.keep ?? WINDOW_KEEP_MESSAGES;
  const budget = opts.budget ?? WINDOW_CHAR_BUDGET;

  let cut = Math.max(0, messages.length - keep);
  let total = 0;
  for (let i = cut; i < messages.length; i += 1) total += charsOf(messages[i]);
  while (total > budget && messages.length - cut > MIN_KEEP) {
    total -= charsOf(messages[cut]);
    cut += 1;
  }

  // The first message sent must be the user's: a provider rejects a transcript
  // that opens with the assistant, and a tool call lives whole inside one
  // assistant message, so a cut on a message boundary never splits a call from
  // its result.
  let start = cut;
  while (start < messages.length && messages[start].role !== "user") start += 1;
  if (start >= messages.length) {
    const lastUser = messages.map((m) => m.role).lastIndexOf("user");
    start = lastUser >= 0 ? Math.min(lastUser, cut) : 0;
  }

  const kept = messages.slice(start);
  const dropped = messages.slice(0, start);
  return {
    messages: kept,
    digest: dropped.length ? digestOf(dropped) : null,
    dropped: dropped.length,
  };
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function digestOf(dropped: readonly MessageLike[], max = DIGEST_MAX_CHARS): string {
  let first: string | null = null;
  let last: string | null = null;
  const tools = new Map<string, { count: number; ids: string[] }>();

  for (const m of dropped) {
    let parts;
    try {
      parts = partsOf(m);
    } catch {
      continue;
    }
    if (m.role === "user" && first === null && parts.text.trim()) first = parts.text;
    if (m.role === "assistant" && parts.text.trim()) last = parts.text;
    for (const t of parts.tools) {
      if (toolStatus(t) !== "done") continue;
      const name = toolNameOf(t);
      const entry = tools.get(name) ?? { count: 0, ids: [] };
      entry.count += 1;
      const summary = toolSummary(t);
      if (summary) entry.ids.push(summary);
      tools.set(name, entry);
    }
  }

  const lines: string[] = [];
  if (first) lines.push(`Started with: ${clip(first, FIRST_MAX)}`);
  if (tools.size) {
    const used = [...tools.entries()].map(([name, { count, ids }]) => {
      const times = count > 1 ? ` ×${count}` : "";
      return ids.length ? `${name}${times} (${ids.join(", ")})` : `${name}${times}`;
    });
    lines.push(`Tools used: ${used.join(", ")}`);
  }
  if (last) lines.push(`Last covered: ${clip(last, LAST_MAX)}`);
  lines.push(`${dropped.length} earlier ${dropped.length === 1 ? "message" : "messages"} omitted.`);

  const text = lines.join("\n");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
