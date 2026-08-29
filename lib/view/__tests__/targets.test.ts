import { describe, expect, it } from "vitest";
import {
  milestoneNames,
  milestonesOf,
  nextTargetId,
  parseMilestoneLine,
  parseTargetLine,
  serializeTargetLine,
  targetsOf,
  targetPct,
  targetProgress,
  toggledScope,
} from "../targets";

describe("parseTargetLine", () => {
  it("reads an open checkbox line", () => {
    expect(parseTargetLine("- [ ] Ship the first clinic")).toEqual({
      index: 0,
      id: null,
      title: "Ship the first clinic",
      by: null,
      done: false,
      milestone: null,
    });
  });

  it("reads a checked line as done", () => {
    expect(parseTargetLine("- [x] Ship the first clinic")?.done).toBe(true);
  });

  it("accepts an uppercase checkbox marker", () => {
    expect(parseTargetLine("- [X] Ship the first clinic")?.done).toBe(true);
  });

  it("accepts a plain bullet with no checkbox", () => {
    expect(parseTargetLine("- Ship the first clinic")).toEqual({
      index: 0,
      id: null,
      title: "Ship the first clinic",
      by: null,
      done: false,
      milestone: null,
    });
  });

  it("accepts a bare line with no bullet", () => {
    expect(parseTargetLine("Ship the first clinic")?.title).toBe("Ship the first clinic");
  });

  it("splits a trailing em-dash by clause", () => {
    expect(parseTargetLine("- [ ] Walk 300 km — by 31 DEC")).toEqual({
      index: 0,
      id: null,
      title: "Walk 300 km",
      by: "31 DEC",
      done: false,
      milestone: null,
    });
  });

  it("splits a trailing double-hyphen by clause", () => {
    expect(parseTargetLine("- [ ] Walk 300 km -- by 31 DEC")?.by).toBe("31 DEC");
  });

  it("matches the by clause case-insensitively", () => {
    expect(parseTargetLine("- [ ] Walk 300 km — BY 31 DEC")?.by).toBe("31 DEC");
  });

  it("keeps an em dash that is not a by clause in the title", () => {
    const target = parseTargetLine("- [ ] Walk 300 km — the long game");
    expect(target?.title).toBe("Walk 300 km — the long game");
    expect(target?.by).toBeNull();
  });

  it("carries the index through", () => {
    expect(parseTargetLine("- [ ] Third one", 2)?.index).toBe(2);
  });

  it("returns null for blank lines and marker-only lines", () => {
    expect(parseTargetLine("")).toBeNull();
    expect(parseTargetLine("   ")).toBeNull();
    expect(parseTargetLine("- [ ]")).toBeNull();
  });
});

describe("serializeTargetLine", () => {
  it("round-trips an open target with a date", () => {
    const line = "- [ ] Walk 300 km — by 31 DEC";
    const parsed = parseTargetLine(line);
    expect(parsed).not.toBeNull();
    expect(serializeTargetLine(parsed!)).toBe(line);
  });

  it("round-trips a done target without a date", () => {
    const line = "- [x] Repairs cleared";
    expect(serializeTargetLine(parseTargetLine(line)!)).toBe(line);
  });

  it("normalises a plain bullet into checkbox form", () => {
    expect(serializeTargetLine(parseTargetLine("- Ship it")!)).toBe("- [ ] Ship it");
  });
});

describe("targetsOf", () => {
  it("skips unparseable lines and indexes against the original scope", () => {
    const scope = ["- [ ] First", "", "- [x] Second — by SEP"];
    const targets = targetsOf(scope);
    expect(targets).toHaveLength(2);
    expect(targets[0].index).toBe(0);
    expect(targets[1].index).toBe(2);
    expect(targets[1].by).toBe("SEP");
  });
});

describe("targetPct", () => {
  it("is 100 when done and 0 when open", () => {
    expect(targetPct({ id: null, done: true })).toBe(100);
    expect(targetPct({ id: null, done: false })).toBe(0);
  });
});

describe("target ids", () => {
  it("reads a G- id prefix off the line", () => {
    const t = parseTargetLine("- [ ] G-007 | Audit the recovery plans — by 30 SEP");
    expect(t?.id).toBe("G-007");
    expect(t?.title).toBe("Audit the recovery plans");
    expect(t?.by).toBe("30 SEP");
  });

  it("leaves a line without an id usable, just unlinkable", () => {
    expect(parseTargetLine("- [ ] Legacy target")?.id).toBeNull();
  });

  it("does not mistake a pipe in the title for an id", () => {
    const t = parseTargetLine("- [ ] Ship A | B");
    expect(t?.id).toBeNull();
    expect(t?.title).toBe("Ship A | B");
  });

  it("round-trips a line that carries an id", () => {
    const line = "- [x] G-012 | Produce the fix list — by 30 SEP";
    expect(serializeTargetLine(parseTargetLine(line)!)).toBe(line);
  });

  it("mints the next id from the highest present, not the count", () => {
    expect(nextTargetId([])).toBe("G-001");
    expect(nextTargetId(["- [ ] G-001 | A", "- [ ] G-004 | B"])).toBe("G-005");
    expect(nextTargetId(["- [ ] no id here"])).toBe("G-001");
  });
});

