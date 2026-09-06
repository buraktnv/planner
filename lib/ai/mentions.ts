import { z } from "zod";
import { getNote } from "../core/knowledge";
import { splitAiSection } from "../core/note-sections";
import { getCharter, listTasks } from "../core/store";
import { readDetail } from "../core/details";
import { readComments } from "../core/comments";
import { rankOpenTasks } from "../core/next";
import type { Task } from "../core/types";
import { NOTE_ID, SLUG, TASK_ID, type Mention } from "../view/mentions";

/**
 * What the user pointed at, read and rendered into the prompt for this turn.
 *
 * Travels in the request body like `revise` and `digest`, never in the message
 * text: the subscription path re-sends the transcript as text every turn, so a
 * note body pasted into a message would be re-sent for ever, and `recallQuery`
 * would search the notes for it. Parsing is lenient the way `parseDigest` is —
 * a bad entry is dropped and the turn goes through, because losing a turn
 * over a malformed mention is worse than losing the mention.
 */

export const MENTION_MAX = 8;
export const MENTION_MAX_CHARS = 6_000;
export const MENTIONS_MAX_CHARS = 20_000;
const LOG_ENTRIES = 5;
const MENTION_TASK_CAP = 30;

const typeSchema = z.enum(["project", "area"]);
const mentionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), id: z.string().regex(NOTE_ID) }),
  z.object({
    kind: z.literal("task"),
    type: typeSchema,
    slug: z.string().regex(SLUG).max(80),
    id: z.string().regex(TASK_ID),
  }),
  z.object({ kind: z.literal("charter"), type: typeSchema, slug: z.string().regex(SLUG).max(80) }),
]);

export function parseMentions(value: unknown): Mention[] {
  if (!Array.isArray(value)) return [];
  const out: Mention[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const parsed = mentionSchema.safeParse(entry);
    if (!parsed.success) continue;
    const key = JSON.stringify(parsed.data);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed.data);
    if (out.length >= MENTION_MAX) break;
  }
  return out;
}

export interface ResolvedMention {
  label: string;
  text: string;
  found: boolean;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n(… cut at ${max} characters)` : text;
}

function taskLine(t: Task): string {
  const bits = [`${t.id} ${t.title}`, `size ${t.size}`, t.section];
  if (t.due) bits.push(`due ${t.due}`);
  if (t.est) bits.push(`est ${t.est}`);
  if (t.target) bits.push(`target ${t.target}`);
  if (t.note) bits.push(`component ${t.note}`);
  if (t.waitsOn) bits.push(`waits on ${t.waitsOn}`);
  if (t.done) bits.push(`done${t.doneDate ? ` ${t.doneDate}` : ""}`);
  return bits.join(" · ");
}

async function resolveOne(m: Mention): Promise<ResolvedMention> {
  if (m.kind === "note") {
    try {
      const note = await getNote(m.id);
      const { human, forAi } = splitAiSection(note.body);
      // The section written for the assistant is what a mention is for; the
      // body is the fallback, not the default.
      const rest = forAi ?? human;
      const text = [`Summary: ${note.summary}`, rest ? `\n${rest}` : ""].join("\n").trim();
      return { label: `${m.id} — ${note.title} (note)`, text, found: true };
    } catch {
      return { label: `${m.id} (note)`, text: `${m.id}: not found. Do not invent it.`, found: false };
    }
  }

  let charterName = m.slug;
  let tasks: Task[] = [];
  let charter;
  try {
    charter = await getCharter(m.type, m.slug);
    charterName = charter.name;
    tasks = await listTasks(m.type, m.slug);
  } catch {
    const label = m.kind === "task" ? `${m.id} in ${m.slug}` : `${m.slug} (${m.type})`;
    return { label, text: `${m.type} ${m.slug}: not found. Do not invent it.`, found: false };
  }

  if (m.kind === "charter") {
    const open = rankOpenTasks(tasks, charter).slice(0, MENTION_TASK_CAP);
    const lines = [
      `Status: ${charter.status} · priority ${charter.priority}${charter.mvp ? ` · MVP: ${charter.mvp}` : ""}`,
      "",
      "Why:",
      charter.why.trim() || "(none)",
    ];
    if (charter.mvpScope.length) lines.push("", "MVP scope:", ...charter.mvpScope.map((s) => `- ${s}`));
    lines.push(
      "",
      `Open tasks (${tasks.filter((t) => !t.done).length}):`,
      ...(open.length ? open.map((t) => `- ${taskLine(t)}`) : ["(none)"]),
    );
    return { label: `${charterName} (${m.type} ${m.slug})`, text: lines.join("\n"), found: true };
  }

  const task = tasks.find((t) => t.id === m.id);
  if (!task) {
    return {
      label: `${m.id} in ${charterName}`,
      text: `${m.id}: no such task in ${m.type} ${m.slug}. Do not invent it.`,
      found: false,
    };
  }
  const [detail, comments] = await Promise.all([
    readDetail(m.type, m.slug, m.id),
    readComments(m.type, m.slug, m.id),
  ]);
  const lines = [taskLine(task)];
  const subs = tasks.filter((t) => t.parentId === m.id);
  if (subs.length) lines.push("", "Subtasks:", ...subs.map((s) => `- ${taskLine(s)}`));
  lines.push("", "Description:", detail?.trim() || "(none written)");
  if (comments.length) {
    const shown = comments.slice(-LOG_ENTRIES);
    lines.push(
      "",
      `Log (${comments.length > shown.length ? `last ${shown.length} of ${comments.length}` : `${shown.length}`} entries, oldest first):`,
      ...shown.map((c) => `## ${c.date} ${c.time}\n${c.body.trim()}`),
    );
  }
  return { label: `${m.id} — ${task.title} (${charterName})`, text: lines.join("\n"), found: true };
}

export async function resolveMentions(mentions: Mention[]): Promise<ResolvedMention[]> {
  const out: ResolvedMention[] = [];
  let used = 0;
  for (const m of mentions.slice(0, MENTION_MAX)) {
    const r = await resolveOne(m);
    const text = clip(r.text, MENTION_MAX_CHARS);
    if (used + text.length > MENTIONS_MAX_CHARS) {
      out.push({ label: r.label, text: "(omitted: the mentions before it used the room)", found: r.found });
      continue;
    }
    used += text.length;
    out.push({ ...r, text });
  }
  return out;
}

export function renderMentions(resolved: ResolvedMention[]): string {
  if (!resolved.length) return "";
  const blocks = resolved.map((r) => `## ${r.label}\n${r.text}`);
  return `# Mentioned by the user\nThe user pointed at these with @. Read them before answering; they outrank anything listed above.\n\n${blocks.join("\n\n")}`;
}
