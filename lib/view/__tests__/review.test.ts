import { describe, expect, it } from "vitest";
import {
  closedSince,
  daysAgo,
  journalStreak,
  momentumChart,
  movedFronts,
  openSplit,
  openedSince,
  weekDeltas,
  type Closable,
} from "../review";

const TODAY = "2026-08-29";

const card = (p: Partial<Closable> = {}): Closable => ({ done: false, ...p });

describe("daysAgo", () => {
  it("walks back day by day and across a month boundary", () => {
    expect(daysAgo(TODAY, 0)).toBe("2026-08-29");
    expect(daysAgo(TODAY, 7)).toBe("2026-08-22");
    expect(daysAgo("2026-09-03", 7)).toBe("2026-08-27");
  });
});

describe("closedSince / openedSince", () => {
  const cards = [
    card({ done: true, doneDate: "2026-08-28" }),
    card({ done: true, doneDate: "2026-08-20" }),
    card({ created: "2026-08-27" }),
    card({ created: "2026-08-10" }),
    card({ done: true, created: "2026-08-27", doneDate: "2026-08-28" }),
  ];

  it("counts only cards closed on or after the boundary", () => {
    expect(closedSince(cards, "2026-08-22")).toBe(2);
  });

  it("counts cards opened in the window that are still open", () => {
    expect(openedSince(cards, "2026-08-22")).toBe(1);
  });

  it("includes the boundary date itself", () => {
    expect(closedSince([card({ done: true, doneDate: "2026-08-22" })], "2026-08-22")).toBe(1);
  });
});

describe("journalStreak", () => {
  it("counts back from today when today has an entry", () => {
    expect(journalStreak(["2026-08-29", "2026-08-28", "2026-08-27"], TODAY)).toBe(3);
  });

  it("forgives a missing entry today but not a gap yesterday", () => {
    expect(journalStreak(["2026-08-28", "2026-08-27"], TODAY)).toBe(2);
    expect(journalStreak(["2026-08-27"], TODAY)).toBe(0);
  });

  it("stops at the first gap rather than counting total days", () => {
    expect(journalStreak(["2026-08-29", "2026-08-28", "2026-08-25"], TODAY)).toBe(2);
  });

  it("is zero with no entries and respects the cap", () => {
    expect(journalStreak([], TODAY)).toBe(0);
    const everyDay = Array.from({ length: 40 }, (_, i) => daysAgo(TODAY, i));
    expect(journalStreak(everyDay, TODAY, 5)).toBe(5);
  });
});

describe("movedFronts", () => {
  it("drops fronts with nothing closed and sorts busiest first", () => {
    const fronts = [
      { name: "Quiet", color: "#1", cards: [card({ done: true, doneDate: "2026-08-01" })] },
      { name: "Busy", color: "#2", cards: [
        card({ done: true, doneDate: "2026-08-28" }),
        card({ done: true, doneDate: "2026-08-27" }),
      ] },
      { name: "Some", color: "#3", cards: [card({ done: true, doneDate: "2026-08-28" })] },
    ];
    expect(movedFronts(fronts, "2026-08-22")).toEqual([
      { name: "Busy", color: "#2", done: 2 },
      { name: "Some", color: "#3", done: 1 },
    ]);
  });

  it("breaks a tie on name so the order is stable", () => {
    const one = card({ done: true, doneDate: "2026-08-28" });
    const fronts = [
      { name: "Zeta", color: "#1", cards: [one] },
      { name: "Alpha", color: "#2", cards: [one] },
    ];
    expect(movedFronts(fronts, "2026-08-22").map((f) => f.name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("weekDeltas", () => {
  it("compares the last seven days against the seven before", () => {
    const projects = [
      {
        name: "Up",
        color: "#1",
        cards: [
          card({ done: true, doneDate: "2026-08-28" }),
          card({ done: true, doneDate: "2026-08-27" }),
          card({ done: true, doneDate: "2026-08-18" }),
        ],
      },
      {
        name: "Down",
        color: "#2",
        cards: [
          card({ done: true, doneDate: "2026-08-18" }),
          card({ done: true, doneDate: "2026-08-17" }),
        ],
      },
    ];
    expect(weekDeltas(projects, TODAY).map((p) => p.delta)).toEqual([1, -2]);
  });

  it("is zero when both windows are empty, and keeps the other fields", () => {
    const out = weekDeltas([{ name: "Idle", color: "#1", cards: [] }], TODAY);
    expect(out[0]).toMatchObject({ name: "Idle", color: "#1", delta: 0 });
  });
});

describe("momentumChart", () => {
  const weeks = [
    { weekStart: "2026-08-03", done: 2 },
    { weekStart: "2026-08-10", done: 4 },
    { weekStart: "2026-08-17", done: 8 },
  ];

  it("puts the first point at the left edge and the last at the right", () => {
    const c = momentumChart(weeks);
    expect(c.pts[0][0]).toBe(12);
    expect(c.pts[2][0]).toBe(288);
  });

  it("puts the tallest week at the top of the band and scales the rest", () => {
    const c = momentumChart(weeks);
    expect(c.pts[2][1]).toBe(14);
    expect(c.pts[0][1]).toBeGreaterThan(c.pts[1][1]);
  });

  it("closes the area path back along the baseline", () => {
    expect(momentumChart(weeks).area.endsWith("L288 100 L12 100 Z")).toBe(true);
  });

  it("reports the week-over-week percentage", () => {
    expect(momentumChart(weeks).deltaLabel).toContain("+100%");
  });

  it("falls back to a plain count when the previous week was zero", () => {
    expect(
      momentumChart([{ weekStart: "2026-08-10", done: 0 }, { weekStart: "2026-08-17", done: 3 }])
        .deltaLabel,
    ).toBe("3 DONE THIS WEEK");
  });

  it("survives an empty series and a single week without dividing by zero", () => {
    expect(momentumChart([]).pts).toEqual([]);
    expect(momentumChart([]).area).toBe("");
    const one = momentumChart([{ weekStart: "2026-08-17", done: 5 }]);
    expect(one.pts).toHaveLength(1);
    expect(Number.isFinite(one.pts[0][0])).toBe(true);
  });

  it("treats an all-zero series as flat rather than NaN", () => {
    const flat = momentumChart([
      { weekStart: "2026-08-10", done: 0 },
      { weekStart: "2026-08-17", done: 0 },
    ]);
    expect(flat.pts.every(([, y]) => y === 100)).toBe(true);
  });
});

describe("openSplit", () => {
  const charters = [
    { name: "A", color: "#1", open: 5 },
    { name: "B", color: "#2", open: 3 },
    { name: "C", color: "#3", open: 2 },
    { name: "Empty", color: "#4", open: 0 },
  ];

  it("drops charters with nothing open and orders busiest first", () => {
    expect(openSplit(charters).map((s) => s.name)).toEqual(["A", "B", "C"]);
  });

  it("computes percentages of the open total", () => {
    expect(openSplit(charters).map((s) => s.pct)).toEqual([50, 30, 20]);
  });

  it("offsets each arc by the ones before it so they do not overlap", () => {
    const [a, b, c] = openSplit(charters);
    expect(Number(a.offset)).toBe(0);
    expect(Number(b.offset)).toBeCloseTo(-119.38, 1);
    expect(Number(c.offset)).toBeCloseTo(-190.99, 1);
  });

  it("caps the number of slices", () => {
    expect(openSplit(charters, 2)).toHaveLength(2);
  });

  it("returns nothing when everything is closed", () => {
    expect(openSplit([{ name: "A", color: "#1", open: 0 }])).toEqual([]);
  });
});
