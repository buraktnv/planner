import { describe, expect, it } from "vitest";
import {
  anchorOn,
  autoLayout,
  boundsOf,
  centreOf,
  clampZoom,
  DEFAULT_GRID,
  edgePath,
  fitTo,
  slotOf,
  snapToSlot,
  toCanvas,
  zoomAbout,
  type Placeable,
  type Point,
} from "../canvas-layout";

const G = DEFAULT_GRID;
const node = (id: string, groupKey: string | null = null, order = 0): Placeable => ({
  id,
  groupKey,
  order,
});
const saved = (entries: [string, Point][] = []) => new Map(entries);

describe("slotOf / snapToSlot", () => {
  it("walks across the row then wraps", () => {
    expect(slotOf(0)).toEqual({ x: 0, y: 0 });
    expect(slotOf(1)).toEqual({ x: G.colW + G.gap, y: 0 });
    expect(slotOf(G.cols)).toEqual({ x: 0, y: G.rowH + G.gap });
  });

  it("round-trips a slot through its point", () => {
    for (const i of [0, 1, 3, 4, 7, 11]) {
      expect(snapToSlot(slotOf(i))).toBe(i);
    }
  });

  it("clamps a point outside the grid rather than returning a negative slot", () => {
    expect(snapToSlot({ x: -900, y: -900 })).toBe(0);
    expect(snapToSlot({ x: 99999, y: 0 })).toBe(G.cols - 1);
  });
});

