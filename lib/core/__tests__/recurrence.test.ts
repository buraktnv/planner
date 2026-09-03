import { describe, expect, it } from "vitest";
import {
  advancedAnchor,
  daysUntil,
  isEventRepeat,
  isSurfaced,
  nextOccurrence,
  occurrencesBetween,
  surfaceDate,
} from "../recurrence";

describe("nextOccurrence", () => {
  it("returns the anchor for an event that does not repeat, even when it has passed", () => {
    expect(nextOccurrence({ date: "2026-01-05" }, "2026-09-03")).toBe("2026-01-05");
    expect(nextOccurrence({ date: "2026-12-05" }, "2026-09-03")).toBe("2026-12-05");
  });

  it("returns a future anchor as-is for a repeating event", () => {
    expect(nextOccurrence({ date: "2026-12-05", repeat: "yearly" }, "2026-09-03")).toBe(
      "2026-12-05",
    );
  });

  it("counts today as an occurrence", () => {
    expect(nextOccurrence({ date: "1990-09-03", repeat: "yearly" }, "2026-09-03")).toBe(
      "2026-09-03",
    );
  });

  it("finds the next birthday from a past anchor, this year or next", () => {
    expect(nextOccurrence({ date: "1990-03-04", repeat: "yearly" }, "2026-09-03")).toBe(
      "2027-03-04",
    );
    expect(nextOccurrence({ date: "1990-11-04", repeat: "yearly" }, "2026-09-03")).toBe(
      "2026-11-04",
    );
  });

  it("clamps a Feb 29 anchor on non-leap years and restores it on leap years", () => {
    expect(nextOccurrence({ date: "2024-02-29", repeat: "yearly" }, "2027-01-10")).toBe(
      "2027-02-28",
    );
    expect(nextOccurrence({ date: "2024-02-29", repeat: "yearly" }, "2027-03-01")).toBe(
      "2028-02-29",
    );
  });

  it("clamps a monthly anchor on the 31st to the month's length", () => {
    expect(nextOccurrence({ date: "2026-01-31", repeat: "monthly" }, "2026-09-03")).toBe(
      "2026-09-30",
    );
    expect(nextOccurrence({ date: "2026-01-31", repeat: "monthly" }, "2027-02-01")).toBe(
      "2027-02-28",
    );
    expect(nextOccurrence({ date: "2026-01-15", repeat: "monthly" }, "2026-12-20")).toBe(
      "2027-01-15",
    );
  });

  it("steps a weekly anchor in sevens across month ends", () => {
    expect(nextOccurrence({ date: "2026-08-24", repeat: "weekly" }, "2026-09-03")).toBe(
      "2026-09-07",
    );
    expect(nextOccurrence({ date: "2026-08-24", repeat: "weekly" }, "2026-09-07")).toBe(
      "2026-09-07",
    );
  });
});

describe("occurrencesBetween", () => {
  it("returns the anchor once when it falls in range and nothing otherwise", () => {
    expect(occurrencesBetween({ date: "2026-09-10" }, "2026-09-01", "2026-09-30")).toEqual([
      "2026-09-10",
    ]);
    expect(occurrencesBetween({ date: "2026-10-10" }, "2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("lists every weekly occurrence in a three-week window", () => {
    expect(
      occurrencesBetween({ date: "2026-08-24", repeat: "weekly" }, "2026-08-31", "2026-09-20"),
    ).toEqual(["2026-08-31", "2026-09-07", "2026-09-14"]);
  });

  it("is empty for an inverted range", () => {
    expect(
      occurrencesBetween({ date: "2026-08-24", repeat: "weekly" }, "2026-09-20", "2026-08-31"),
    ).toEqual([]);
  });
});

describe("lead windows", () => {
  it("surfaces an event lead days before it occurs and not earlier", () => {
    const event = { date: "2026-09-24", lead: 21 };
    expect(surfaceDate(event, "2026-09-24")).toBe("2026-09-03");
    expect(isSurfaced(event, "2026-09-02")).toBe(false);
    expect(isSurfaced(event, "2026-09-03")).toBe(true);
    expect(isSurfaced(event, "2026-09-24")).toBe(true);
  });

  it("surfaces an event without a lead only on the day", () => {
    expect(isSurfaced({ date: "2026-09-24" }, "2026-09-23")).toBe(false);
    expect(isSurfaced({ date: "2026-09-24" }, "2026-09-24")).toBe(true);
  });

  it("applies the lead to the next occurrence of a repeating event", () => {
    const birthday = { date: "1990-03-04", repeat: "yearly" as const, lead: 7 };
    expect(isSurfaced(birthday, "2027-02-24")).toBe(false);
    expect(isSurfaced(birthday, "2027-02-25")).toBe(true);
  });

  it("counts days until an occurrence, negative when passed", () => {
    expect(daysUntil("2026-09-24", "2026-09-03")).toBe(21);
    expect(daysUntil("2026-09-01", "2026-09-03")).toBe(-2);
  });
});

describe("advancedAnchor", () => {
  it("moves a repeating event to the occurrence after the next one", () => {
    expect(advancedAnchor({ date: "1990-09-03", repeat: "yearly" }, "2026-09-03")).toBe(
      "2027-09-03",
    );
    expect(advancedAnchor({ date: "2026-09-07", repeat: "weekly" }, "2026-09-03")).toBe(
      "2026-09-14",
    );
    expect(advancedAnchor({ date: "2026-01-31", repeat: "monthly" }, "2026-09-03")).toBe(
      "2026-10-31",
    );
  });

  it("leaves a non-repeating event where it is", () => {
    expect(advancedAnchor({ date: "2026-09-03" }, "2026-09-03")).toBe("2026-09-03");
  });
});

describe("isEventRepeat", () => {
  it("accepts only the three cadences", () => {
    expect(isEventRepeat("yearly")).toBe(true);
    expect(isEventRepeat("daily")).toBe(false);
    expect(isEventRepeat(7)).toBe(false);
  });
});
