const TASK_REF = /\bT-\d+(?:\.\d+)*\b/g;

/** Inline code, a fenced-code line, and existing markdown links are all off limits. */
const SKIP = /(`[^`]*`)|(\[[^\]]*\]\([^)]*\))/g;

function isFence(line: string): boolean {
  return /^\s*(```|~~~)/.test(line);
}

function eachTextSegment(line: string, fn: (text: string) => string): string {
  let out = "";
  let last = 0;
  SKIP.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SKIP.exec(line)) !== null) {
    out += fn(line.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(line.slice(last));
}

/**
 * Task ids mentioned in free text, in document order, without duplicates.
 * Ids inside code are deliberately invisible: a plan often quotes a raw task
 * line, and that is a sample, not a reference.
 */
export function taskRefsIn(body: string): string[] {
  const seen: string[] = [];
  let fenced = false;
  for (const line of body.split("\n")) {
    if (isFence(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    eachTextSegment(line, (text) => {
      for (const match of text.match(TASK_REF) ?? []) {
        if (!seen.includes(match)) seen.push(match);
      }
      return text;
    });
  }
  return seen;
}

/**
 * Rewrite every mention of a known task id into a markdown link. An id with no
 * href — one that does not exist, or the task being read right now — is left
 * exactly as written, so a dangling reference reads as plain text rather than
 * a link that goes nowhere.
 */
export function linkifyTaskRefs(body: string, hrefFor: (id: string) => string | null): string {
  let fenced = false;
  return body
    .split("\n")
    .map((line) => {
      if (isFence(line)) {
        fenced = !fenced;
        return line;
      }
      if (fenced) return line;
      return eachTextSegment(line, (text) =>
        text.replace(TASK_REF, (id) => {
          const href = hrefFor(id);
          return href ? `[${id}](${href})` : id;
        }),
      );
    })
    .join("\n");
}
