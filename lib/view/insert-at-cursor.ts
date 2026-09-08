/**
 * Put a snippet into a textarea's text, replacing whatever is selected.
 *
 * Pure and import-free: the callers are client components, and the only thing
 * worth testing about pasting an image is where the markdown lands. A snippet
 * is given its own line — a newline is added before it when the character it
 * follows is not one, and after it when the character it precedes is not one —
 * because `![](assets/x.png)` glued to the end of a sentence renders as inline
 * text rather than as a picture.
 */
export function insertAtCursor(
  text: string,
  start: number,
  end: number,
  snippet: string,
): { text: string; cursor: number } {
  const from = Math.max(0, Math.min(start, text.length));
  const to = Math.max(from, Math.min(end, text.length));
  const before = text.slice(0, from);
  const after = text.slice(to);
  const lead = before === "" || before.endsWith("\n") ? "" : "\n";
  const tail = after === "" || after.startsWith("\n") ? "" : "\n";
  const piece = `${lead}${snippet}${tail}`;
  return { text: `${before}${piece}${after}`, cursor: before.length + lead.length + snippet.length };
}
