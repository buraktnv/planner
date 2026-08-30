/**
 * The canvas tab strip.
 *
 * Every charter has canvas surfaces, but only one of them was ever reachable
 * without going back to the charter page first. These are the tabs across the
 * top of every canvas screen, in an order the user can rearrange.
 *
 * All of it is pure: the client strip owns the drag gesture and the stored
 * order, and nothing else. Ordering, active-tab resolution and href building
 * are decided here, where they can be tested.
 */

export type CanvasMode = "system" | "tasks";

export const ALL_TAB = "all";

export const TAB_ORDER_KEY = "planner.canvas.tabOrder";
export const LAST_CANVAS_KEY = "planner.canvas.last";

export interface TabCharter {
  id: string;
  name: string;
  type: "project" | "area";
  color: string;
}

export interface CanvasTab {
  key: string;
  label: string;
  href: string;
  color: string | null;
  type: "all" | "project" | "area";
}

/** `project/planner`, `area/career` — the tab's stable identity. */
export function tabKeyOf(type: "project" | "area", id: string): string {
  return `${type}/${id}`;
}

/**
 * A tab keeps you on the same kind of surface you are already looking at.
 * Clicking another project from a task map should show that project's task
 * map, not silently switch you to its system map.
 */
export function hrefOf(key: string, mode: CanvasMode): string {
  if (key === ALL_TAB) return "/canvas";
  return mode === "tasks" ? `/canvas/${key}` : `/canvas/${key}/system`;
}

function segments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** Which tab a path belongs to. Anything unrecognised is the global map. */
export function activeTabKey(pathname: string): string {
  const parts = segments(pathname);
  if (parts[0] !== "canvas") return ALL_TAB;
  const [, type, slug] = parts;
  if ((type !== "project" && type !== "area") || !slug) return ALL_TAB;
  return tabKeyOf(type, slug);
}

/**
 * The global map has no task variant, so it reports `system` — otherwise
 * arriving from `/canvas` would send every charter tab to its task map.
 */
export function modeOf(pathname: string): CanvasMode {
  const parts = segments(pathname);
  if (parts[0] !== "canvas" || parts.length < 3) return "system";
  return parts[parts.length - 1] === "system" ? "system" : "tasks";
}

export function buildCanvasTabs(
  charters: TabCharter[],
  mode: CanvasMode,
): CanvasTab[] {
  const tabs: CanvasTab[] = [
    {
      key: ALL_TAB,
      label: "All notes",
      href: hrefOf(ALL_TAB, mode),
      color: null,
      type: "all",
    },
  ];
  for (const c of charters) {
    const key = tabKeyOf(c.type, c.id);
    tabs.push({
      key,
      label: c.name,
      href: hrefOf(key, mode),
      color: c.color,
      type: c.type,
    });
  }
  return tabs;
}

/**
 * Apply a stored order.
 *
 * A stored key that no longer exists is dropped, and a tab the stored order
 * has never seen keeps its natural position relative to the other unseen
 * tabs, appended at the end. So archiving a charter or creating one never
 * corrupts the strip, and a new charter appears rather than vanishing.
 *
 * `all` is not pinned: the user may reorder it like any other tab.
 */
export function applyTabOrder(tabs: CanvasTab[], saved: readonly string[]): CanvasTab[] {
  const byKey = new Map(tabs.map((t) => [t.key, t]));
  const out: CanvasTab[] = [];
  const taken = new Set<string>();
  for (const key of saved) {
    const tab = byKey.get(key);
    if (tab && !taken.has(key)) {
      out.push(tab);
      taken.add(key);
    }
  }
  for (const tab of tabs) if (!taken.has(tab.key)) out.push(tab);
  return out;
}

/**
 * Move `from` to sit where `to` currently is. Returns the full key order, so
 * the caller can store it directly.
 */
export function reorderTabs(
  keys: readonly string[],
  from: string,
  to: string,
): string[] {
  if (from === to) return [...keys];
  const fromIndex = keys.indexOf(from);
  const toIndex = keys.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return [...keys];
  const out = [...keys];
  out.splice(fromIndex, 1);
  out.splice(toIndex, 0, from);
  return out;
}

/** A stored order is user data from localStorage: trust nothing about it. */
export function readTabOrder(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of parsed) {
    if (typeof v !== "string" || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * The remembered surface, used by the sidebar so "Canvas" reopens what you
 * were last looking at. Only in-app canvas paths are ever honoured — this
 * value comes back from browser storage, and a stored `//evil.example` would
 * otherwise be a protocol-relative URL out of the app.
 */
export function safeCanvasPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/canvas")) return null;
  if (raw.startsWith("//")) return null;
  if (raw !== "/canvas" && !raw.startsWith("/canvas/")) return null;
  if (/[\s\\]/.test(raw)) return null;
  return raw;
}
