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
  TASK_CHIP_H,
  TASK_CHIP_W,
  cellKey,
  cellsCovered,
  fanOut,
  packAround,
  ringSlots,
  type Placeable,
  type Point,
  type Rect,
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

const CORE: Rect = { x: 0, y: 0, w: 360, h: 240 };

function sat(id: string, over: Partial<Placeable> = {}): Placeable {
  return { id, groupKey: null, order: 0, ...over };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("cellKey", () => {
  it("keeps a negative coordinate in a negative cell rather than clamping", () => {
    expect(cellKey({ x: -10, y: -10 })).toBe("-1,-1");
    expect(cellKey({ x: -1000, y: 0 })).not.toBe(cellKey({ x: 0, y: 0 }));
  });

  it("puts the origin in cell 0,0", () => {
    expect(cellKey({ x: 0, y: 0 })).toBe("0,0");
  });
});

describe("cellsCovered", () => {
  it("gives a default-sized card exactly one cell", () => {
    expect(cellsCovered({ x: 0, y: 0, w: G.colW, h: G.rowH })).toEqual(["0,0"]);
  });

  it("gives an enlarged card every cell it overlaps -- the regression", () => {
    const cells = cellsCovered({ x: 0, y: 0, w: 720, h: 400 });
    expect(cells.length).toBeGreaterThanOrEqual(9);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("claims negative columns for a card left of the origin, never column 0", () => {
    const cells = cellsCovered({ x: -300, y: 0, w: 100, h: 100 });
    expect(cells).toContain("-2,0");
    expect(cells).not.toContain("0,0");
  });

  it("spans both cells when a card straddles a boundary", () => {
    const pitch = DEFAULT_GRID.colW + DEFAULT_GRID.gap;
    expect(cellsCovered({ x: pitch - 10, y: 0, w: 20, h: 10 })).toEqual(["0,0", "1,0"]);
  });

  it("never returns nothing, even for a degenerate rect", () => {
    expect(cellsCovered({ x: 0, y: 0, w: 0, h: 0 })).toEqual(["0,0"]);
  });
});

describe("ringSlots", () => {
  const opts = { r0: 300, dr: 180, perRing: 8 };

  it("is empty for a zero count", () => {
    expect(ringSlots(0, opts)).toEqual([]);
  });

  it("returns exactly the count asked for", () => {
    expect(ringSlots(19, opts)).toHaveLength(19);
  });

  it("is deterministic", () => {
    expect(ringSlots(30, opts)).toEqual(ringSlots(30, opts));
  });

  it("returns integers, because positions are stored as integers", () => {
    for (const p of ringSlots(30, opts)) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });

  it("puts the first card directly above the centre", () => {
    const [first] = ringSlots(1, opts);
    expect(first.x).toBe(0);
    expect(first.y).toBe(-300);
  });

  it("pushes later rings further out than the first", () => {
    const slots = ringSlots(40, opts);
    const r = (p: Point) => Math.hypot(p.x, p.y);
    expect(r(slots[slots.length - 1])).toBeGreaterThan(r(slots[0]));
  });
});

describe("packAround", () => {
  it("returns nothing for a satellite that already has a position", () => {
    const saved = new Map([["K-001", { x: 999, y: 999, w: G.colW, h: G.rowH }]]);
    expect(packAround(CORE, [sat("K-001")], saved).has("K-001")).toBe(false);
  });

  it("places every unsaved satellite", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `K-${100 + i}`);
    const out = packAround(CORE, ids.map((id) => sat(id)), new Map());
    expect([...out.keys()].sort()).toEqual([...ids].sort());
  });

  it("never places a satellite on a cell the core covers", () => {
    const coreCells = new Set(cellsCovered(CORE));
    const out = packAround(
      CORE,
      Array.from({ length: 20 }, (_, i) => sat(`K-${100 + i}`)),
      new Map(),
    );
    for (const p of out.values()) {
      const cells = cellsCovered({ ...p, w: G.colW, h: G.rowH });
      for (const c of cells) expect(coreCells.has(c)).toBe(false);
    }
  });

  it("never places a satellite under a saved OVERSIZED card", () => {
    const big = { x: 400, y: -100, w: 720, h: 400 };
    const saved = new Map([["K-BIG", big]]);
    const sats = [sat("K-BIG"), ...Array.from({ length: 16 }, (_, i) => sat(`K-${100 + i}`))];
    const out = packAround(CORE, sats, saved);
    for (const p of out.values()) {
      expect(overlaps({ ...p, w: G.colW, h: G.rowH }, big)).toBe(false);
    }
  });

  it("does not depend on the order of the input array", () => {
    const ids = Array.from({ length: 15 }, (_, i) => `K-${100 + i}`);
    const forward = packAround(CORE, ids.map((id) => sat(id)), new Map());
    const backward = packAround(CORE, [...ids].reverse().map((id) => sat(id)), new Map());
    expect([...forward.entries()].sort()).toEqual([...backward.entries()].sort());
  });

  it("honours order before id", () => {
    const out = packAround(
      CORE,
      [sat("K-999", { order: 0 }), sat("K-001", { order: 5 })],
      new Map(),
    );
    const first = ringSlots(1, {
      r0: Math.round(Math.max(CORE.w, CORE.h) / 2 + Math.max(G.colW, G.rowH) * 0.8 + G.gap),
      dr: G.rowH + G.gap * 2,
      perRing: 8,
    })[0];
    expect(out.get("K-999")).toEqual({
      x: Math.round(CORE.x + CORE.w / 2 + first.x - G.colW / 2),
      y: Math.round(CORE.y + CORE.h / 2 + first.y - G.rowH / 2),
    });
  });

  it("lays out 40 satellites with no two overlapping", () => {
    const sats = Array.from({ length: 40 }, (_, i) => sat(`K-${100 + i}`));
    const out = packAround(CORE, sats, new Map());
    const rects = [...out.values()].map((p) => ({ ...p, w: G.colW, h: G.rowH }));
    expect(rects).toHaveLength(40);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it("respects a satellite's own size when claiming space", () => {
    const sats = [sat("K-100", { w: 700, h: 420 }), ...Array.from({ length: 10 }, (_, i) => sat(`K-${200 + i}`))];
    const out = packAround(CORE, sats, new Map());
    const rects = [...out.entries()].map(([id, at]) => {
      const found = sats.find((x) => x.id === id)!;
      return { ...at, w: found.w ?? G.colW, h: found.h ?? G.rowH };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i], rects[j])).toBe(false);
      }
    }
  });

  it("treats a satellite with no size as one default cell", () => {
    const a = packAround(CORE, [sat("K-100")], new Map());
    const b = packAround(CORE, [sat("K-100", { w: G.colW, h: G.rowH })], new Map());
    expect(a).toEqual(b);
  });

  it("returns integer positions", () => {
    const out = packAround(CORE, [sat("K-100"), sat("K-101")], new Map());
    for (const p of out.values()) {
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
    }
  });
});

