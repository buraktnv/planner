import { describe, expect, it } from "vitest";
import type { DailyData, DailyLogEntry } from "@/lib/core/types";
import {
  buildDaily,
  habitDaysMet,
  habitStreak,
  servingsEaten,
} from "../daily";

function log(rows: [string, string, number | "reset"][]): DailyLogEntry[] {
  return rows.map(([date, id, delta]) => ({ date, time: "09:00", id, delta }));
}

function data(overrides: Partial<DailyData> = {}): DailyData {
  return {
    habits: [
      { id: "H-001", name: "Walk", goal: 2, unit: "× 15 min" },
      { id: "H-002", name: "Water", goal: 3 },
    ],
    rhythms: [
      { id: "R-001", name: "Laundry", per: 3 },
      { id: "R-002", name: "Kitchen reset", per: 5 },
    ],
    meals: [
      { id: "M-001", name: "Lentil soup", servings: 2 },
      { id: "M-002", name: "Roast vegetables", servings: 0 },
    ],
    groceries: [
      { id: "G-001", name: "Red lentils", cat: "Staples", got: false },
      { id: "G-002", name: "Olive oil", cat: "Staples", got: true },
      { id: "G-003", name: "Spinach", cat: "Produce", got: false },
    ],
    log: [],
    ...overrides,
  };
}

describe("buildDaily", () => {
  it("counts habits for today only", () => {
    const model = buildDaily(
      data({
        log: log([
          ["2026-08-28", "H-001", 1],
          ["2026-08-28", "H-001", 1],
          ["2026-08-27", "H-002", 1],
        ]),
      }),
      "2026-08-28",
    );
    const walk = model.habits.find((h) => h.id === "H-001");
    expect(walk).toMatchObject({ today: 2, met: true, pct: 100, count: "2 / 2" });
    expect(model.habits.find((h) => h.id === "H-002")).toMatchObject({ today: 0, met: false });
    expect(model.habitsLeft).toBe(1);
  });

  it("counts rhythms Monday to Sunday of the current ISO week", () => {
    // 2026-08-28 is a Friday; the week runs 2026-08-24 (Mon) to 2026-08-30 (Sun).
    const model = buildDaily(
      data({
        log: log([
          ["2026-08-23", "R-001", 1],
          ["2026-08-24", "R-001", 1],
          ["2026-08-28", "R-001", 1],
          ["2026-08-30", "R-001", 1],
          ["2026-08-31", "R-001", 1],
        ]),
      }),
      "2026-08-28",
    );
    const laundry = model.rhythms.find((r) => r.id === "R-001");
    expect(laundry).toMatchObject({ week: 3, met: true, left: 0, label: "3 / 3" });
  });

  it("counts the same log differently on either side of a week boundary", () => {
    const rows = log([
      ["2026-08-30", "R-001", 1],
      ["2026-08-31", "R-001", 1],
    ]);
    // Sunday 2026-08-30 sees only its own week.
    expect(
      buildDaily(data({ log: rows }), "2026-08-30").rhythms.find((r) => r.id === "R-001")?.week,
    ).toBe(1);
    // Monday 2026-08-31 starts a new week and sees only the later line.
    const monday = buildDaily(data({ log: rows }), "2026-08-31");
    expect(monday.rhythms.find((r) => r.id === "R-001")?.week).toBe(1);
  });

  it("resets the weekly count when the log carries a reset", () => {
    const model = buildDaily(
      data({
        log: log([
          ["2026-08-24", "R-001", 1],
          ["2026-08-25", "R-001", 1],
          ["2026-08-26", "R-001", 1],
          ["2026-08-27", "R-001", "reset"],
        ]),
      }),
      "2026-08-28",
    );
    expect(model.rhythms.find((r) => r.id === "R-001")).toMatchObject({ week: 0, met: false });
  });

  it("sorts rhythms by how far behind they are and marks behind rows", () => {
    const model = buildDaily(
      data({ log: log([["2026-08-28", "R-001", 1]]) }),
      "2026-08-28",
    );
    expect(model.rhythms.map((r) => r.id)).toEqual(["R-002", "R-001"]);
    expect(model.rhythms[0].behind).toBe(true);
    expect(model.rhythmsMet).toBe(0);
    expect(model.rhythmsTotal).toBe(2);
  });

  it("builds meal pips and the total servings left", () => {
    const model = buildDaily(data(), "2026-08-28");
    expect(model.mealsLeftTotal).toBe(2);
    expect(model.meals[0]).toMatchObject({ left: "2 left", gone: false, pips: [true, true] });
    expect(model.meals[1]).toMatchObject({ gone: true, pips: [false] });
  });

  it("groups groceries by category in first-seen order", () => {
    const model = buildDaily(data(), "2026-08-28");
    expect(model.groups.map((g) => g.cat)).toEqual(["Staples", "Produce"]);
    expect(model.groups[0].items.map((i) => i.id)).toEqual(["G-001", "G-002"]);
    expect(model.groceryLeft).toBe(2);
  });

  it("reports empty when all four lists are empty", () => {
    const model = buildDaily(
      { habits: [], rhythms: [], meals: [], groceries: [], log: [] },
      "2026-08-28",
    );
    expect(model.empty).toBe(true);
    expect(model.habitsLeft).toBe(0);
  });
});

describe("habitStreak", () => {
  it("counts consecutive calendar days that met the goal", () => {
    const rows = log([
      ["2026-08-28", "H-001", 1],
      ["2026-08-28", "H-001", 1],
      ["2026-08-27", "H-001", 1],
      ["2026-08-27", "H-001", 1],
      ["2026-08-26", "H-001", 1],
    ]);
    expect(habitStreak(rows, "H-001", 2, "2026-08-28")).toBe(2);
  });

  it("keeps yesterday's streak alive when today is not met yet", () => {
    const rows = log([
      ["2026-08-27", "H-001", 1],
      ["2026-08-27", "H-001", 1],
      ["2026-08-26", "H-001", 1],
      ["2026-08-26", "H-001", 1],
    ]);
    expect(habitStreak(rows, "H-001", 2, "2026-08-28")).toBe(2);
  });

  it("is zero when nothing was ever met", () => {
    expect(habitStreak(log([["2026-08-28", "H-001", 1]]), "H-001", 2, "2026-08-28")).toBe(0);
  });
});

describe("weekly summary helpers", () => {
  it("habitDaysMet counts habit-days over the window", () => {
    const rows = log([
      ["2026-08-27", "H-001", 1],
      ["2026-08-27", "H-001", 1],
      ["2026-08-28", "H-001", 1],
      ["2026-08-28", "H-001", 1],
      ["2026-08-28", "H-002", 1],
    ]);
    expect(habitDaysMet(rows, data().habits, "2026-08-26", "2026-08-28")).toBe(2);
  });

  it("servingsEaten sums the negative meal deltas in the window", () => {
    const rows = log([
      ["2026-08-27", "M-001", -1],
      ["2026-08-28", "M-002", -1],
      ["2026-08-28", "H-001", 1],
      ["2026-08-20", "M-001", -1],
    ]);
    expect(servingsEaten(rows, "2026-08-26", "2026-08-28")).toBe(2);
  });
});