describe("autoLayout", () => {
  it("is deterministic — same input, deep-equal output", () => {
    const nodes = [node("K-003", "a", 3), node("K-001", "a", 1), node("K-002", "b", 2)];
    const a = autoLayout(nodes, saved());
    const b = autoLayout(nodes, saved());
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("does not depend on the order of the input array", () => {
    const nodes = [node("K-001", "a", 1), node("K-002", "a", 2), node("K-003", "a", 3)];
    const forward = autoLayout(nodes, saved());
    const shuffled = autoLayout([nodes[2], nodes[0], nodes[1]], saved());
    expect([...shuffled.entries()].sort()).toEqual([...forward.entries()].sort());
  });

  it("orders within a band by order, then by id", () => {
    const nodes = [node("K-002", "a", 1), node("K-001", "a", 1), node("K-003", "a", 0)];
    const out = autoLayout(nodes, saved());
    expect(out.get("K-003")).toEqual(slotOf(0));
    expect(out.get("K-001")).toEqual(slotOf(1));
    expect(out.get("K-002")).toEqual(slotOf(2));
  });

  it("returns nothing for a node that already has a position", () => {
    const nodes = [node("K-001", "a"), node("K-002", "a")];
    const out = autoLayout(nodes, saved([["K-001", { x: 999, y: 999 }]]));
    expect(out.has("K-001")).toBe(false);
    expect(out.has("K-002")).toBe(true);
  });

  it("gives way to a saved card sitting in a computed slot", () => {
    const nodes = [node("K-001", "a", 1), node("K-002", "a", 2)];
    // K-001 is parked exactly on slot 0, so K-002 must not be placed there.
    const out = autoLayout(nodes, saved([["K-001", slotOf(0)]]));
    expect(out.get("K-002")).toEqual(slotOf(1));
  });

  it("never moves a node that is already placed when another is added", () => {
    const first = autoLayout([node("K-001", "a", 1)], saved());
    const withMore = autoLayout([node("K-001", "a", 1), node("K-002", "a", 2)], saved());
    expect(withMore.get("K-001")).toEqual(first.get("K-001"));
  });

  it("separates bands vertically and puts the ungrouped band last", () => {
    const nodes = [node("K-001", null, 1), node("K-002", "alpha", 2)];
    const out = autoLayout(nodes, saved());
    expect(out.get("K-002")!.y).toBeLessThan(out.get("K-001")!.y);
  });

  it("keeps bands in first-appearance order", () => {
    const nodes = [node("K-001", "zeta"), node("K-002", "alpha")];
    const out = autoLayout(nodes, saved());
    expect(out.get("K-001")!.y).toBeLessThan(out.get("K-002")!.y);
  });

  it("handles an empty input and an all-saved input", () => {
    expect(autoLayout([], saved()).size).toBe(0);
    expect(autoLayout([node("K-001")], saved([["K-001", { x: 1, y: 2 }]])).size).toBe(0);
  });
});

describe("boundsOf", () => {
  it("wraps every rect", () => {
    expect(
      boundsOf([
        { x: 10, y: 10, w: 100, h: 50 },
        { x: 200, y: 0, w: 40, h: 200 },
      ]),
    ).toEqual({ x: 10, y: 0, w: 230, h: 200 });
  });

  it("is empty for no rects", () => {
    expect(boundsOf([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("anchorOn", () => {
  const r = { x: 0, y: 0, w: 100, h: 100 };

  it("meets the right edge for a point to the right", () => {
    expect(anchorOn(r, { x: 500, y: 50 })).toEqual({ x: 100, y: 50 });
  });

  it("meets the bottom edge for a point below", () => {
    expect(anchorOn(r, { x: 50, y: 500 })).toEqual({ x: 50, y: 100 });
  });

  it("lands on a corner on the diagonal", () => {
    expect(anchorOn(r, { x: 600, y: 600 })).toEqual({ x: 100, y: 100 });
  });

  it("returns the centre when asked about its own centre", () => {
    expect(anchorOn(r, centreOf(r))).toEqual({ x: 50, y: 50 });
  });

  it("always lands on the border, never inside", () => {
    for (const toward of [
      { x: 300, y: 20 },
      { x: -300, y: 400 },
      { x: 51, y: -900 },
    ]) {
      const p = anchorOn(r, toward);
      const onEdge = p.x === 0 || p.x === 100 || p.y === 0 || p.y === 100;
      expect(onEdge).toBe(true);
    }
  });
});

describe("edgePath", () => {
  it("starts and ends on the two cards' borders, not their centres", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 400, y: 0, w: 100, h: 100 };
    expect(edgePath(a, b)).toBe("M100.0 50.0 C220.0 50.0 280.0 50.0 400.0 50.0");
  });

  it("bows vertically when the cards are stacked", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 0, y: 400, w: 100, h: 100 };
    expect(edgePath(a, b)).toContain("M50.0 100.0");
  });
});

describe("viewport maths", () => {
  it("converts a screen point to canvas space", () => {
    expect(toCanvas({ x: 120, y: 60 }, { tx: 20, ty: 10, k: 2 })).toEqual({ x: 50, y: 25 });
  });

  it("accounts for the element's offset on the page", () => {
    expect(
      toCanvas({ x: 220, y: 160 }, { tx: 20, ty: 10, k: 2 }, { x: 100, y: 100 }),
    ).toEqual({ x: 50, y: 25 });
  });

  it("holds the point under the cursor still while zooming", () => {
    const vp = { tx: 0, ty: 0, k: 1 };
    const cursor = { x: 300, y: 200 };
    const before = toCanvas(cursor, vp);
    const after = zoomAbout(vp, cursor, 1.5);
    const stillThere = toCanvas(cursor, after);
    expect(stillThere.x).toBeCloseTo(before.x, 6);
    expect(stillThere.y).toBeCloseTo(before.y, 6);
  });

  it("clamps zoom at both ends", () => {
    expect(clampZoom(99)).toBe(2.5);
    expect(clampZoom(0.0001)).toBe(0.2);
    expect(zoomAbout({ tx: 0, ty: 0, k: 2.5 }, { x: 0, y: 0 }, 4).k).toBe(2.5);
  });

  it("fits bounds into the viewport without zooming past 1", () => {
    const fit = fitTo({ x: 0, y: 0, w: 100, h: 100 }, 1000, 1000);
    expect(fit.k).toBe(1);
    const shrink = fitTo({ x: 0, y: 0, w: 4000, h: 100 }, 1000, 1000);
    expect(shrink.k).toBeLessThan(1);
  });

  it("does not divide by zero on empty bounds", () => {
    expect(fitTo({ x: 0, y: 0, w: 0, h: 0 }, 800, 600).k).toBe(1);
  });
});
