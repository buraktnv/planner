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
  isCharterCard,
  neighbourLabel,
  openLabel,
  showsCardId,
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

describe("card identity", () => {
  it("treats a group: ref as the charter and an id as a record", () => {
    expect(isCharterCard("group:core")).toBe(true);
    expect(isCharterCard("K-020")).toBe(false);
    expect(isCharterCard("T-007.2")).toBe(false);
  });

  it("shows a record's id on the card everywhere but the chip", () => {
    // A chip is a label: the title is the only thing that fits on one.
    expect(showsCardId("K-020", "body")).toBe(true);
    expect(showsCardId("K-020", "summary")).toBe(true);
    expect(showsCardId("K-020", "chip")).toBe(false);
  });

  it("never shows an id for the core card, which has none", () => {
    for (const tier of ["chip", "summary", "body"] as const) {
      expect(showsCardId("group:core", tier)).toBe(false);
    }
  });

  it("says where the link actually goes", () => {
    // The reported bug: the core card's link opens the charter, which is
    // correct, while the label claimed it opened the card's own page.
    expect(openLabel("K-020", "/knowledge/K-020")).toBe("OPEN FULL PAGE");
    expect(openLabel("group:core", "/projects/acme-bot")).toBe("OPEN PROJECT");
    expect(openLabel("group:core", "/areas/acme-admin")).toBe("OPEN AREA");
  });

  it("keeps a scoped note href reading as a full page", () => {
    expect(openLabel("K-020", "/projects/acme-bot/docs/K-020")).toBe("OPEN FULL PAGE");
  });

  it("labels a neighbour row that leads out of the notes", () => {
    // Every note on a system map has an edge from the core, so this row is in
    // every popup; RELATED told you nothing about where it went.
    expect(neighbourLabel("RELATED", "group:core")).toBe("CHARTER");
    expect(neighbourLabel("REQUIRES", "K-021")).toBe("REQUIRES");
  });
});
