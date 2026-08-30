"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CanvasModel, CanvasNodeModel } from "@/lib/view/canvas";
import {
  arrowHead,
  boundsOf,
  clampZoom,
  CORE_REF,
  edgePath,
  fitTo,
  toCanvas,
  type Point,
  type Rect,
} from "@/lib/view/canvas-layout";
import { cardExcerpt, cardTier, clampSize, type CardTier } from "@/lib/view/canvas-card";
import { Bar, Mono } from "../primitives";
import Markdown from "../markdown";
import CanvasPopup from "./canvas-popup";
import CanvasTabs from "./canvas-tabs";
import { activeTabKey, type CanvasTab } from "@/lib/view/canvas-tabs";

interface Viewport {
  tx: number;
  ty: number;
  k: number;
}

interface Size {
  w: number;
  h: number;
}

type Drag =
  | { kind: "pan"; startX: number; startY: number; tx: number; ty: number }
  | { kind: "card"; id: string; startX: number; startY: number; from: Point; moved: boolean }
  | { kind: "resize"; id: string; startX: number; startY: number; from: Size; moved: boolean };

const MOVE_THRESHOLD = 4;

/**
 * Whether a scrollable card body can still absorb this wheel delta. Without the
 * exhaustion check the canvas becomes unzoomable whenever the cursor happens to
 * sit over a card.
 */
function canScroll(el: HTMLElement, deltaY: number): boolean {
  if (el.scrollHeight <= el.clientHeight) return false;
  if (deltaY < 0) return el.scrollTop > 0;
  return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
}

function scrollAncestor(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-card-scroll]")
    : null;
}

type LinkKind = "requires" | "triggers";

