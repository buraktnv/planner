import { isChatMode, type ChatMode } from "@/lib/ai/modes";

/**
 * Chat conversations, kept across page loads.
 *
 * They live in `localStorage`, not the data repo, for the same reason the
 * canvas tab order does: a transcript is a per-browser convenience, it changes
 * on every keystroke of a reply, and committing one would bury the journal
 * under noise no other machine can use. The rail said "conversations live in
 * this browser session" and meant it — a reload lost everything, including the
 * proposal cards you had not accepted yet.
 *
 * Parsing here is **total**: it never throws. This file is machine-written,
 * shared between tabs, and only holds convenience state, so a value it cannot
 * read is a value to drop rather than a reason to take down the rail on load.
 */

export const CHAT_SESSIONS_KEY = "planner.chat.sessions";

/** Beyond this the list is unusable anyway, and storage is not free. */
export const MAX_STORED_SESSIONS = 20;

/**
 * localStorage is typically ~5 MB per origin and the app keeps other keys in
 * it. A transcript carrying a few proposal cards is easily tens of kilobytes,
 * so the budget is enforced by measuring the real serialised bytes rather than
 * by guessing a message count.
 */
export const MAX_STORED_BYTES = 900_000;

export interface StoredSession {
  id: string;
  title: string;
  mode: ChatMode | null;
  messages: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSession(value: unknown): StoredSession | null {
  if (!isRecord(value)) return null;
  const { id, title, mode, messages } = value;
  if (typeof id !== "string" || id.length === 0) return null;
  if (!Array.isArray(messages)) return null;
  return {
    id,
    title: typeof title === "string" && title.length > 0 ? title : "Conversation",
    mode: isChatMode(mode) ? mode : null,
    messages,
  };
}

function bytesOf(value: string): number {
  // Not Buffer: this runs in the browser too.
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : 3;
  }
  return bytes;
}

/**
 * Sessions are newest first, so the budget is spent from the front and whatever
 * does not fit is dropped from the back — the oldest conversation is the one
 * you are least likely to want back.
 */
export function packSessions(sessions: readonly StoredSession[]): string {
  // An empty conversation is not history. Without this, every reload would add
  // a blank "New conversation" to the list for ever.
  let kept = sessions.filter((s) => s.messages.length > 0).slice(0, MAX_STORED_SESSIONS);

  let json = JSON.stringify(kept);
  while (kept.length > 1 && bytesOf(json) > MAX_STORED_BYTES) {
    kept = kept.slice(0, -1);
    json = JSON.stringify(kept);
  }

  // One conversation that is on its own too large to store: keep the record of
  // it, drop the transcript, rather than storing nothing at all.
  if (kept.length === 1 && bytesOf(json) > MAX_STORED_BYTES) {
    json = JSON.stringify([{ ...kept[0], messages: [] }]);
  }

  return json;
}

export function unpackSessions(raw: string | null | undefined): StoredSession[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: StoredSession[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    const session = readSession(entry);
    if (!session || seen.has(session.id)) continue;
    seen.add(session.id);
    out.push(session);
    if (out.length >= MAX_STORED_SESSIONS) break;
  }
  return out;
}

/**
 * What to write, or null to leave storage alone.
 *
 * The rule that matters: **an empty result is never written.** On the first
 * client render `useStored` still reports the server snapshot, so the save
 * that runs on mount sees no history at all — writing then would wipe the
 * stored conversations a moment before they are read back. Since nothing in the
 * UI deletes a conversation, an empty pack can only ever destroy history, never
 * express an intent to clear it.
 */
export function nextStoredValue(
  live: readonly StoredSession[],
  restored: readonly StoredSession[],
): string | null {
  const packed = packSessions(mergeSessions(live, restored));
  return packed === "[]" ? null : packed;
}

/**
 * What the conversation list shows: the sessions this page load created, then
 * the stored ones it has not adopted yet. Keyed by id, so a stored session that
 * has been reopened appears once, in its live position.
 */
export function mergeSessions(
  live: readonly StoredSession[],
  restored: readonly StoredSession[],
): StoredSession[] {
  const ids = new Set(live.map((s) => s.id));
  return [...live, ...restored.filter((s) => !ids.has(s.id))];
}
