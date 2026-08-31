import fs from "node:fs/promises";
import path from "node:path";
import { commentPath, commentsDir } from "./paths";
import { assertTaskId } from "./details";
import { appendJournal } from "./journal";
import { commitData } from "./git";
import { withDataLock } from "./locks";
import type { ProjectType } from "./types";

const TASK_ID = /^T-\d+(\.\d+)*$/;

/**
 * A body line is only an entry boundary if it is exactly a stamp heading. A
 * pasted `## Results` or a fenced block is therefore body text, which is what
 * makes a multi-line entry safe to write.
 */
const STAMP = /^##[ \t]+(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?:[ \t]*·[ \t]*(\S+))?[ \t]*$/;

export const MAX_COMMENT_LENGTH = 10000;

export interface TaskComment {
  date: string;
  time: string;
  /**
   * The marker written after the stamp, if any. Nothing writes one today —
   * entries are all the same kind — but it round-trips, so a later build can
   * introduce kinds without migrating a single file, and an older build can
   * never silently eat one.
   */
  marker: string | null;
  body: string;
}

export interface CommentLog {
  /**
   * Anything before the first stamp — the file's title, and whatever a hand
   * editor left there. Kept so nothing a person wrote is ever dropped.
   */
  preamble: string;
  entries: TaskComment[];
}

/**
 * Total: never throws, for any input. This file is appended by two OS
 * processes and hand-edited in a markdown editor, and it renders inside a page
 * that must not fall over — so unrecognised text is classified, never
 * rejected. Contrast `parseTasks`, where a mis-parse must stop the world.
 */
export function parseComments(raw: string): CommentLog {
  const lines = String(raw ?? "").replace(/\r\n/g, "\n").split("\n");
  const preamble: string[] = [];
  const entries: TaskComment[] = [];
  let current: TaskComment | null = null;
  let body: string[] = [];

  const flush = () => {
    if (!current) return;
    entries.push({ ...current, body: body.join("\n").trim() });
    body = [];
  };

  for (const line of lines) {
    const m = STAMP.exec(line);
    if (m) {
      flush();
      current = { date: m[1], time: m[2], marker: m[3] ?? null, body: "" };
      continue;
    }
    if (current) body.push(line);
    else preamble.push(line);
  }
  flush();

  return { preamble: preamble.join("\n").trim(), entries };
}

/**
 * Indenting a body line that looks like a stamp is what stops a comment
 * forging an entry boundary, and it happens at the writer for the same reason
 * `cleanTitle` rejects `" | "` there: a body already on disk is too late. An
 * indent rather than a refusal, because a body is text pasted from anywhere.
 */
export function serializeComment(date: string, time: string, body: string): string {
  const safe = body
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => (STAMP.test(line) ? `  ${line}` : line))
    .join("\n")
    .trim();
  return `\n## ${date} ${time}\n${safe}\n`;
}

export async function readComments(
  type: ProjectType,
  slug: string,
  taskId: string,
): Promise<TaskComment[]> {
  assertTaskId(taskId);
  let raw: string;
  try {
    raw = await fs.readFile(commentPath(type, slug, taskId), "utf8");
  } catch {
    return [];
  }
  return parseComments(raw).entries;
}

export async function listCommentedIds(type: ProjectType, slug: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(commentsDir(type, slug));
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith(".md"))
    .map((n) => n.slice(0, -3))
    .filter((id) => TASK_ID.test(id));
}

/**
 * Appends one entry. Never reads-modifies-writes, so unlike every other writer
 * here there is no lost-update window at all: a torn write costs the entry it
 * cut, never the file.
 */
export async function appendComment(
  type: ProjectType,
  slug: string,
  taskId: string,
  body: string,
): Promise<TaskComment> {
  assertTaskId(taskId);
  const text = String(body ?? "").trim();
  if (!text) throw new Error("A comment needs a body");
  if (text.length > MAX_COMMENT_LENGTH) {
    throw new Error(`A comment is at most ${MAX_COMMENT_LENGTH} characters`);
  }
  return withDataLock(async () => {
    const now = new Date();
    const date = now.toLocaleDateString("sv").slice(0, 10);
    const time = now.toLocaleTimeString("sv").slice(0, 5);
    const file = commentPath(type, slug, taskId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const header = await fs
      .access(file)
      .then(() => "")
      .catch(() => `# ${taskId} — log\n`);
    await fs.appendFile(file, header + serializeComment(date, time, text), "utf8");
    await appendJournal(slug, `${taskId} comment added`);
    await commitData(`task comment: ${taskId} (${slug})`);
    return { date, time, marker: null, body: text };
  });
}
