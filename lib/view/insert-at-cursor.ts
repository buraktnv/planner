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

/**
 * Swap a placeholder for the real snippet, or for nothing when the upload
 * failed.
 *
 * An upload takes as long as it takes, and whoever pasted keeps typing. So the
 * caret maths above runs **once, synchronously**, against text that is current
 * by definition, and writes a placeholder; when the request comes back all that
 * is left to do is find that placeholder in whatever the text has since become.
 * Computing a whole new string from the value captured at paste time would
 * throw away every keystroke made while the image was in flight.
 *
 * Written with `indexOf` and `slice` rather than `String.replace`, whose
 * replacement string reads `$&` and friends as patterns.
 */
export function replacePlaceholder(text: string, placeholder: string, snippet: string): string {
  const at = text.indexOf(placeholder);
  if (at === -1) return text;
  const before = text.slice(0, at);
  let after = text.slice(at + placeholder.length);
  // Removing the placeholder must take its line with it, or a failed upload
  // leaves a blank line the person has to notice and delete.
  if (snippet === "") {
    if (after.startsWith("\n")) after = after.slice(1);
    else if (before.endsWith("\n")) return `${before.slice(0, -1)}${after}`;
  }
  return `${before}${snippet}${after}`;
}
