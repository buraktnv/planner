import { describe, expect, it } from "vitest";
import {
  MAX_STORED_BYTES,
  MAX_STORED_SESSIONS,
  mergeSessions,
  nextStoredValue,
  packSessions,
  unpackSessions,
  type StoredSession,
} from "../chat-sessions";

function session(over: Partial<StoredSession> = {}): StoredSession {
  return {
    id: "s-1",
    title: "Rebuild attention",
    mode: "plan",
    messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] }],
    ...over,
  };
}

describe("packSessions and unpackSessions", () => {
  it("round-trips a conversation, transcript and all", () => {
    const one = session();
    expect(unpackSessions(packSessions([one]))).toEqual([one]);
  });

  it("keeps newest first", () => {
    const list = [session({ id: "s-3" }), session({ id: "s-2" }), session({ id: "s-1" })];
    expect(unpackSessions(packSessions(list)).map((s) => s.id)).toEqual(["s-3", "s-2", "s-1"]);
  });

  /** Otherwise every reload leaves a blank "New conversation" behind for ever. */
  it("does not store an empty conversation", () => {
    const stored = unpackSessions(packSessions([session({ id: "empty", messages: [] }), session()]));
    expect(stored.map((s) => s.id)).toEqual(["s-1"]);
  });

  it("stores nothing when nothing has been said", () => {
    expect(unpackSessions(packSessions([session({ messages: [] })]))).toEqual([]);
  });

  it("caps how many conversations it keeps, dropping the oldest", () => {
    const many = Array.from({ length: MAX_STORED_SESSIONS + 5 }, (_, i) =>
      session({ id: `s-${i}` }),
    );
    const stored = unpackSessions(packSessions(many));
    expect(stored).toHaveLength(MAX_STORED_SESSIONS);
    expect(stored[0].id).toBe("s-0");
  });

  it("drops the oldest conversations until it fits the byte budget", () => {
    const fat = (id: string) =>
      session({ id, messages: [{ text: "x".repeat(400_000) }] });
    const stored = unpackSessions(
      packSessions([fat("newest"), fat("middle"), fat("oldest")]),
    );
    expect(stored.length).toBeLessThan(3);
    expect(stored[0].id).toBe("newest");
  });

  it("stays under the budget even so", () => {
    const fat = (id: string) => session({ id, messages: [{ text: "y".repeat(200_000) }] });
    const packed = packSessions([fat("a"), fat("b"), fat("c")]);
    expect(packed.length).toBeLessThanOrEqual(MAX_STORED_BYTES);
  });

  /** Better to remember that the conversation happened than to store nothing. */
  it("keeps the record of a single oversized conversation, without its transcript", () => {
    const huge = session({ id: "huge", messages: [{ text: "z".repeat(1_500_000) }] });
    const stored = unpackSessions(packSessions([huge]));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("huge");
    expect(stored[0].messages).toEqual([]);
  });
});

describe("unpackSessions is total", () => {
  it("reads nothing as nothing", () => {
    expect(unpackSessions(null)).toEqual([]);
    expect(unpackSessions(undefined)).toEqual([]);
    expect(unpackSessions("")).toEqual([]);
  });

  it("survives junk rather than taking down the rail on load", () => {
    expect(unpackSessions("{not json")).toEqual([]);
    expect(unpackSessions('"a string"')).toEqual([]);
    expect(unpackSessions("{}")).toEqual([]);
    expect(unpackSessions("[1,2,3]")).toEqual([]);
  });

  it("skips entries it cannot use and keeps the rest", () => {
    const raw = JSON.stringify([
      { id: "ok", title: "Fine", mode: "plan", messages: [] },
      { id: "", title: "No id", messages: [] },
      { id: "no-messages", title: "Bad" },
      null,
      { id: "ok2", title: "Also fine", mode: "plan", messages: [] },
    ]);
    expect(unpackSessions(raw).map((s) => s.id)).toEqual(["ok", "ok2"]);
  });

  it("drops a mode it does not recognise rather than trusting it", () => {
    const raw = JSON.stringify([{ id: "a", title: "T", mode: "wildcard", messages: [] }]);
    expect(unpackSessions(raw)[0].mode).toBeNull();
  });

  it("names a conversation that lost its title", () => {
    const raw = JSON.stringify([{ id: "a", messages: [] }]);
    expect(unpackSessions(raw)[0].title).toBe("Conversation");
  });

  it("ignores a duplicate id, which would collide in the list", () => {
    const raw = JSON.stringify([
      { id: "a", title: "First", messages: [] },
      { id: "a", title: "Second", messages: [] },
    ]);
    const stored = unpackSessions(raw);
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe("First");
  });
});

describe("nextStoredValue", () => {
  /**
   * The save that runs on mount sees the server snapshot — no history at all.
   * Writing then would wipe the stored conversations a moment before they are
   * read back, which is exactly the bug this rule exists to stop.
   */
  it("declines to write when there is nothing to save", () => {
    expect(nextStoredValue([], [])).toBeNull();
    expect(nextStoredValue([session({ messages: [] })], [])).toBeNull();
  });

  it("writes the live conversations together with the stored ones", () => {
    const value = nextStoredValue([session({ id: "live" })], [session({ id: "old" })]);
    expect(value).not.toBeNull();
    expect(unpackSessions(value).map((s) => s.id)).toEqual(["live", "old"]);
  });

  it("keeps stored history even when this page load has said nothing", () => {
    const value = nextStoredValue([session({ id: "fresh", messages: [] })], [session({ id: "old" })]);
    expect(unpackSessions(value).map((s) => s.id)).toEqual(["old"]);
  });
});

describe("mergeSessions", () => {
  it("shows this page load's conversations first, then the stored ones", () => {
    const live = [session({ id: "live" })];
    const restored = [session({ id: "old-1" }), session({ id: "old-2" })];
    expect(mergeSessions(live, restored).map((s) => s.id)).toEqual(["live", "old-1", "old-2"]);
  });

  it("shows a reopened conversation once, in its live position", () => {
    const live = [session({ id: "new" }), session({ id: "old-1", title: "Reopened" })];
    const restored = [session({ id: "old-1", title: "Stored" }), session({ id: "old-2" })];
    const merged = mergeSessions(live, restored);
    expect(merged.map((s) => s.id)).toEqual(["new", "old-1", "old-2"]);
    expect(merged[1].title).toBe("Reopened");
  });

  it("copes with either side being empty", () => {
    expect(mergeSessions([], [])).toEqual([]);
    expect(mergeSessions([session()], [])).toHaveLength(1);
    expect(mergeSessions([], [session()])).toHaveLength(1);
  });
});
