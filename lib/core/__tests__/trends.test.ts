import { describe, expect, it } from "vitest";
import type { DailyData, DailyLogEntry } from "../types";
import { shiftIso } from "../../ui/momentum";
import type { Insights } from "../insights";
import {
  buildLifeTrends,
  habitTrends,
  renderTrendsDigest,
  rhythmTrends,
  slopeOf,
  weekStarts,
} from "../trends";

function log(rows: [string, string, number | "reset"][]): DailyLogEntry[] {
  return rows.map(([date, id, delta]) => ({ date, time: "09:00", id, delta }));
}

function data(partial: Partial<DailyData>): DailyData {
  return { habits: [], rhythms: [], meals: [], groceries: [], log: [], ...partial };
}

const TODAY = "2026-09-03";

describe("weekStarts", () => {
  it("returns Monday-based starts, oldest first, ending in the current week", () => {
    expect(weekStarts(TODAY, 3)).toEqual(["2026-08-17", "2026-08-24", "2026-08-31"]);
  });

  it("crosses a year boundary without losing a week", () => {
    expect(weekStarts("2027-01-05", 2)).toEqual(["2026-12-28", "2027-01-04"]);
  });
});

describe("habitTrends", () => {
  it("counts the days each week the goal was met and marks the current week partial", () => {
    const d = data({
      habits: [{ id: "H-001", name: "Walk", goal: 2 }],
      log: log([
        ["2026-08-24", "H-001", 1],
        ["2026-08-24", "H-001", 1],
        ["2026-08-25", "H-001", 2],
        ["2026-08-26", "H-001", 1],
        ["2026-09-01", "H-001", 2],
        ["2026-09-03", "H-001", 2],
      ]),
    });
    const [walk] = habitTrends(d, TODAY, 2);
    expect(walk.weeks).toEqual([
      { weekStart: "2026-08-24", met: 2, days: 7, partial: false },
      { weekStart: "2026-08-31", met: 2, days: 4, partial: true },
    ]);
    expect(walk.streak).toBe(1);
    expect(walk.lastLogged).toBe("2026-09-03");
    expect(walk.daysSinceLogged).toBe(0);
  });

  it("restarts a day's count after a reset", () => {
    const d = data({
      habits: [{ id: "H-001", name: "Walk", goal: 1 }],
      log: log([
        ["2026-09-02", "H-001", 1],
        ["2026-09-02", "H-001", "reset"],
      ]),
    });
    const [walk] = habitTrends(d, TODAY, 1);
    expect(walk.weeks[0].met).toBe(0);
    expect(walk.daysSinceLogged).toBe(1);
  });

  it("reports a habit that has never been logged", () => {
    const [h] = habitTrends(data({ habits: [{ id: "H-002", name: "Water", goal: 6 }] }), TODAY, 1);
    expect(h.lastLogged).toBeNull();
    expect(h.daysSinceLogged).toBeNull();
    expect(h.streak).toBe(0);
  });
});

describe("slopeOf and adherence windows", () => {
  it("fits a line through weekly values", () => {
    expect(slopeOf([50, 50, 50])).toBe(0);
    expect(slopeOf([0, 10, 20, 30])).toBe(10);
    expect(slopeOf([30, 20, 10, 0])).toBe(-10);
    expect(slopeOf([42])).toBe(0);
    expect(slopeOf([])).toBe(0);
  });

  it("splits complete weeks into the recent four and the ones before, ignoring the partial week", () => {
    const rows: [string, string, number][] = [];
    for (let i = 0; i < 28; i += 1) rows.push([shiftIso(TODAY, -4 - i), "H-001", 1]);
    const d = data({ habits: [{ id: "H-001", name: "Walk", goal: 1 }], log: log(rows) });
    const [walk] = habitTrends(d, TODAY);
    expect(walk.weeks.filter((w) => !w.partial)).toHaveLength(7);
    expect(walk.recent4).toBe(100);
    expect(walk.prior4).toBe(0);
    expect(walk.slope).toBeGreaterThan(0);
  });
});

describe("rhythmTrends", () => {
  it("counts a rhythm per Mon–Sun week against its target", () => {
    const d = data({
      rhythms: [{ id: "R-001", name: "Laundry", per: 2 }],
      log: log([
        ["2026-08-25", "R-001", 1],
        ["2026-08-29", "R-001", 1],
        ["2026-09-02", "R-001", 1],
      ]),
    });
    const [r] = rhythmTrends(d, TODAY, 2);
    expect(r.weeks).toEqual([
      { weekStart: "2026-08-24", count: 2, met: true, partial: false },
      { weekStart: "2026-08-31", count: 1, met: false, partial: true },
    ]);
  });
});

describe("renderTrendsDigest", () => {
  it("renders one line per habit and rhythm over the last four weeks", () => {
    const d = data({
      habits: [{ id: "H-001", name: "Walk", goal: 1 }],
      rhythms: [{ id: "R-001", name: "Laundry", per: 3 }],
      log: log([["2026-09-01", "H-001", 1]]),
    });
    const text = renderTrendsDigest({ habits: habitTrends(d, TODAY), rhythms: rhythmTrends(d, TODAY) });
    const lines = text.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      "H-001 Walk: last 4 wks 0/7 0/7 0/7 1/4* · streak 0 · trend flat · last logged 2d ago",
    );
    expect(lines[1]).toBe("R-001 Laundry: last 4 wks 0/3 0/3 0/3 0/3* (per week)");
  });

  it("puts throughput and stalled charters first when given the whole picture", () => {
    const insights: Insights = {
      weeks: weekStarts(TODAY, 8).map((weekStart, i) => ({ weekStart, done: i, created: 8 - i })),
      perProject: [],
      stalled: [{ slug: "old", name: "Old thing", days: 21 }],
      balance: { projects: 0, areas: 0 },
    };
    const life = buildLifeTrends(data({ habits: [{ id: "H-001", name: "Walk", goal: 1 }] }), insights, TODAY);
    expect(life.weeks).toHaveLength(8);
    expect(life.throughput).toBe(insights.weeks);
    const lines = renderTrendsDigest(life).split("\n");
    expect(lines[0]).toBe("Tasks done/created, last 4 wks: 4/4 5/3 6/2 7/1*");
    expect(lines[1]).toBe("Stalled: Old thing (21d idle)");
    expect(lines[2]).toMatch(/^H-001 Walk/);
  });

  it("caps the number of lines and says how many were cut", () => {
    const habits = Array.from({ length: 12 }, (_, i) => ({
      id: `H-${String(i + 1).padStart(3, "0")}`,
      name: `Habit ${i}`,
      goal: 1,
    }));
    const text = renderTrendsDigest({ habits: habitTrends(data({ habits }), TODAY), rhythms: [] });
    const lines = text.split("\n");
    expect(lines).toHaveLength(11);
    expect(lines[10]).toBe("(+2 more)");
  });

  it("is empty when there is nothing to show", () => {
    expect(renderTrendsDigest({ habits: [], rhythms: [] })).toBe("");
  });
});
