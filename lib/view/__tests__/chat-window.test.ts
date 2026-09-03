import { describe, expect, it } from "vitest";
import type { MessageLike } from "../chat-parts";
import { charsOf, digestOf, WINDOW_KEEP_MESSAGES, windowMessages } from "../chat-window";

function user(id: string, text: string): MessageLike {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistant(id: string, text: string, tools: unknown[] = []): MessageLike {
  return { id, role: "assistant", parts: [...tools, { type: "text", text }] };
}

function tool(name: string, output: unknown, state = "output-available"): unknown {
  return { type: `tool-${name}`, toolCallId: `${name}-1`, state, input: {}, output };
}

function conversation(turns: number): MessageLike[] {
  const out: MessageLike[] = [];
  for (let i = 0; i < turns; i += 1) {
    out.push(user(`u${i}`, `question ${i}`));
    out.push(assistant(`a${i}`, `answer ${i}`));
  }
  return out;
}

describe("windowMessages", () => {
  it("sends everything while the conversation is short", () => {
    const messages = conversation(3);
    const w = windowMessages(messages);
    expect(w.messages).toEqual(messages);
    expect(w.messages).toHaveLength(6);
    expect(w.digest).toBeNull();
    expect(w.dropped).toBe(0);
  });

  it("keeps the last twelve messages and digests the rest", () => {
    const messages = conversation(10);
    const w = windowMessages(messages);
    expect(w.messages).toHaveLength(WINDOW_KEEP_MESSAGES);
    expect(w.messages[0].id).toBe("u4");
    expect(w.dropped).toBe(8);
    expect(w.digest).toContain("Started with: question 0");
    expect(w.digest).toContain("8 earlier messages omitted.");
  });

  it("trims further to fit the character budget, never below two", () => {
    const messages = conversation(4).map((m) =>
      m.role === "assistant" ? assistant(m.id, "x".repeat(5_000)) : m,
    );
    const w = windowMessages(messages, { budget: 6_000 });
    expect(w.messages.length).toBeLessThanOrEqual(2);
    expect(w.messages.length).toBeGreaterThanOrEqual(1);
    expect(w.messages[0].role).toBe("user");
  });

  it("always opens the window on a user message", () => {
    const messages = [
      user("u0", "first"),
      assistant("a0", "one"),
      assistant("a1", "two"),
      user("u1", "second"),
      assistant("a2", "three"),
    ];
    const w = windowMessages(messages, { keep: 3 });
    expect(w.messages.map((m) => m.id)).toEqual(["u1", "a2"]);
    expect(w.dropped).toBe(3);
  });

  it("keeps the whole transcript when there is no user message to cut on", () => {
    const messages = [assistant("a0", "one"), assistant("a1", "two"), assistant("a2", "three")];
    const w = windowMessages(messages, { keep: 1 });
    expect(w.messages).toHaveLength(3);
    expect(w.digest).toBeNull();
  });

  it("is deterministic", () => {
    const messages = conversation(9);
    expect(windowMessages(messages)).toEqual(windowMessages(messages));
  });
});

describe("digestOf", () => {
  it("lists tools with their ids from both output shapes", () => {
    const dropped = [
      user("u0", "Plan my week please"),
      assistant("a0", "Created two tasks.", [
        tool("create_task", { id: "T-041" }),
        tool("create_task", JSON.stringify({ id: "T-042" })),
        tool("mcp__planner__update_event", { id: "E-004" }),
        tool("search_knowledge", [1, 2, 3]),
        tool("create_task", { id: "T-999" }, "output-error"),
      ]),
      assistant("a1", "Anything else?"),
    ];
    const text = digestOf(dropped);
    expect(text).toContain("Started with: Plan my week please");
    expect(text).toContain("create_task ×2 (T-041, T-042)");
    expect(text).toContain("update_event (E-004)");
    expect(text).toContain("search_knowledge (3 rows)");
    expect(text).not.toContain("T-999");
    expect(text).toContain("Last covered: Anything else?");
    expect(text).toContain("3 earlier messages omitted.");
  });

  it("clips long texts and the whole digest", () => {
    const dropped = [user("u0", "a".repeat(1_000)), assistant("a0", "b".repeat(1_000))];
    const text = digestOf(dropped, 120);
    expect(text.length).toBeLessThanOrEqual(121);
    expect(text.endsWith("…")).toBe(true);
  });

  it("does not throw on junk parts", () => {
    const junk: MessageLike[] = [
      { id: "x", role: "user", parts: [null, 4, "str", { type: "text" }, { type: "tool-x" }] },
      { id: "y", role: "assistant", parts: [{ type: "tool-y", output: undefined }] },
    ];
    expect(() => digestOf(junk)).not.toThrow();
    expect(digestOf(junk)).toContain("2 earlier messages omitted.");
  });
});

describe("charsOf", () => {
  it("counts text, tool input and tool output", () => {
    const m = assistant("a", "hello", [tool("create_task", { id: "T-001" })]);
    expect(charsOf(m)).toBe("hello".length + "{}".length + JSON.stringify({ id: "T-001" }).length);
  });
});
