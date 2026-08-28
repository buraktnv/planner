const MIN_QUERY_CHARS = 12;
const PLEASANTRIES = new Set([
  "hi", "hey", "hello", "yo", "thanks", "thank", "you", "ok", "okay", "k", "sure",
  "yes", "yeah", "no", "nope", "cool", "nice", "great", "good", "morning",
  "evening", "afternoon", "night", "very", "much", "a", "lot", "so", "please",
  "mate", "there", "all", "right", "fine", "perfect", "awesome", "cheers", "np",
]);

function isPleasantry(text: string): boolean {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  return words.length > 0 && words.every((w) => PLEASANTRIES.has(w));
}

interface TextPart {
  type?: unknown;
  text?: unknown;
}

interface LooseMessage {
  role?: unknown;
  parts?: unknown;
  content?: unknown;
}

function textOf(message: LooseMessage): string {
  if (Array.isArray(message.parts)) {
    return (message.parts as TextPart[])
      .filter((p) => p && p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join(" ")
      .trim();
  }
  if (typeof message.content === "string") return message.content.trim();
  return "";
}

export function latestUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as LooseMessage;
    if (!m || typeof m !== "object" || m.role !== "user") continue;
    const text = textOf(m);
    if (text) return text;
  }
  return "";
}

export function recallQuery(messages: unknown): string | undefined {
  const text = latestUserText(messages);
  if (text.length < MIN_QUERY_CHARS) return undefined;
  if (isPleasantry(text)) return undefined;
  return text;
}
