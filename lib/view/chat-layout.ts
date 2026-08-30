/**
 * How much room the chat rail takes, and how much of its own chrome it shows.
 *
 * Both answers are pure so they can be tested at all: vitest runs in a node
 * environment here, so anything decided inside the React file is decided
 * untested. The rail keeps the wiring; this keeps the arithmetic.
 */

export const RAIL_WIDTH_KEY = "planner.chat.width";

/** Below this the composer and the proposal rows stop fitting side by side. */
export const RAIL_MIN_WIDTH = 340;
export const RAIL_DEFAULT_WIDTH = 372;

/**
 * The rail may take most of the window but never all of it — a rail you cannot
 * see the page behind is a page you cannot ask questions about.
 */
export const RAIL_MAX_FRACTION = 0.7;

export function railMaxWidth(viewport: number): number {
  if (!Number.isFinite(viewport) || viewport <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(RAIL_MIN_WIDTH, Math.round(viewport * RAIL_MAX_FRACTION));
}

export function clampRailWidth(px: number, viewport = 0): number {
  if (!Number.isFinite(px)) return RAIL_DEFAULT_WIDTH;
  return Math.round(Math.min(Math.max(px, RAIL_MIN_WIDTH), railMaxWidth(viewport)));
}

/**
 * Total: a stored width arrives from `localStorage`, which is to say from
 * anywhere. Junk falls back to the default rather than collapsing the rail.
 */
export function storedRailWidth(raw: string | null | undefined, viewport = 0): number {
  if (raw == null) return clampRailWidth(RAIL_DEFAULT_WIDTH, viewport);
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return clampRailWidth(RAIL_DEFAULT_WIDTH, viewport);
  return clampRailWidth(n, viewport);
}

/**
 * The rail is anchored right, so dragging its handle *left* makes it wider —
 * hence the reversed subtraction, which is the part that is easy to get
 * backwards and impossible to notice in a diff.
 */
export function dragRailWidth(
  startWidth: number,
  startX: number,
  clientX: number,
  viewport = 0,
): number {
  return clampRailWidth(startWidth + (startX - clientX), viewport);
}

/**
 * Whether the rail's own controls — scope, modes, history, the opener line —
 * are folded away.
 *
 * They are worth a third of the panel before a word is said and nothing after:
 * scope and mode are chosen once, and history is a way *into* a conversation,
 * not something to consult during one. So the fold is derived from whether
 * this conversation has started, and an explicit click wins over that for as
 * long as the conversation lasts.
 */
export type ChromeOverride = "open" | "closed" | null;

export function chromeFolded(messageCount: number, override: ChromeOverride = null): boolean {
  if (override === "open") return false;
  if (override === "closed") return true;
  return messageCount > 0;
}
