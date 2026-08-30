import { describe, expect, it } from "vitest";
import {
  RAIL_DEFAULT_WIDTH,
  RAIL_MIN_WIDTH,
  chromeFolded,
  clampRailWidth,
  dragRailWidth,
  railMaxWidth,
  storedRailWidth,
} from "../chat-layout";

describe("railMaxWidth", () => {
  it("leaves most of a window to the page behind it", () => {
    expect(railMaxWidth(1920)).toBe(1344);
  });

  /** Server render and the first client render both have no window to measure. */
  it("does not cap when there is no viewport to cap against", () => {
    expect(railMaxWidth(0)).toBe(Number.POSITIVE_INFINITY);
    expect(railMaxWidth(Number.NaN)).toBe(Number.POSITIVE_INFINITY);
  });

  it("never returns a maximum below the minimum, however small the window", () => {
    expect(railMaxWidth(200)).toBe(RAIL_MIN_WIDTH);
  });
});

describe("clampRailWidth", () => {
  it("keeps a width that already fits", () => {
    expect(clampRailWidth(520, 1920)).toBe(520);
  });

  it("refuses to shrink below the minimum", () => {
    expect(clampRailWidth(10, 1920)).toBe(RAIL_MIN_WIDTH);
    expect(clampRailWidth(-9000, 1920)).toBe(RAIL_MIN_WIDTH);
  });

  it("refuses to swallow the window", () => {
    expect(clampRailWidth(9000, 1920)).toBe(1344);
  });

  it("falls back rather than producing NaN width", () => {
    expect(clampRailWidth(Number.NaN, 1920)).toBe(RAIL_DEFAULT_WIDTH);
  });

  it("rounds, since a fractional pixel width reflows on every drag frame", () => {
    expect(clampRailWidth(500.6, 1920)).toBe(501);
  });
});

describe("storedRailWidth is total", () => {
  it("reads back a width it wrote", () => {
    expect(storedRailWidth("640", 1920)).toBe(640);
  });

  it("uses the default when nothing is stored", () => {
    expect(storedRailWidth(null, 1920)).toBe(RAIL_DEFAULT_WIDTH);
    expect(storedRailWidth(undefined, 1920)).toBe(RAIL_DEFAULT_WIDTH);
  });

  /** localStorage is shared with anything else on the origin; junk is expected. */
  it("survives junk rather than collapsing the rail", () => {
    expect(storedRailWidth("wide please", 1920)).toBe(RAIL_DEFAULT_WIDTH);
    expect(storedRailWidth("", 1920)).toBe(RAIL_DEFAULT_WIDTH);
  });

  /** A width stored on a big monitor must not break the layout on a laptop. */
  it("re-clamps a width stored on a larger screen", () => {
    expect(storedRailWidth("1600", 1280)).toBe(896);
  });
});

describe("dragRailWidth", () => {
  /** The rail is anchored right, so leftward drag is growth. */
  it("grows when the handle is dragged left", () => {
    expect(dragRailWidth(400, 1000, 900, 1920)).toBe(500);
  });

  it("shrinks when the handle is dragged right", () => {
    expect(dragRailWidth(500, 1000, 1060, 1920)).toBe(440);
  });

  it("is a no-op when the pointer has not moved", () => {
    expect(dragRailWidth(420, 1000, 1000, 1920)).toBe(420);
  });

  it("stops at the edges instead of following the pointer off screen", () => {
    expect(dragRailWidth(400, 1000, 5000, 1920)).toBe(RAIL_MIN_WIDTH);
    expect(dragRailWidth(400, 1000, -5000, 1920)).toBe(1344);
  });
});

describe("chromeFolded", () => {
  it("shows the controls before the conversation starts", () => {
    expect(chromeFolded(0, null)).toBe(false);
  });

  it("folds them away once something has been said", () => {
    expect(chromeFolded(1, null)).toBe(true);
    expect(chromeFolded(24, null)).toBe(true);
  });

  it("lets an explicit click win either way", () => {
    expect(chromeFolded(9, "open")).toBe(false);
    expect(chromeFolded(0, "closed")).toBe(true);
  });
});
