import { describe, expect, it } from "vitest";
import { agentPresence } from "../agents";
import type { JournalDay } from "@/lib/core/journal";

const days: JournalDay[] = [
  {
    date: "2026-08-28",
    entries: [
      { time: "09:12", scope: "agent:claude-code", message: "create_task demo-bot T-004" },
      { time: "09:30", scope: "demo-bot", message: "task created" },
      { time: "10:02", scope: "agent:claude-code", message: "update_task demo-bot T-004" },
      { time: "11:00", scope: "agent:opencode", message: "add_journal demo-bot" },
    ],
  },
  {
    date: "2026-08-27",
    entries: [
      { time: "18:44", scope: "agent:claude-code", message: "create_task demo-bot T-003" },
      { time: "19:00", scope: "agent:", message: "ignored" },
    ],
  },
];

describe("agentPresence", () => {
  it("aggregates calls and tools per agent", () => {
    const out = agentPresence(days);
    expect(out.map((a) => a.name)).toEqual(["opencode", "claude-code"]);
    const claude = out.find((a) => a.name === "claude-code");
    expect(claude?.calls).toBe(3);
    expect(claude?.lastSeen).toBe("2026-08-28");
    expect(claude?.lastTime).toBe("10:02");
    expect(claude?.tools).toEqual([
      { name: "create_task", calls: 2 },
      { name: "update_task", calls: 1 },
    ]);
  });

  it("ignores non-agent scopes and empty agent names", () => {
    const out = agentPresence(days);
    expect(out).toHaveLength(2);
    expect(out.some((a) => a.name === "demo-bot")).toBe(false);
  });

  it("returns an empty list when nothing is journaled", () => {
    expect(agentPresence([])).toEqual([]);
  });
});
