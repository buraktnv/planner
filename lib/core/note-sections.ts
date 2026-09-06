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