describe("fanOut", () => {
  const anchor = { x: 0, y: 0, w: 240, h: 132 };

  it("is deterministic", () => {
    expect(fanOut(anchor, 5, 2)).toEqual(fanOut(anchor, 5, 2));
  });

  it("returns integers", () => {
    const p = fanOut(anchor, 5, 2);
    expect(Number.isInteger(p.x)).toBe(true);
    expect(Number.isInteger(p.y)).toBe(true);
  });

  it("puts a lone chip level with the card's middle", () => {
    const p = fanOut(anchor, 1, 0);
    expect(p.y).toBe(Math.round(anchor.h / 2 - TASK_CHIP_H / 2));
    expect(p.x).toBeGreaterThan(anchor.w);
  });

  it("spreads chips apart rather than stacking them", () => {
    const a = fanOut(anchor, 4, 0);
    const b = fanOut(anchor, 4, 3);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(TASK_CHIP_H);
  });

  it("survives a count of zero without dividing by it", () => {
    const p = fanOut(anchor, 0, 0);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
  });

  it("keeps every chip clear of the card it fans from", () => {
    for (let i = 0; i < 6; i++) {
      const p = fanOut(anchor, 6, i);
      expect(overlaps({ ...p, w: TASK_CHIP_W, h: TASK_CHIP_H }, anchor)).toBe(false);
    }
  });
});