describe("milestones", () => {
  const scope = [
    "### M1 — Prove it works",
    "- [ ] G-001 | First",
    "- [x] G-002 | Second",
    "### M2 — Scale it",
    "- [ ] G-003 | Third",
  ];

  it("reads a heading name", () => {
    expect(parseMilestoneLine("### M1 — Prove it works")).toBe("M1 — Prove it works");
    expect(parseMilestoneLine("- [ ] not a heading")).toBeNull();
  });

  it("never treats a heading as a target", () => {
    expect(targetsOf(scope).map((t) => t.title)).toEqual(["First", "Second", "Third"]);
  });

  it("tags each target with the heading above it", () => {
    expect(targetsOf(scope).map((t) => t.milestone)).toEqual([
      "M1 — Prove it works",
      "M1 — Prove it works",
      "M2 — Scale it",
    ]);
  });

  it("keeps indices pointing at the raw array despite headings", () => {
    const targets = targetsOf(scope);
    expect(targets.map((t) => t.index)).toEqual([1, 2, 4]);
    expect(toggledScope(scope, targets[2].index, true)[4]).toBe("- [x] G-003 | Third");
  });

  it("groups into milestones in document order", () => {
    const groups = milestonesOf(scope);
    expect(groups.map((g) => g.name)).toEqual(["M1 — Prove it works", "M2 — Scale it"]);
    expect(groups[0].targets).toHaveLength(2);
  });

  it("puts targets before the first heading in an unnamed leading group", () => {
    const groups = milestonesOf(["- [ ] G-001 | Loose", "### M1", "- [ ] G-002 | Grouped"]);
    expect(groups.map((g) => g.name)).toEqual([null, "M1"]);
  });

  it("lists heading names once each", () => {
    expect(milestoneNames(scope)).toEqual(["M1 — Prove it works", "M2 — Scale it"]);
  });
});

describe("targetProgress", () => {
  const tasks = [
    { target: "G-001", done: true },
    { target: "G-001", done: false },
    { target: "G-001", done: false },
    { target: "G-002", done: true },
    { done: false },
  ];

  it("counts the tasks that name the target", () => {
    expect(targetProgress({ id: "G-001", done: false }, tasks)).toEqual({
      pct: 33,
      done: 1,
      total: 3,
      binary: false,
    });
  });

  it("falls back to the tick when nothing is linked", () => {
    expect(targetProgress({ id: "G-009", done: true }, tasks)).toEqual({
      pct: 100,
      done: 0,
      total: 0,
      binary: true,
    });
  });

  it("treats an id-less target as binary", () => {
    expect(targetProgress({ id: null, done: false }, tasks).binary).toBe(true);
  });

  it("reports 100 percent without closing the target", () => {
    const done = targetProgress({ id: "G-002", done: false }, tasks);
    expect(done.pct).toBe(100);
    expect(done.binary).toBe(false);
  });
});

describe("resilience", () => {
  it("never throws on junk, so loadWorkspace survives a bad charter", () => {
    const junk = ["###", "- [ ]", "|||", "   ", "- [ ] G-00 | short id stays in the title"];
    expect(() => targetsOf(junk)).not.toThrow();
    expect(() => milestonesOf(junk)).not.toThrow();
    expect(() => nextTargetId(junk)).not.toThrow();
  });

  it("keeps a too-short id in the title rather than accepting it", () => {
    const t = parseTargetLine("- [ ] G-00 | short id stays in the title");
    expect(t?.id).toBeNull();
    expect(t?.title).toBe("G-00 | short id stays in the title");
  });
});

describe("toggledScope", () => {
  it("ticks only the target at the given index", () => {
    const scope = ["- [ ] First", "- [ ] Second"];
    expect(toggledScope(scope, 1, true)).toEqual(["- [ ] First", "- [x] Second"]);
  });

  it("unticks a done target and keeps its date", () => {
    expect(toggledScope(["- [x] Walk 300 km — by 31 DEC"], 0, false)).toEqual([
      "- [ ] Walk 300 km — by 31 DEC",
    ]);
  });

  it("leaves other lines byte-identical", () => {
    const scope = ["  odd   spacing kept", "- [ ] Second"];
    expect(toggledScope(scope, 1, true)[0]).toBe("  odd   spacing kept");
  });

  it("is a no-op for an out-of-range index", () => {
    const scope = ["- [ ] First"];
    expect(toggledScope(scope, 5, true)).toEqual(scope);
  });
});
