import { describe, expect, it } from "vitest";
import {
  BODY_H,
  BODY_W,
  CHIP_SCALE,
  MAX_CARD_H,
  MAX_CARD_W,
  MIN_CARD_H,
  MIN_CARD_W,
  cardExcerpt,
  cardTier,
  clampSize,
} from "../canvas-card";
import { CARD_H, CARD_W } from "../canvas-layout";

describe("cardTier", () => {
  it("is a chip whenever the board is zoomed out past the threshold", () => {
    expect(cardTier(800, 600, CHIP_SCALE - 0.01)).toBe("chip");
    expect(cardTier(800, 600, 0.2)).toBe("chip");
  });

  it("keeps the default card at summary", () => {
    expect(cardTier(CARD_W, CARD_H, 1)).toBe("summary");
  });

  it("reaches body only when both dimensions allow prose", () => {
    expect(cardTier(BODY_W, BODY_H, 1)).toBe("body");
    expect(cardTier(BODY_W - 1, BODY_H, 1)).toBe("summary");
    expect(cardTier(BODY_W, BODY_H - 1, 1)).toBe("summary");
  });

  it("collapses a body-sized card to a chip when zoomed out", () => {
    expect(cardTier(900, 700, 1)).toBe("body");
    expect(cardTier(900, 700, 0.3)).toBe("chip");
  });

  it("never throws on rubbish", () => {
    expect(cardTier(Number.NaN, Number.NaN, 1)).toBe("summary");
    expect(cardTier(300, 300, Number.NaN)).toBe("chip");
  });
});

describe("clampSize", () => {
  it("holds a card above the floor, so it can never become unclickable", () => {
    expect(clampSize(10, 10)).toEqual({ w: MIN_CARD_W, h: MIN_CARD_H });
    expect(clampSize(-500, 0)).toEqual({ w: MIN_CARD_W, h: MIN_CARD_H });
  });

  it("holds a card under the ceiling", () => {
    expect(clampSize(99999, 99999)).toEqual({ w: MAX_CARD_W, h: MAX_CARD_H });
  });

  it("rounds, because the file grammar stores integers", () => {
    expect(clampSize(300.6, 250.2)).toEqual({ w: 301, h: 250 });
  });

  it("falls back to the default card on non-finite input", () => {
    expect(clampSize(Number.NaN, Number.NaN)).toEqual({ w: CARD_W, h: CARD_H });
  });

  it("is idempotent", () => {
    const once = clampSize(4000, 12);
    expect(clampSize(once.w, once.h)).toEqual(once);
  });
});

describe("cardExcerpt", () => {
  const body = [
    "## Why it exists",
    "",
    "The BT needs a *camera control* layer, see [the note](/knowledge/K-003).",
    "",
    "```mermaid",
    "flowchart TD",
    "  A --> B",
    "```",
    "",
    "- one",
    "- two",
  ].join("\n");

  it("gives a chip nothing", () => {
    expect(cardExcerpt(body, "chip")).toBe("");
  });

  it("gives a body card the markdown verbatim, so it can be rendered", () => {
    expect(cardExcerpt(body, "body")).toBe(body.trim());
  });

  it("flattens markdown for a summary card", () => {
    const out = cardExcerpt(body, "summary");
    expect(out).toContain("Why it exists");
    expect(out).toContain("camera control");
    expect(out).toContain("the note");
    expect(out).not.toContain("##");
    expect(out).not.toContain("*");
    expect(out).not.toContain("](");
  });

  it("drops fenced code entirely rather than showing three tokens of it", () => {
    const out = cardExcerpt(body, "summary");
    expect(out).not.toContain("flowchart");
    expect(out).not.toContain("```");
  });

  it("drops images, which have no text worth showing", () => {
    expect(cardExcerpt("before ![a screenshot](assets/x.png) after", "summary")).toBe(
      "before after",
    );
  });

  it("caps a summary so one long note cannot fill the board", () => {
    expect(cardExcerpt("word ".repeat(400), "summary").length).toBeLessThanOrEqual(300);
  });

  it("survives an empty body", () => {
    expect(cardExcerpt("", "summary")).toBe("");
    expect(cardExcerpt("", "body")).toBe("");
  });
});