export default function CanvasView({
  model,
  surface,
  title,
  backHref,
  tabs,
  drawEdges = false,
  delegate,
  createScope,
  unlinkedTasks,
}: {
  model: CanvasModel;
  surface: Record<string, unknown>;
  title: string;
  backHref?: string;
  tabs?: CanvasTab[];
  /** System canvases let you draw requires/triggers arrows; the knowledge one does not. */
  drawEdges?: boolean;
  /** Where a delegated task is created. Absent on the knowledge canvas. */
  delegate?: { type: string; slug: string };
  /**
   * Scope a note created here is filed under. Without it a charter's map could
   * only ever be filled from the Knowledge page, which is why they start empty.
   */
  createScope?: string;
  /** Open tasks in this charter with no component yet, offered for linking. */
  unlinkedTasks?: { id: string; title: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const stage = useRef<HTMLDivElement | null>(null);
  const [vp, setVp] = useState<Viewport>({ tx: 60, ty: 60, k: 1 });
  const [edit, setEdit] = useState(false);
  const [local, setLocal] = useState<Record<string, Point>>({});
  const [dirty, setDirty] = useState<Record<string, Point>>({});
  const [localSize, setLocalSize] = useState<Record<string, Size>>({});
  const [dirtySize, setDirtySize] = useState<Record<string, Size>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [frontId, setFrontId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [draft, setDraft] = useState<
    { at: Point; screen: Point; title: string; busy: boolean } | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [linkingTaskFor, setLinkingTaskFor] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [linkKind, setLinkKind] = useState<LinkKind>("requires");
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);

  // React's onWheel cannot reliably preventDefault, so the page would scroll
  // while zooming. This has to be a non-passive native listener.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const sc = scrollAncestor(e.target);
      if (sc && canScroll(sc, e.deltaY)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setVp((cur) => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const k = clampZoom(cur.k * factor);
        const anchor = toCanvas({ x: e.clientX, y: e.clientY }, cur, { x: r.left, y: r.top });
        return { k, tx: e.clientX - r.left - anchor.x * k, ty: e.clientY - r.top - anchor.y * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const nodes = useMemo(
    () => model.nodes.map((n) => ({ ...n, ...(local[n.id] ?? {}), ...(localSize[n.id] ?? {}) })),
    [model.nodes, local, localSize],
  );
  const rectById = useMemo(() => new Map(nodes.map((n) => [n.id, n as Rect])), [nodes]);

  // Recomputed here rather than trusting the server's paths, because a card
  // being dragged has moved since the model was built.
  const edges = useMemo(
    () =>
      model.edges.flatMap((e) => {
        const a = rectById.get(e.from);
        const b = rectById.get(e.to);
        if (!a || !b) return [];
        return [{ ...e, d: edgePath(a, b), head: arrowHead(a, b) }];
      }),
    [model.edges, rectById],
  );

  const bounds = useMemo(() => boundsOf(nodes), [nodes]);

  /**
   * Which arrows are on screen at rest.
   *
   * Every `[[K-nnn]]` in a note body is an arrow, so a well-linked board draws
   * a line for every sentence that cites another note -- structure buried under
   * its own cross-references. The spine stays: what someone drew by hand, and
   * the centre's spokes. A card's own links appear when you point at it, and
   * ARRANGE shows the whole graph for editing.
   */
  const shownEdges = useMemo(
    () =>
      edges.filter((e) => {
        if (edit || e.source === "canvas" || e.from === CORE_REF) return true;
        if (e.key === selectedEdge) return true;
        return hoverId !== null && (e.from === hoverId || e.to === hoverId);
      }),
    [edges, edit, hoverId, selectedEdge],
  );

  // Biggest first, so a card that has been enlarged sits behind the small ones
  // it now overlaps and every card keeps a visible corner. Ties break on id so
  // the order cannot depend on the model's array order.
  const painted = useMemo(
    () => [...nodes].sort((a, b) => b.w * b.h - a.w * a.h || a.id.localeCompare(b.id)),
    [nodes],
  );

  const fit = useCallback(() => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    setVp(fitTo(bounds, r.width, r.height));
  }, [bounds]);

  useEffect(() => {
    fit();
    // Only on mount: refitting on every change would fight the user's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!createScope) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-drag-ref]")) return;
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
    setDraft({
      at: toCanvas({ x: e.clientX, y: e.clientY }, vp, { x: r.left, y: r.top }),
      screen,
      title: "",
      busy: false,
    });
  };

  const createNote = async () => {
    if (!draft || !createScope) return;
    const title = draft.title.trim();
    if (!title) return;
    setDraft({ ...draft, busy: true });
    setError(null);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, summary: title, scope: [createScope] }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setError(body.error ?? "Could not create that note.");
        setDraft(null);
        return;
      }
      // Place it where the click landed, so it appears where it was asked for
      // rather than wherever the layout would have put it.
      await fetch("/api/canvas", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          surface,
          moves: [{ ref: body.id, x: Math.round(draft.at.x), y: Math.round(draft.at.y) }],
        }),
      });
      setDraft(null);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setDraft(null);
    }
  };

  /**
   * The note: field on the task line is the only record of this link, so it is
   * written straight through the task route. The canvas API deliberately has
   * no part in it: it accepts a knowledge surface too, where there is no
   * charter and no tasks.md to write.
   */
  const writeTaskNote = useCallback(
    async (taskId: string, noteId: string) => {
      if (!delegate) return;
      setSaving(true);
      setError(null);
      try {
        const base = delegate.type === "area" ? "areas" : "projects";
        const res = await fetch(`/api/${base}/${delegate.slug}/tasks`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: taskId, note: noteId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "Could not link that task.");
          return;
        }
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      } finally {
        setSaving(false);
      }
    },
    [delegate, router],
  );

  const createTask = useCallback(
    async (noteId: string, title: string) => {
      if (!delegate) return;
      setSaving(true);
      setError(null);
      try {
        const base = delegate.type === "area" ? "areas" : "projects";
        const res = await fetch(`/api/${base}/${delegate.slug}/tasks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, size: "M", note: noteId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "Could not add that task.");
          return;
        }
        router.refresh();
      } catch {
        setError("Could not reach the server.");
      } finally {
        setSaving(false);
      }
    },
    [delegate, router],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    // Inside a scrollable card body the event is the card's: capturing it here
    // would steal text selection and scrollbar drags.
    if (scrollAncestor(target)) return;
    // Grabbing a card moves it, whatever mode the board is in. Gating this
    // on ARRANGE meant a drag silently panned the board instead, so an
    // arrangement was never saved and every reload re-ran the auto-layout --
    // the board appeared to snap back to a grid on refresh. Panning still
    // works from the background, and MOVE_THRESHOLD keeps a click a click.
    const resizeId = target.closest<HTMLElement>("[data-resize-ref]")?.dataset.resizeRef;
    const cardId = target.closest<HTMLElement>("[data-drag-ref]")?.dataset.dragRef;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (resizeId) {
      const node = nodes.find((n) => n.id === resizeId);
      if (!node) return;
      setFrontId(resizeId);
      drag.current = {
        kind: "resize",
        id: resizeId,
        startX: e.clientX,
        startY: e.clientY,
        from: { w: node.w, h: node.h },
        moved: false,
      };
    } else if (cardId) {
      const node = nodes.find((n) => n.id === cardId);
      if (!node) return;
      setFrontId(cardId);
      drag.current = {
        kind: "card",
        id: cardId,
        startX: e.clientX,
        startY: e.clientY,
        from: { x: node.x, y: node.y },
        moved: false,
      };
    } else {
      drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, tx: vp.tx, ty: vp.ty };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.kind === "pan") {
      // Screen deltas: panning is NOT divided by k.
      setVp((cur) => ({ ...cur, tx: d.tx + dx, ty: d.ty + dy }));
      return;
    }
    if (!d.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
    d.moved = true;
    // Canvas deltas: resizing and dragging ARE divided by k, or the card drifts
    // away from the cursor when zoomed.
    if (d.kind === "resize") {
      setLocalSize((cur) => ({
        ...cur,
        [d.id]: clampSize(d.from.w + dx / vp.k, d.from.h + dy / vp.k),
      }));
      return;
    }
    setLocal((cur) => ({
      ...cur,
      [d.id]: { x: Math.round(d.from.x + dx / vp.k), y: Math.round(d.from.y + dy / vp.k) },
    }));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "card" && d.moved) {
      setDirty((cur) => ({ ...cur, [d.id]: local[d.id] ?? d.from }));
    }
    if (d?.kind === "resize" && d.moved) {
      setDirtySize((cur) => ({ ...cur, [d.id]: localSize[d.id] ?? d.from }));
    }
  };

  const saveRef = useRef<() => Promise<void>>(async () => {});

  const pendingRefs = useMemo(
    () => [...new Set([...Object.keys(dirty), ...Object.keys(dirtySize)])],
    [dirty, dirtySize],
  );
  const pendingCount = pendingRefs.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setLinkFrom(null);
      setSelectedEdge(null);
      setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const post = useCallback(async (method: "POST" | "DELETE", edge: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/canvas", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface, edge }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not save that connection.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }, [surface, router]);

  /** Two clicks rather than a rubber band: far more robust at any zoom. */
  const pickTarget = useCallback(
    (to: string) => {
      const from = linkFrom;
      setLinkFrom(null);
      if (!from || from === to) return;
      void post("POST", { from, to, kind: linkKind });
    },
    [linkFrom, linkKind, post],
  );

  // Stable identities, or the memo on CanvasCard is defeated by a fresh arrow
  // function per node per render.
  const openCard = useCallback((id: string) => {
    setOpenId(id);
    setFrontId(id);
  }, []);
  const startLink = useCallback((id: string) => setLinkFrom(id), []);

  const deleteSelected = () => {
    const edge = edges.find((e) => e.key === selectedEdge);
    setSelectedEdge(null);
    if (!edge || edge.source === "derived") return;
    void post("DELETE", { from: edge.from, to: edge.to, kind: edge.kind });
  };

  // An arrangement used to survive only if you noticed the SAVE button and
  // clicked it -- otherwise a refresh silently threw the work away and the
  // board came back auto-laid-out. Debounced, so a burst of drags is still one
  // commit rather than one per pixel.
  const AUTOSAVE_MS = 900;

  const save = async () => {
    if (pendingCount === 0 || saving) return;
    setSaving(true);
    try {
      // Position and size flush together: a ref whose size moved still has to
      // carry its x/y, since the writer merges a whole node line.
      const moves = pendingRefs.map((ref) => {
        const n = nodes.find((x) => x.id === ref);
        const p = dirty[ref] ?? { x: n?.x ?? 0, y: n?.y ?? 0 };
        const size = dirtySize[ref];
        return size ? { ref, x: p.x, y: p.y, w: size.w, h: size.h } : { ref, x: p.x, y: p.y };
      });
      const res = await fetch("/api/canvas", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface, moves }),
      });
      if (!res.ok) return;
      // Only what this request carried: a card moved while it was in flight
      // must stay pending, not be wiped by the response.
      const sent = new Set(pendingRefs);
      const keep = <T,>(cur: Record<string, T>) =>
        Object.fromEntries(Object.entries(cur).filter(([ref]) => !sent.has(ref)));
      setDirty(keep);
      setDirtySize(keep);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    if (pendingCount === 0 || saving) return;
    const timer = setTimeout(() => {
      void saveRef.current();
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [pendingCount, saving]);

  const open = openId ? (nodes.find((n) => n.id === openId) ?? null) : null;
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.title ?? id;

  const button = "rounded-lg border px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em]";

  return (
    <div className="flex h-full flex-col">
      {tabs && tabs.length > 1 && (
        <CanvasTabs tabs={tabs} activeKey={activeTabKey(pathname)} path={pathname} />
      )}
      <div
        className={`flex flex-wrap items-center gap-[7px] px-9 pb-3 ${
          tabs && tabs.length > 1 ? "border-t border-edge pt-4" : "pt-[26px]"
        }`}
      >
        {backHref && (
          <Link
            href={backHref}
            className="mr-1 font-mono text-[9.5px] tracking-[0.1em] text-faint transition-colors hover:text-ink"
          >
            ←
          </Link>
        )}
        <h1 className="m-0 mr-2 text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
        <button
          type="button"
          onClick={() => setEdit((v) => !v)}
          className={`${button} ${edit ? "border-ink text-ink" : "border-edge text-faint hover:text-dim"}`}
        >
          {edit ? "✓ ARRANGE" : "ARRANGE"}
        </button>
        <button type="button" onClick={fit} className={`${button} border-edge text-faint hover:text-dim`}>
          FIT
        </button>
        <button
          type="button"
          onClick={() => setVp((c) => ({ ...c, k: clampZoom(c.k * 1.2) }))}
          className={`${button} border-edge text-faint hover:text-dim`}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setVp((c) => ({ ...c, k: clampZoom(c.k / 1.2) }))}
          className={`${button} border-edge text-faint hover:text-dim`}
        >
          −
        </button>
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={`${button} border-ink text-ink disabled:opacity-40`}
          >
            {saving ? "SAVING…" : `SAVE ${pendingCount}`}
          </button>
        )}

        {drawEdges && edit && (
          <>
            <span className="mx-1 h-4 w-px bg-edge" />
            {(["requires", "triggers"] as LinkKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setLinkKind(k)}
                className={`${button} ${
                  linkKind === k ? "border-ink text-ink" : "border-edge text-faint hover:text-dim"
                }`}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </>
        )}

        {selectedEdge && (
          <button
            type="button"
            onClick={deleteSelected}
            disabled={saving}
            className={`${button} border-wait-ink text-wait-ink disabled:opacity-40`}
          >
            DELETE ARROW
          </button>
        )}

        <div className="flex-1" />
        {model.orphans.length > 0 && (
          <Mono className="text-[9px] tracking-[0.08em] text-faint">
            {model.orphans.length} STALE
          </Mono>
        )}
        <Mono className="text-[9px] tracking-[0.08em] text-faint">
          {Math.round(vp.k * 100)}%
        </Mono>
      </div>

      <div
        ref={stage}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden border-t border-edge2 bg-bg ${
          edit ? "cursor-grab" : "cursor-default"
        }`}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.k})` }}
        >
          <svg
            className="pointer-events-none absolute overflow-visible"
            style={{ left: 0, top: 0, width: 1, height: 1 }}
            aria-hidden
          >
            {shownEdges.map((e) => {
              const on = selectedEdge === e.key;
              const stroke = on ? "var(--color-ink)" : "var(--color-edge)";
              return (
                <g key={e.key}>
                  <path
                    d={e.d}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={e.source === "derived" ? 1.2 : 1.8}
                    strokeDasharray={e.kind === "triggers" ? "5 5" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                  <path d={e.head} fill={stroke} />
                  {edit && e.source === "canvas" && (
                    // A fat transparent twin: a 1px line is impossible to hit.
                    <path
                      d={e.d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-auto cursor-pointer"
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        setSelectedEdge(on ? null : e.key);
                      }}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {model.groups.map((g) => (
            <div
              key={g.key}
              className="absolute rounded-[18px] border border-dashed border-edge2"
              style={{ left: g.rect.x, top: g.rect.y, width: g.rect.w, height: g.rect.h }}
            >
              <Mono
                className="absolute -top-[18px] left-1 text-[9px] tracking-[0.1em]"
                style={{ color: g.color }}
              >
                {g.label.toUpperCase()}
              </Mono>
            </div>
          ))}

          {painted.map((n) => (
            <CanvasCard
              key={n.id}
              node={n}
              tier={cardTier(n.w, n.h, vp.k)}
              front={frontId === n.id}
              canDelegate={delegate !== undefined && !n.id.startsWith("group:")}
              unlinked={unlinkedTasks}
              linkOpen={linkingTaskFor === n.id}
              onToggleLink={setLinkingTaskFor}
              onCreateTask={createTask}
              onLinkTask={writeTaskNote}
              busy={saving}
              edit={edit}
              onHover={setHoverId}
              linking={linkFrom !== null}
              isSource={linkFrom === n.id}
              canDraw={drawEdges}
              onOpen={openCard}
              onStartLink={startLink}
              onPickTarget={pickTarget}
            />
          ))}
        </div>

        {nodes.length === 0 && !draft && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="m-0 max-w-[280px] text-center text-[13px] text-faint">
              {createScope
                ? "Nothing here yet. Double-click anywhere to add the first component."
                : "Nothing to map yet."}
            </p>
          </div>
        )}

        {draft && (
          // Outside the canvas transform: an input inside it would be scaled
          // with the board and blur or overflow at anything but 100%.
          <div
            className="absolute z-50 w-[240px] rounded-[12px] border border-ink bg-surf p-2 shadow-sm"
            style={{
              left: Math.max(8, draft.screen.x - 120),
              top: Math.max(8, draft.screen.y - 20),
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={draft.title}
              disabled={draft.busy}
              placeholder="Name this component…"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createNote();
                if (e.key === "Escape") setDraft(null);
              }}
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
            />
            <Mono className="mt-1.5 block text-[8.5px] tracking-[0.08em] text-faint">
              {draft.busy ? "CREATING…" : "ENTER TO ADD · ESC TO CANCEL"}
            </Mono>
          </div>
        )}

        {(linkFrom || error) && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <Mono
              className={`rounded-[9px] px-3 py-2 text-[9.5px] tracking-[0.08em] ${
                error ? "bg-clay-tint text-clay-ink" : "bg-soft text-dim"
              }`}
            >
              {error
                ? error.toUpperCase()
                : `PICK WHAT ${titleOf(linkFrom!).toUpperCase()} ${linkKind.toUpperCase()} — ESC TO CANCEL`}
            </Mono>
          </div>
        )}
      </div>

      {open && (
        <CanvasPopup
          node={open}
          edges={edges}
          titleOf={titleOf}
          delegate={delegate}
          onClose={() => setOpenId(null)}
          onOpenNode={(id) => setOpenId(id)}
        />
      )}
    </div>
  );
}

interface CardProps {
  node: CanvasNodeModel;
  tier: CardTier;
  front: boolean;
  edit: boolean;
  onHover: (id: string | null) => void;
  canDelegate: boolean;
  unlinked?: { id: string; title: string }[];
  linkOpen: boolean;
  busy: boolean;
  onToggleLink: (id: string | null) => void;
  onCreateTask: (noteId: string, title: string) => void;
  onLinkTask: (taskId: string, noteId: string) => void;
  linking: boolean;
  isSource: boolean;
  canDraw: boolean;
  onOpen: (id: string) => void;
  onStartLink: (id: string) => void;
  onPickTarget: (id: string) => void;
}

function CanvasCardBase({
  node,
  tier,
  front,
  edit,
  onHover,
  canDelegate,
  unlinked,
  linkOpen,
  busy,
  onToggleLink,
  onCreateTask,
  onLinkTask,
  linking,
  isSource,
  canDraw,
  onOpen,
  onStartLink,
  onPickTarget,
}: CardProps) {
  // A note whose summary is still its title would otherwise print it twice.
  const preview = node.preview.trim() === node.title.trim() ? "" : node.preview;
  const summary = preview || cardExcerpt(node.body ?? "", "summary");
  // group: refs are internal — the core card has no id worth showing.
  const showId = !node.id.startsWith("group:");
  const body = tier === "body" ? cardExcerpt(node.body ?? "", "body") : "";
  const scrolls = !edit && tier === "body" && body !== "";

  return (
    <div
      // Not draggable while picking a link target, or the click becomes a drag.
      data-drag-ref={linking ? undefined : node.id}
      onPointerDown={linking && !isSource ? () => onPickTarget(node.id) : undefined}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
      className={`group absolute flex flex-col overflow-hidden rounded-[14px] border bg-surf ${
        isSource ? "border-ink" : edit ? "border-edge" : "border-edge2"
      } ${linking && !isSource ? "cursor-crosshair" : "cursor-grab"}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        // Last card touched comes forward, or an enlarged card reads as though
        // it were behind the neighbours it now overlaps.
        zIndex: front ? 30 : 10,
        borderLeft: `3px solid ${node.color}`,
      }}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => (linking ? onPickTarget(node.id) : onOpen(node.id))}
        className="block w-full shrink-0 px-3.5 pt-3 pr-9 pb-1.5 text-left text-[13px] font-semibold leading-[1.3] tracking-[-0.01em] hover:underline"
      >
        {node.title}
      </button>

      {tier !== "chip" && (
        <div
          // A scroll container only where there is something to scroll: out of
          // ARRANGE mode, on a card big enough to hold prose. Marking every card
          // would cost the two gestures that share the pointer -- dragging to
          // arrange, and dragging the background to pan -- across most of the
          // board, for summary cards that show a single line anyway.
          data-card-scroll={scrolls ? "" : undefined}
          className={`min-h-0 flex-1 px-3.5 ${scrolls ? "touch-auto overflow-y-auto" : "overflow-hidden"}`}
        >
          {tier === "body" && body ? (
            <Markdown className="text-[11.5px] leading-[1.6] text-ink" diagrams={false}>
              {body}
            </Markdown>
          ) : (
            <p className="m-0 text-[11.5px] leading-[1.45] text-dim">{summary}</p>
          )}

          {tier === "body" && canDelegate && (
            <ComponentWork
              node={node}
              unlinked={unlinked}
              linkOpen={linkOpen}
              busy={busy}
              onToggleLink={onToggleLink}
              onCreateTask={onCreateTask}
              onLinkTask={onLinkTask}
            />
          )}
        </div>
      )}

      <div className="shrink-0 px-3.5 pt-1.5 pb-2">
        {node.progress?.linked && (
          <>
            <Bar pct={node.progress.pct} color={node.color} height={3} />
            <Mono className="mt-1 mb-1 block text-[8.5px] text-faint">
              {node.progress.done}/{node.progress.total} TASKS
            </Mono>
          </>
        )}
        {showId && (
          <Mono className="block text-right text-[8.5px] text-faint">{node.id}</Mono>
        )}
      </div>

      {!linking && (
        <div
          data-resize-ref={node.id}
          aria-hidden
          className={`absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize transition-opacity ${
            edit ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          style={{
            background:
              "linear-gradient(135deg, transparent 55%, var(--color-edge) 55%, var(--color-edge) 68%, transparent 68%, transparent 78%, var(--color-edge) 78%, var(--color-edge) 91%, transparent 91%)",
          }}
        />
      )}

      {canDraw && edit && !linking && (
        <button
          type="button"
          aria-label={`Draw an arrow from ${node.title}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onStartLink(node.id)}
          className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-[7px] border border-edge bg-bg font-mono text-[11px] leading-none text-faint transition-colors hover:text-ink"
        >
          →
        </button>
      )}
    </div>
  );
}

