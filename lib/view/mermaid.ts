const FENCE_OPEN = /^\s{0,3}(?:```|~~~)\s*([A-Za-z0-9_-]*)/;
const FENCE_CLOSE = /^\s{0,3}(?:```|~~~)\s*$/;

/**
 * react-markdown labels a fenced block with `language-<info>` on the inner
 * <code>. This is the only thing that decides whether a block is a diagram, so
 * it is a function rather than an inline test: it is also what the canvas card
 * uses to decide whether to show a DIAGRAM chip.
 */
export function isMermaidFence(className: unknown): boolean {
  return typeof className === "string" && /(^|\s)language-mermaid(\s|$)/.test(className);
}

/**
 * The mermaid sources in a note, in document order.
 *
 * Used to tell a canvas card that a diagram is in there without rendering it:
 * mermaid parses and lays out on the main thread through a module-global
 * singleton, so a board of thirty cards would be thirty sequential passes.
 */
export function diagramsIn(body: string): string[] {
  const out: string[] = [];
  let collecting: string[] | null = null;

  for (const line of (body ?? "").replace(/\r\n/g, "\n").split("\n")) {
    if (collecting === null) {
      const open = FENCE_OPEN.exec(line);
      if (open && open[1].toLowerCase() === "mermaid") collecting = [];
      continue;
    }
    if (FENCE_CLOSE.test(line)) {
      out.push(collecting.join("\n").trim());
      collecting = null;
      continue;
    }
    collecting.push(line);
  }

  // An unclosed fence still holds a diagram; dropping it would make a note
  // being typed flicker between having one and not.
  if (collecting !== null && collecting.length > 0) out.push(collecting.join("\n").trim());

  return out.filter((d) => d !== "");
}

export function hasDiagram(body: string | null | undefined): boolean {
  return diagramsIn(body ?? "").length > 0;
}
