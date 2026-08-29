import { CARD_H, CARD_W } from "./canvas-layout";

/**
 * How much of a card is worth drawing. Decided from the stored size and the
 * zoom alone -- never by measuring, because everything inside the canvas
 * transform reports scaled pixels and would feed the answer back into itself.
 *
 * `k` is part of the decision so a body-sized card collapses to a chip when
 * zoomed out, which is also most of the rendering cost avoided for free.
 */
export type CardTier = "chip" | "summary" | "body";

export const MIN_CARD_W = 200;
export const MIN_CARD_H = 110;
export const MAX_CARD_W = 1200;
export const MAX_CARD_H = 900;

/** Below this the card is a label: a title and nothing else. */
export const CHIP_SCALE = 0.55;
/** A card taller than this has room for prose rather than one clipped line. */
export const BODY_H = 210;
export const BODY_W = 260;

export function cardTier(w: number, h: number, k: number): CardTier {
  if (!Number.isFinite(k) || k < CHIP_SCALE) return "chip";
  if (!Number.isFinite(w) || !Number.isFinite(h)) return "summary";
  return h >= BODY_H && w >= BODY_W ? "body" : "summary";
}

export function clampSize(w: number, h: number): { w: number; h: number } {
  const num = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);
  return {
    w: Math.round(Math.min(MAX_CARD_W, Math.max(MIN_CARD_W, num(w, CARD_W)))),
    h: Math.round(Math.min(MAX_CARD_H, Math.max(MIN_CARD_H, num(h, CARD_H)))),
  };
}

/**
 * A body tier card renders real markdown, so it gets the body verbatim and
 * scrolls. Anything smaller gets flat text: markdown syntax shown at 11px in a
 * clipped box is noise, not information.
 */
export function cardExcerpt(body: string, tier: CardTier): string {
  if (tier === "chip") return "";
  const text = body ?? "";
  if (tier === "body") return text.trim();
  return flatten(text).slice(0, 300);
}

/**
 * Markdown reduced to the sentence underneath it. Fences go entirely -- a
 * summary card showing three tokens of a mermaid diagram is worse than showing
 * nothing -- and the rest loses its punctuation rather than its words.
 */
function flatten(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
