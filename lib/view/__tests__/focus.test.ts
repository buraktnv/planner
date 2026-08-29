import { describe, expect, it } from "vitest";
import {
  buildFocus,
  clockOf,
  isLowDay,
  nextIndexAfterSkip,
  planRowsFor,
  rankCards,
} from "../focus";
import type { CardModel, CharterModel, Workspace } from "../workspace";
import type { JournalDay } from "@/lib/core/journal";

const TODAY = "2026-08-28";

function card(partial: Partial<CardModel> & { id: string }): CardModel {
  const slug = partial.slug ?? "alpha";
  const type = partial.type ?? "project";
  return {
    key: `${type}/${slug}/${partial.id}`,
    type,
    slug,
    charterName: partial.charterName ?? "Alpha",
    color: "#7d95dd",
    tint: "#e6eaf9",
    title: partial.title ?? `Task ${partial.id}`,
    size: "M",
    lane: "deep",
    section: "backlog",
    done: false,
    blocked: false,
    overdue: false,
    pct: 0,
    subDone: 0,
    subTotal: 0,
    subs: [],
    hasDetail: false,
    priority: "P2",
    ...partial,
  };
}

function charter(id: string, priority: number, cards: CardModel[]): CharterModel {
  return {
    id,
    name: id,
    type: "project",
    status: "active",
    statusLabel: "ACTIVE",
    priority,
    priorityLabel: `P${priority}`,
    why: "",
    mvpScope: [],
    parkingLot: [],
    color: "#7d95dd",
    tint: "#e6eaf9",
    open: cards.filter((c) => !c.done).length,
    doneTotal: cards.filter((c) => c.done).length,
    total: cards.length,
    pct: 0,
    lastActivity: null,
    cards,
    next: null,
  };
}

function workspace(charters: CharterModel[]): Workspace {
  const cards = charters.flatMap((c) => c.cards);
  return {
    charters,
    projects: charters.filter((c) => c.type === "project"),
    areas: charters.filter((c) => c.type === "area"),
    cards,
    byId: new Map(charters.map((c) => [`${c.type}/${c.id}`, c])),
    today: TODAY,
  };
}

function day(date: string, times: string[]): JournalDay {
  return {
    date,
    entries: times.map((time) => ({ time, scope: "alpha", message: "did a thing" })),
  };
}

describe("rankCards", () => {
  it("puts overdue first, soonest date leading", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", title: "Later overdue", due: "2026-08-20", overdue: true }),
        card({ id: "T-002", title: "Oldest overdue", due: "2026-08-10", overdue: true }),
        card({ id: "T-003", title: "Plain open" }),
      ]),
    ]);
    expect(rankCards(ws).map((r) => r.card.id)).toEqual(["T-002", "T-001", "T-003"]);
  });

  it("ranks future-dated work above in-progress and undated work", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", title: "Undated" }),
        card({ id: "T-002", title: "In progress", section: "in-progress" }),
        card({ id: "T-003", title: "Dated", due: "2026-09-10" }),
      ]),
    ]);
    expect(rankCards(ws).map((r) => r.card.id)).toEqual(["T-003", "T-002", "T-001"]);
  });

  it("breaks ties on charter priority, then size, then title", () => {
    const ws = workspace([
      charter("low", 3, [card({ id: "T-100", slug: "low", charterName: "low", size: "S" })]),
      charter("high", 1, [
        card({ id: "T-002", slug: "high", charterName: "high", size: "L", title: "B large" }),
        card({ id: "T-001", slug: "high", charterName: "high", size: "S", title: "A small" }),
      ]),
    ]);
    expect(rankCards(ws).map((r) => r.card.id)).toEqual(["T-001", "T-002", "T-100"]);
  });

  it("excludes finished work", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", done: true, section: "done" }),
        card({ id: "T-002" }),
      ]),
    ]);
    expect(rankCards(ws).map((r) => r.card.id)).toEqual(["T-002"]);
  });

  it("uses est when present and otherwise a size-derived effort", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", size: "S", est: "10m" }),
        card({ id: "T-002", size: "S" }),
        card({ id: "T-003", size: "L" }),
      ]),
    ]);
    const effort = Object.fromEntries(rankCards(ws).map((r) => [r.card.id, r.effort]));
    expect(effort["T-001"]).toBe("10m");
    expect(effort["T-002"]).toBe("15 min");
    expect(effort["T-003"]).toBe("2 h+");
  });

  it("flags overdue rows as pinned", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", due: "2026-08-01", overdue: true }),
        card({ id: "T-002" }),
      ]),
    ]);
    const pinned = Object.fromEntries(rankCards(ws).map((r) => [r.card.id, r.pinned]));
    expect(pinned).toEqual({ "T-001": true, "T-002": false });
  });
});

