import { describe, expect, it } from "vitest";
import { buildCanvasPatch } from "../canvas-pending";

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
