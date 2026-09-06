/**
 * The part of a note written for the assistant rather than the reader.
 *
 * It is a fixed heading inside the body, not a frontmatter key: `parseNote`
 * refuses unknown keys, so a key would make every note carrying it unreadable
 * to an older checkout, and multi-line YAML does not survive hand editing.
 * `body` on the note stays the full markdown — search, backlinks and
 * `read_note` all keep seeing the whole thing — and these two functions are the
 * only code that knows the heading. A read never moves the section; a write
 * through `forAi` re-emits it last.
 *
 * This file imports nothing on purpose. `lib/view/doc.ts` calls `splitAiSection`
 * and is value-imported by a client component, so the split cannot live in
 * `knowledge.ts`, which reaches `simple-git`.
 */
export const AI_HEADING = "## For the AI";
const FENCE_RE = /^\s*(```|~~~)/;
const H2_RE = /^## /;

export function splitAiSection(body: string): { human: string; forAi: string | null } {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let fenced = false;
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (start === -1) {
      if (line.trimEnd() === AI_HEADING) start = i;
    } else if (H2_RE.test(line)) {
      end = i;
      break;
    }
  }
  if (start === -1) return { human: body.trim(), forAi: null };
  return {
    human: [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim(),
    forAi: lines.slice(start + 1, end).join("\n").trim(),
  };
}

export function withAiSection(human: string, forAi: string | null | undefined): string {
  const base = human.trim();
  const ai = forAi?.trim() ?? "";
  if (!ai) return base;
  return base ? `${base}\n\n${AI_HEADING}\n\n${ai}` : `${AI_HEADING}\n\n${ai}`;
}

function fnv1a32(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Sixteen hex characters — two 32-bit FNV-1a passes with different seeds —
 * over the human part of the body. It only has to notice that the words
 * changed, so a cryptographic hash would buy nothing, and it must run in the
 * browser bundle, where `node:crypto` does not exist. `ai_checked` stores
 * this; a note is unchecked when the stored value no longer matches.
 */
export function humanHash(body: string): string {
  const { human } = splitAiSection(body);
  const a = fnv1a32(human, 0x811c9dc5).toString(16).padStart(8, "0");
  const b = fnv1a32(human, 0x9dc5811c).toString(16).padStart(8, "0");
  return `${a}${b}`;
}

export type AiStatus = "none" | "fresh" | "unchecked";

/**
 * Derived, never stored. `unchecked` means the body's words moved after the
 * section was last confirmed against them — exactly the edits that can make
 * the section lie, and none of the re-saves that cannot.
 */
export function aiStatusOf(note: { body: string; aiChecked?: string }): AiStatus {
  const { forAi } = splitAiSection(note.body);
  if (forAi === null) return "none";
  return note.aiChecked === humanHash(note.body) ? "fresh" : "unchecked";
}
