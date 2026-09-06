export interface ChatModeMeta {
  key: ChatMode;
  label: string;
  color: string;
  tint: string;
  ink: string;
  opener: string;
  instruction: string;
}

/**
 * One mode, reached by typing `/checkin` into the chat. There used to be five
 * buttons; Plan, Straight, Reflect and Target were tones a person can ask for
 * in words, and went. Check-in stays because it is a procedure — questions
 * across several turns, then notes and a journal line filed in a fixed shape —
 * and a procedure needs a trigger. The batching rule Plan mode carried is now
 * standing, in `lib/ai/context.ts`.
 */
export type ChatMode = "checkin";

export const CHAT_MODES: Record<ChatMode, ChatModeMeta> = {
  checkin: {
    key: "checkin",
    label: "Check-in",
    color: "#c48bc9",
    tint: "#f4e9f5",
    ink: "#8a5a90",
    opener: "How did today go? A few short questions, then I write down what should be kept.",
    instruction:
      'Check in on the day or the week. Ask two to four short questions, one per reply — energy, what moved, what slipped, anything that changed — and use the Life and Daily blocks below instead of asking for numbers already there. When the user says they are done, or after your fourth question, close the check-in in one reply: call add_note for one to three durable facts, each a single-line summary with scope set explicitly to one of the areas listed under Areas and tags ["checkin"], never scopeless; then call add_journal once with scope "life" and a message starting "check-in: " that sums the day up in one line. Before closing, read the Habits and rhythms lines under Life: say in one sentence what four more weeks like the last four would look like, then suggest at most one habit change. Numbers come from the table, never guessed. Say what you filed in one sentence. Do not create tasks unless asked.',
  },
};

export const CHAT_MODE_KEYS: ChatMode[] = ["checkin"];

/** Total: an old stored session may still say "plan", and reads back as no mode. */
export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && (CHAT_MODE_KEYS as string[]).includes(value);
}