/**
 * The work delegated from a component, on the card itself: what is already
 * linked, a row to add another, and a picker for a task that exists but has
 * no component yet. Both write the task's note: field, which is the only
 * record of the link -- no canvas edge is written for it, or the same
 * relationship would be stored twice and could disagree with itself.
 */
function ComponentWork({
  node,
  unlinked,
  linkOpen,
  busy,
  onToggleLink,
  onCreateTask,
  onLinkTask,
}: {
  node: CanvasNodeModel;
  unlinked?: { id: string; title: string }[];
  linkOpen: boolean;
  busy: boolean;
  onToggleLink: (id: string | null) => void;
  onCreateTask: (noteId: string, title: string) => void;
  onLinkTask: (taskId: string, noteId: string) => void;
}) {
  const [adding, setAdding] = useState("");
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const row =
    "block w-full truncate rounded-[7px] px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-soft";

  return (
    <div className="mt-3 border-t border-edge2 pt-2" onPointerDown={stop}>
      <Mono className="mb-1.5 block text-[8.5px] tracking-[0.1em] text-faint">WORK</Mono>

      {node.tasks.length === 0 && (
        <p className="m-0 mb-1 text-[11px] text-faint">Nothing delegated yet.</p>
      )}
      {node.tasks.map((t) => (
        <Link key={t.id} href={t.href} className={`${row} ${t.done ? "text-faint line-through" : "text-ink"}`}>
          <span className="font-mono text-[9px] text-faint">{t.id}</span> {t.title}
        </Link>
      ))}

      <input
        value={adding}
        disabled={busy}
        placeholder="+ add a task…"
        onChange={(e) => setAdding(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const title = adding.trim();
          if (!title) return;
          setAdding("");
          onCreateTask(node.id, title);
        }}
        className="mt-1 w-full rounded-[7px] border border-edge2 px-1.5 py-1 text-[11px] outline-none placeholder:text-faint focus:border-faint"
      />

      {unlinked && unlinked.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => onToggleLink(linkOpen ? null : node.id)}
            className="mt-1.5 font-mono text-[8.5px] tracking-[0.1em] text-faint transition-colors hover:text-ink"
          >
            {linkOpen ? "CLOSE" : `LINK EXISTING · ${unlinked.length}`}
          </button>
          {linkOpen && (
            <div className="mt-1 max-h-[140px] overflow-y-auto rounded-[8px] bg-soft p-1">
              {unlinked.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    onToggleLink(null);
                    onLinkTask(t.id, node.id);
                  }}
                  className={`${row} disabled:opacity-40`}
                >
                  <span className="font-mono text-[9px] text-faint">{t.id}</span> {t.title}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Moving one card rebuilds every node object, so without this every card
 * re-rendered on every pointermove frame.
 */
const CanvasCard = memo(
  CanvasCardBase,
  (a, b) =>
    a.node.id === b.node.id &&
    a.node.x === b.node.x &&
    a.node.y === b.node.y &&
    a.node.w === b.node.w &&
    a.node.h === b.node.h &&
    a.node.title === b.node.title &&
    a.node.preview === b.node.preview &&
    a.node.body === b.node.body &&
    a.tier === b.tier &&
    a.front === b.front &&
    a.node.tasks === b.node.tasks &&
    a.linkOpen === b.linkOpen &&
    a.busy === b.busy &&
    a.unlinked === b.unlinked &&
    a.canDelegate === b.canDelegate &&
    a.onCreateTask === b.onCreateTask &&
    a.onLinkTask === b.onLinkTask &&
    a.onToggleLink === b.onToggleLink &&
    a.node.color === b.node.color &&
    a.node.progress?.pct === b.node.progress?.pct &&
    a.node.progress?.done === b.node.progress?.done &&
    a.node.progress?.total === b.node.progress?.total &&
    a.edit === b.edit &&
    a.linking === b.linking &&
    a.isSource === b.isSource &&
    a.canDraw === b.canDraw &&
    a.onOpen === b.onOpen &&
    a.onStartLink === b.onStartLink &&
    a.onPickTarget === b.onPickTarget,
);
