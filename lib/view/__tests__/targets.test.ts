import { describe, expect, it } from "vitest";
import {
  parseTargetLine,
  serializeTargetLine,
  targetsOf,
  targetPct,
  toggledScope,
} from "../targets";

describe("parseTargetLine", () => {
  it("reads an open checkbox line", () => {
    expect(parseTargetLine("- [ ] Ship the first clinic")).toEqual({
      index: 0,
      title: "Ship the first clinic",
      by: null,
      done: false,
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
      title: "Ship the first clinic",
      by: null,
      done: false,
    });
  });

  it("accepts a bare line with no bullet", () => {
    expect(parseTargetLine("Ship the first clinic")?.title).toBe("Ship the first clinic");
  });

  it("splits a trailing em-dash by clause", () => {
    expect(parseTargetLine("- [ ] Walk 300 km — by 31 DEC")).toEqual({
      index: 0,
      title: "Walk 300 km",
      by: "31 DEC",
      done: false,
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
    expect(targetPct({ done: true })).toBe(100);
    expect(targetPct({ done: false })).toBe(0);
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
