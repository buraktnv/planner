import { describe, expect, it } from "vitest";
import { buildDistillStatus, latestNoteDate } from "../distill";
import type { JournalDay } from "@/lib/core/journal";
import type { KnowledgeNote } from "@/lib/core/types";

function note(created: string, id = "K-001"): KnowledgeNote {
  return {
    id,
    title: "T",
    summary: "S",
    scope: [],
    tags: [],
    created,
    updated: created,
    body: "",
  };
}

function day(date: string, scopes: string[]): JournalDay {
  return {
    date,
    entries: scopes.map((scope, i) => ({ time: `09:0${i}`, scope, message: `m${i}` })),
  };
}

describe("latestNoteDate", () => {
  it("is null with no notes", () => {
    expect(latestNoteDate([])).toBeNull();
  });

  it("takes the highest created date", () => {
    expect(
      latestNoteDate([note("2026-08-01", "K-001"), note("2026-08-20", "K-002"), note("2026-08-11", "K-003")]),
    ).toBe("2026-08-20");
  });
});

describe("buildDistillStatus", () => {
  it("is not ready with no journal", () => {
    const s = buildDistillStatus([], [], "2026-08-28");
    expect(s.ready).toBe(false);
    expect(s.entries).toBe(0);
    expect(s.journalDays).toBe(0);
    expect(s.headline).toBe("No journal activity to distill yet.");
  });

  it("is not ready below the entry threshold", () => {
    const s = buildDistillStatus([day("2026-08-28", ["ftbot", "life"])], [], "2026-08-28");
    expect(s.ready).toBe(false);
    expect(s.entries).toBe(2);
    expect(s.headline).toMatch(/Only 2 journal entries/);
  });

  it("ignores agent entries when counting", () => {
    const s = buildDistillStatus(
      [day("2026-08-28", ["agent:claude-code", "agent:probe", "agent:x", "ftbot"])],
      [],
      "2026-08-28",
    );
    expect(s.entries).toBe(1);
    expect(s.journalDays).toBe(1);
    expect(s.ready).toBe(false);
  });

  it("is ready at the threshold and reports no notes filed", () => {
    const s = buildDistillStatus(
      [day("2026-08-28", ["ftbot", "life", "chat"])],
      [],
      "2026-08-28",
    );
    expect(s.ready).toBe(true);
    expect(s.lastNoteDate).toBeNull();
    expect(s.daysSinceLastNote).toBeNull();
    expect(s.headline).toBe(
      "3 journal entries across 1 day and nothing filed yet. Distill to turn what happened into notes.",
    );
  });

  it("reports the gap since the last note", () => {
    const s = buildDistillStatus(
      [day("2026-08-28", ["a", "b", "c"]), day("2026-08-27", ["d"])],
      [note("2026-08-25")],
      "2026-08-28",
    );
    expect(s.entries).toBe(4);
    expect(s.journalDays).toBe(2);
    expect(s.daysSinceLastNote).toBe(3);
    expect(s.headline).toBe("4 journal entries across 2 days, last note filed 3 days ago.");
  });

  it("says so when a note was filed today", () => {
    const s = buildDistillStatus(
      [day("2026-08-28", ["a", "b", "c"])],
      [note("2026-08-28")],
      "2026-08-28",
    );
    expect(s.daysSinceLastNote).toBe(0);
    expect(s.headline).toBe("3 journal entries across 1 day. You filed a note today.");
  });

  it("does not count days that have no entries", () => {
    const s = buildDistillStatus(
      [{ date: "2026-08-28", entries: [] }, day("2026-08-27", ["a", "b", "c"])],
      [],
      "2026-08-28",
    );
    expect(s.journalDays).toBe(1);
  });
});
