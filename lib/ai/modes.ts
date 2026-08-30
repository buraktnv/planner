export interface ChatModeMeta {
  key: ChatMode;
  label: string;
  color: string;
  tint: string;
  ink: string;
  opener: string;
  instruction: string;
}

export type ChatMode = "plan" | "straight" | "reflect" | "target";

export const CHAT_MODES: Record<ChatMode, ChatModeMeta> = {
  plan: {
    key: "plan",
    label: "Plan",
    color: "#7d95dd",
    tint: "#e6eaf9",
    ink: "#4a63b0",
    opener: "What are we shaping — today, or the week?",
    instruction:
      "Shape the day or week. Propose, do not ask. One decision per line. For any batch of writes call propose_changes with the whole set instead of writing — nothing lands until the user accepts the card. Use the direct writing tools only for a single change the user explicitly asked for. Put a due date on a task that has a real deadline rather than creating it bare. Something that repeats is a habit or a rhythm, not a task: create it with create_habit or create_rhythm instead of writing a task that says to set one up.",
  },
  straight: {
    key: "straight",
    label: "Straight",
    color: "#c9857a",
    tint: "#f7e8e5",
    ink: "#a4544a",
    opener: "Tell me what you have been avoiding. I will not soften it.",
    instruction:
      "Name what is being avoided. No cushioning, no praise. Use facts from the journal and task dates, not guesses.",
  },
  reflect: {
    key: "reflect",
    label: "Reflect",
    color: "#8fbfc9",
    tint: "#e4f0f3",
    ink: "#4f7d88",
    opener: "What is actually going on today? Start anywhere.",
    instruction: "Ask, do not advise. Short questions. Do not offer tasks until asked.",
  },
  target: {
    key: "target",
    label: "Target",
    color: "#63b894",
    tint: "#e2f2ec",
    ink: "#3f8f70",
    opener: "Which target are we working on?",
    instruction:
      "Work backwards from the target. Show the pace maths. Say plainly if it is off track.",
  },
};

export const CHAT_MODE_KEYS: ChatMode[] = ["plan", "straight", "reflect", "target"];

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && (CHAT_MODE_KEYS as string[]).includes(value);
}
