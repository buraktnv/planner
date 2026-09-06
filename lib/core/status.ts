/**
 * A status entry is a task-log entry with a marker and three parts. The stamp
 * line has always tolerated a marker (`## 2026-09-06 14:22 · status`) so that
 * kinds could be added without migrating a file; this is the first kind.
 *
 * The body is ordinary markdown with three bold labels, so it reads correctly
 * in any editor and an older build shows it as a plain entry. `parseStatus` is
 * total: an entry with the marker but without the labels is a plain entry,
 * never a failure. The file imports nothing, because the task page renders
 * entries in the browser and `comments.ts` reaches the filesystem.
 */
export const STATUS_MARKER = "status";

export interface StatusParts {
  /** What was done or decided. */
  happened: string;
  /** Every note, task or decision touched as a result, by id. */
  changed: string;
  /** What comes next, or "nothing". */
  next: string;
}

const LABELS: Record<keyof StatusParts, string> = {
  happened: "What happened",
  changed: "What changed elsewhere",
  next: "Next",
};

const LABEL_RE = /^\*\*(What happened|What changed elsewhere|Next):?\*\*:?\s*(.*)$/;

function keyOf(label: string): keyof StatusParts {
  if (label === LABELS.happened) return "happened";
  if (label === LABELS.changed) return "changed";
  return "next";
}

export function renderStatus(parts: StatusParts): string {
  const line = (key: keyof StatusParts) => {
    const text = parts[key].trim() || (key === "happened" ? "" : "nothing");
    return `**${LABELS[key]}:** ${text}`;
  };
  return [line("happened"), "", line("changed"), "", line("next")].join("\n");
}

export function parseStatus(body: string): StatusParts | null {
  const out: Partial<StatusParts> = {};
  let current: keyof StatusParts | null = null;
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const m = LABEL_RE.exec(line.trim());
    if (m) {
      current = keyOf(m[1]);
      out[current] = m[2].trim();
      continue;
    }
    if (current && line.trim()) out[current] = `${out[current]}\n${line}`.trim();
  }
  if (out.happened === undefined) return null;
  return { happened: out.happened, changed: out.changed ?? "", next: out.next ?? "" };
}

const ID_RE = /\b(K-\d{3,}|T-\d+(?:\.\d+)*|E-\d{3,}|G-\d{3,})\b/g;

/** The ids a status names, in order, without duplicates — what the feed links. */
export function idsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ID_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
