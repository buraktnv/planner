import { describe, expect, it } from "vitest";
import { buildCanvasPatch, withoutRefs } from "../canvas-pending";

describe("withoutRefs", () => {
  it("returns the map untouched when nothing is in flight", () => {
    const pending = { "K-001": { x: 1, y: 2 } };
    expect(withoutRefs(pending, new Set())).toBe(pending);
  });

  it("drops only the refs already being sent", () => {
    const pending = { a: { x: 1, y: 1 }, b: { x: 2, y: 2 }, c: { x: 3, y: 3 } };
    expect(withoutRefs(pending, new Set(["b"]))).toEqual({
      a: { x: 1, y: 1 },
      c: { x: 3, y: 3 },
    });
  });

  it("ignores an in-flight ref that is not pending", () => {
    expect(withoutRefs({ a: { x: 1, y: 1 } }, new Set(["zzz"]))).toEqual({ a: { x: 1, y: 1 } });
  });

  it("never mutates the map it was given", () => {
    const pending = { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } };
    withoutRefs(pending, new Set(["a"]));
    expect(Object.keys(pending)).toEqual(["a", "b"]);
  });

  it("leaves nothing to send when every pending ref is in flight", () => {
    const dirty = { a: { x: 1, y: 1 } };
    const dirtySize = { b: { w: 10, h: 10 } };
    const inFlight = new Set(["a", "b"]);
    expect(
      buildCanvasPatch({}, {}, withoutRefs(dirty, inFlight), withoutRefs(dirtySize, inFlight)),
    ).toBeNull();
  });

  it("still sends a ref that moved again while another is in flight", () => {
    const dirty = { a: { x: 1, y: 1 }, b: { x: 9, y: 9 } };
    const inFlight = new Set(["a"]);
    expect(buildCanvasPatch({}, {}, withoutRefs(dirty, inFlight), {})).toEqual({
      moves: [{ ref: "b", x: 9, y: 9 }],
    });
  });
});

describe("buildCanvasPatch", () => {
  it("returns null when nothing is pending", () => {
    expect(buildCanvasPatch({}, {}, {}, {})).toBeNull();
    expect(buildCanvasPatch({ "K-001": { x: 10, y: 20 } }, {}, {}, {})).toBeNull();
  });

  it("carries x/y for a moved ref and no size", () => {
    const patch = buildCanvasPatch(
      { "K-001": { x: 10, y: 20 } },
      { "K-001": { w: 300, h: 200 } },
      { "K-001": { x: 10, y: 20 } },
      {},
    );
    expect(patch).toEqual({ moves: [{ ref: "K-001", x: 10, y: 20 }] });
  });

  it("carries w/h and the ref's x/y for a resized ref that was never dragged", () => {
    const patch = buildCanvasPatch(
      { "K-002": { x: 40, y: 60 } },
      { "K-002": { w: 320, h: 240 } },
      {},
      { "K-002": { w: 320, h: 240 } },
    );
    expect(patch).toEqual({ moves: [{ ref: "K-002", x: 40, y: 60, w: 320, h: 240 }] });
  });

  it("falls back to 0,0 when a resized ref has no known position", () => {
    const patch = buildCanvasPatch({}, {}, {}, { "K-003": { w: 100, h: 80 } });
    expect(patch).toEqual({ moves: [{ ref: "K-003", x: 0, y: 0, w: 100, h: 80 }] });
  });

  it("emits one move for a ref that was both moved and resized", () => {
    const patch = buildCanvasPatch(
      { "K-004": { x: 5, y: 5 } },
      { "K-004": { w: 200, h: 150 } },
      { "K-004": { x: 5, y: 5 } },
      { "K-004": { w: 200, h: 150 } },
    );
    expect(patch?.moves).toHaveLength(1);
    expect(patch?.moves[0]).toEqual({ ref: "K-004", x: 5, y: 5, w: 200, h: 150 });
  });

  it("prefers the pending position over the live one", () => {
    const patch = buildCanvasPatch(
      { "K-005": { x: 99, y: 99 } },
      {},
      { "K-005": { x: 1, y: 2 } },
      {},
    );
    expect(patch).toEqual({ moves: [{ ref: "K-005", x: 1, y: 2 }] });
  });

  it("includes every pending ref once", () => {
    const patch = buildCanvasPatch(
      { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } },
      { b: { w: 10, h: 10 } },
      { a: { x: 1, y: 1 } },
      { b: { w: 10, h: 10 } },
    );
    expect(patch?.moves.map((m) => m.ref)).toEqual(["a", "b"]);
  });
});