describe("the reason shown next to a task", () => {
  function reasonFor(partial: Partial<CardModel> & { id: string }): string {
    const ws = workspace([charter("alpha", 2, [card(partial)])]);
    return rankCards(ws)[0].why;
  }

  it("counts the days an overdue task has slipped", () => {
    expect(reasonFor({ id: "T-001", due: "2026-08-26", overdue: true })).toMatch(
      /Past its date by 2 days/,
    );
  });

  it("uses the singular for one day past", () => {
    expect(reasonFor({ id: "T-001", due: "2026-08-27", overdue: true })).toMatch(
      /Past its date by 1 day —/,
    );
  });

  it("names the date for future-dated work", () => {
    expect(reasonFor({ id: "T-001", due: "2026-09-01" })).toBe("Dated 01 SEP");
  });

  it("reports progress for started work with subtasks", () => {
    expect(
      reasonFor({ id: "T-001", section: "in-progress", subTotal: 4, subDone: 1 }),
    ).toBe("Already started — 1 of 4 steps done");
  });

  it("reports plain started work without subtasks", () => {
    expect(reasonFor({ id: "T-001", section: "in-progress" })).toBe("Already started");
  });

  it("mentions waiting subtasks for an unstarted parent", () => {
    expect(reasonFor({ id: "T-001", subTotal: 3 })).toBe("3 steps waiting under it");
  });

  it("calls out a parked task", () => {
    expect(reasonFor({ id: "T-001", lane: "wait" })).toMatch(/waiting/i);
  });

  it("calls a small task the cheapest thing", () => {
    expect(reasonFor({ id: "T-001", size: "S" })).toBe("Cheapest thing on the list");
  });
});

describe("buildFocus", () => {
  it("picks the top-ranked card as the one thing", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", title: "Second" }),
        card({ id: "T-002", title: "First", due: "2026-08-01", overdue: true }),
      ]),
    ]);
    const model = buildFocus(ws, []);
    expect(model.oneThing?.card.id).toBe("T-002");
    expect(model.openTotal).toBe(2);
    expect(model.overdue).toBe(1);
  });

  it("has no one thing and says so when nothing is open", () => {
    const model = buildFocus(workspace([charter("alpha", 2, [])]), []);
    expect(model.oneThing).toBeNull();
    expect(model.planLead).toMatch(/Nothing open/);
  });

  it("leads with the overdue count when something has slipped", () => {
    const ws = workspace([
      charter("alpha", 2, [card({ id: "T-001", due: "2026-08-01", overdue: true })]),
    ]);
    expect(buildFocus(ws, []).planLead).toMatch(/^1 dated thing first/);
  });

  it("counts a run of consecutive journal days as the activity streak", () => {
    const ws = workspace([charter("alpha", 2, [card({ id: "T-001" })])]);
    const journal = [
      day("2026-08-28", ["09:10"]),
      day("2026-08-27", ["11:00"]),
      day("2026-08-26", ["14:00"]),
      day("2026-08-24", ["10:00"]),
    ];
    const streaks = buildFocus(ws, journal).streaks;
    expect(streaks.find((s) => s.name === "Days with activity")?.n).toBe(3);
  });

  it("counts only mornings for the morning-start streak", () => {
    const ws = workspace([charter("alpha", 2, [card({ id: "T-001" })])]);
    const journal = [day("2026-08-28", ["08:30"]), day("2026-08-27", ["19:00"])];
    const streaks = buildFocus(ws, journal).streaks;
    expect(streaks.find((s) => s.name === "Morning starts")?.n).toBe(1);
  });

  it("counts cards closed inside the last seven days", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", done: true, section: "done", doneDate: "2026-08-27" }),
        card({ id: "T-002", done: true, section: "done", doneDate: "2026-08-02" }),
      ]),
    ]);
    const streaks = buildFocus(ws, []).streaks;
    expect(streaks.find((s) => s.name === "Closed this week")?.n).toBe(1);
  });

  it("reports what was done and logged today", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", done: true, section: "done", doneDate: TODAY }),
        card({ id: "T-002", due: "2026-08-01", overdue: true }),
      ]),
    ]);
    const held = buildFocus(ws, [day(TODAY, ["09:00", "10:00"])]).held;
    expect(held).toEqual([
      { n: 1, label: "DONE TODAY" },
      { n: 2, label: "LOGGED" },
      { n: 1, label: "PAST DATE" },
    ]);
  });

  it("names the oldest overdue task in the stuck facts", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", title: "The tap", due: "2026-08-01", overdue: true }),
      ]),
    ]);
    expect(buildFocus(ws, []).stuckFacts[0]).toMatch(/The tap/);
  });

  it("says there is no emergency when nothing is overdue", () => {
    const ws = workspace([charter("alpha", 2, [card({ id: "T-001" })])]);
    const facts = buildFocus(ws, [day(TODAY, ["09:00"])]).stuckFacts;
    expect(facts.join(" ")).toMatch(/no emergency/);
  });

  it("offers the smallest open task as the concrete next move", () => {
    const ws = workspace([
      charter("alpha", 2, [
        card({ id: "T-001", size: "L", title: "Big one" }),
        card({ id: "T-002", size: "S", title: "Tiny one" }),
      ]),
    ]);
    const offers = buildFocus(ws, []).stuckOffers;
    expect(offers.some((o) => o.kind === "physical")).toBe(true);
    const small = offers.find((o) => o.kind === "small");
    expect(small?.text).toMatch(/Tiny one/);
    expect(small?.cardKey).toBe("project/alpha/T-002");
  });

  it("offers no small task when every open card is large", () => {
    const ws = workspace([charter("alpha", 2, [card({ id: "T-001", size: "L" })])]);
    expect(buildFocus(ws, []).stuckOffers.some((o) => o.kind === "small")).toBe(false);
  });
});

