export interface PendingPoint {
  x: number;
  y: number;
}

export interface PendingSize {
  w: number;
  h: number;
}

export interface CanvasMove {
  ref: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface CanvasPatch {
  moves: CanvasMove[];
}

/**
 * The `moves` half of the body `PATCH /api/canvas` expects, or null when
 * nothing is pending -- which is also the caller's "there is nothing to flush"
 * signal on unmount.
 *
 * `local` / `localSize` are the *current* geometry of every card on the board,
 * not only the dragged ones. Position and size flush together, because the
 * writer merges a whole node line: a ref whose size changed still has to carry
 * its x/y, and only a ref whose size changed carries w/h -- sending the size on
 * every move would clobber a resize made meanwhile by the other process.
 *
 * Pure, so the flush path can be tested without a browser.
 */
export function buildCanvasPatch(
  local: Record<string, PendingPoint>,
  localSize: Record<string, PendingSize>,
  dirty: Record<string, PendingPoint>,
  dirtySize: Record<string, PendingSize>,
): CanvasPatch | null {
  const refs = [...new Set([...Object.keys(dirty), ...Object.keys(dirtySize)])];
  if (refs.length === 0) return null;
  const moves = refs.map((ref) => {
    const p = dirty[ref] ?? local[ref] ?? { x: 0, y: 0 };
    const size = ref in dirtySize ? (dirtySize[ref] ?? localSize[ref]) : undefined;
    return size ? { ref, x: p.x, y: p.y, w: size.w, h: size.h } : { ref, x: p.x, y: p.y };
  });
  return { moves };
}