describe("blocked work", () => {
  it("sinks below everything open, even when it is overdue", () => {
    const ws = workspace([
      charter("alpha", 1, [
        card({ id: "T-001", blocked: true, due: "2026-08-01", overdue: true }),
        card({ id: "T-002" }),
      ]),
    ]);
    expect(rankCards(ws).map((r) => r.card.id)).toEqual(["T-002", "T-001"]);
  });

  it("is never pinned, so an overdue blocked card is not highlighted", () => {
    const ws = workspace([
      charter("alpha", 1, [card({ id: "T-001", blocked: true, due: "2026-08-01", overdue: true })]),
    ]);
    expect(rankCards(ws)[0].pinned).toBe(false);
  });

  it("is never the One Thing", () => {
    const ws = workspace([
      charter("alpha", 1, [
        card({ id: "T-001", blocked: true, due: "2026-08-01", overdue: true }),
        card({ id: "T-002" }),
      ]),
    ]);
    const model = buildFocus(ws, []);
    expect(model.oneThing?.card.id).toBe("T-002");
    expect(model.ranked[model.oneIndex].card.id).toBe("T-002");
  });

  it("names no One Thing when every open card is blocked, but still points somewhere", () => {
    const ws = workspace([charter("alpha", 1, [card({ id: "T-001", blocked: true })])]);
    const model = buildFocus(ws, []);
    // oneThing stays null — there is genuinely nothing unblocked to recommend.
    // oneIndex still has to be a valid row, because the view must render one.
    expect(model.oneThing).toBeNull();
    expect(model.oneIndex).toBe(0);
  });

  it("has no one thing at all when nothing is open", () => {
    const model = buildFocus(workspace([charter("alpha", 1, [])]), []);
    expect(model.oneThing).toBeNull();
    expect(model.oneIndex).toBe(0);
  });
});

describe("planRowsFor", () => {
  const ranked = (n: number) =>
    rankCards(
      workspace([
        charter(
          "alpha",
          1,
          Array.from({ length: n }, (_, i) =>
            card({ id: `T-0${String(i + 1).padStart(2, "0")}` }),
          ),
        ),
      ]),
    );

  it("shows five rows on a normal day and two on a low one", () => {
    expect(planRowsFor(ranked(8), null)).toHaveLength(5);
    expect(planRowsFor(ranked(8), 4)).toHaveLength(5);
    expect(planRowsFor(ranked(8), 2)).toHaveLength(2);
    expect(planRowsFor(ranked(8), 1)).toHaveLength(2);
  });

  it("never invents rows it does not have", () => {
    expect(planRowsFor(ranked(1), null)).toHaveLength(1);
    expect(planRowsFor([], 1)).toEqual([]);
  });

  it("treats no answer as a normal day", () => {
    expect(isLowDay(null)).toBe(false);
    expect(isLowDay(3)).toBe(false);
    expect(isLowDay(2)).toBe(true);
  });
});

describe("nextIndexAfterSkip", () => {
  // Built directly rather than through rankCards, which would reorder by size
  // and hide what this function actually does with the index it is given.
  const item = (id: string, size: "S" | "M" | "L") => ({
    card: card({ id, size }),
    why: "",
    effort: "",
    pinned: false,
  });
  const ranked = [item("T-001", "L"), item("T-002", "L"), item("T-003", "S")];

  it("steps to the next row for an urgent interruption", () => {
    expect(nextIndexAfterSkip(ranked, 0, "urgent")).toBe(1);
  });

  it("jumps to the cheapest other task for a quick win or no energy", () => {
    expect(nextIndexAfterSkip(ranked, 0, "quick")).toBe(2);
    expect(nextIndexAfterSkip(ranked, 0, "energy")).toBe(2);
  });

  it("never picks the card being skipped, even when it is the small one", () => {
    expect(nextIndexAfterSkip(ranked, 2, "quick")).toBe(2);
  });

  it("clamps at the end rather than pointing past it", () => {
    expect(nextIndexAfterSkip(ranked, 2, "urgent")).toBe(2);
  });

  it("is safe on an empty ranking", () => {
    expect(nextIndexAfterSkip([], 0, "quick")).toBe(0);
  });
});

describe("clockOf", () => {
  it("pads to mm:ss", () => {
    expect(clockOf(25 * 60)).toBe("25:00");
    expect(clockOf(65)).toBe("01:05");
    expect(clockOf(9)).toBe("00:09");
    expect(clockOf(0)).toBe("00:00");
  });

  it("does not render a negative clock", () => {
    expect(clockOf(-5)).toBe("00:00");
  });
});
