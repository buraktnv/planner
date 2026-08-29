"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CanvasModel, CanvasNodeModel } from "@/lib/view/canvas";
import {
  arrowHead,
  boundsOf,
  clampZoom,
  edgePath,
  fitTo,
  toCanvas,
  type Point,
  type Rect,
} from "@/lib/view/canvas-layout";
import { Bar, Mono } from "../primitives";
import CanvasPopup from "./canvas-popup";

interface Viewport {
  tx: number;
  ty: number;
  k: number;
}

type Drag =
  | { kind: "pan"; startX: number; startY: number; tx: number; ty: number }
  | { kind: "card"; id: string; startX: number; startY: number; from: Point; moved: boolean };

const MOVE_THRESHOLD = 4;

type LinkKind = "requires" | "triggers";

export default function CanvasView({
  model,
  surface,
  title,
  backHref,
  drawEdges = false,
  delegate,
}: {
  model: CanvasModel;
  surface: Record<string, unknown>;
  title: string;
  backHref?: string;
  /** System canvases let you draw requires/triggers arrows; the knowledge one does not. */
  drawEdges?: boolean;
  /** Where a delegated task is created. Absent on the knowledge canvas. */
  delegate?: { type: string; slug: string };
}) {
  const router = useRouter();
  const stage = useRef<HTMLDivElement | null>(null);
  const [vp, setVp] = useState<Viewport>({ tx: 60, ty: 60, k: 1 });
  const [edit, setEdit] = useState(false);
  const [local, setLocal] = useState<Record<string, Point>>({});
  const [dirty, setDirty] = useState<Record<string, Point>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
    () => model.nodes.map((n) => ({ ...n, ...(local[n.id] ?? {}) })),
    [model.nodes, local],
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

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const cardId = edit ? target.closest<HTMLElement>("[data-drag-ref]")?.dataset.dragRef : null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (cardId) {
      const node = nodes.find((n) => n.id === cardId);
      if (!node) return;
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
    // Canvas deltas: dragging IS divided by k, or cards drift when zoomed.
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
  };

  const pendingCount = Object.keys(dirty).length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setLinkFrom(null);
      setSelectedEdge(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const post = async (method: "POST" | "DELETE", edge: Record<string, unknown>) => {
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
  };

  /** Two clicks rather than a rubber band: far more robust at any zoom. */
  const pickTarget = (to: string) => {
    const from = linkFrom;
    setLinkFrom(null);
    if (!from || from === to) return;
    void post("POST", { from, to, kind: linkKind });
  };

  const deleteSelected = () => {
    const edge = edges.find((e) => e.key === selectedEdge);
    setSelectedEdge(null);
    if (!edge || edge.source === "derived") return;
    void post("DELETE", { from: edge.from, to: edge.to, kind: edge.kind });
  };

  const save = async () => {
    if (pendingCount === 0 || saving) return;
    setSaving(true);
    try {
      const moves = Object.entries(dirty).map(([ref, p]) => ({ ref, x: p.x, y: p.y }));
      const res = await fetch("/api/canvas", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface, moves }),
      });
      if (!res.ok) return;
      setDirty({});
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const open = openId ? (nodes.find((n) => n.id === openId) ?? null) : null;
  const titleOf = (id: string) => nodes.find((n) => n.id === id)?.title ?? id;

  const button = "rounded-lg border px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em]";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-[7px] px-9 pt-[26px] pb-3">
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
            {edges.map((e) => {
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

          {nodes.map((n) => (
            <CanvasCard
              key={n.id}
              node={n}
              edit={edit}
              linking={linkFrom !== null}
              isSource={linkFrom === n.id}
              canDraw={drawEdges}
              onOpen={() => setOpenId(n.id)}
              onStartLink={() => setLinkFrom(n.id)}
              onPickTarget={() => pickTarget(n.id)}
            />
          ))}
        </div>

        {nodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="m-0 text-[13px] text-faint">Nothing to map yet.</p>
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

function CanvasCard({
  node,
  edit,
  linking,
  isSource,
  canDraw,
  onOpen,
  onStartLink,
  onPickTarget,
}: {
  node: CanvasNodeModel;
  edit: boolean;
  linking: boolean;
  isSource: boolean;
  canDraw: boolean;
  onOpen: () => void;
  onStartLink: () => void;
  onPickTarget: () => void;
}) {
  return (
    <div
      // Not draggable while picking a link target, or the click becomes a drag.
      data-drag-ref={linking ? undefined : node.id}
      onPointerDown={linking && !isSource ? () => onPickTarget() : undefined}
      className={`absolute overflow-hidden rounded-[14px] border bg-surf px-3.5 py-3 ${
        isSource ? "border-ink" : edit ? "border-edge" : "border-edge2"
      } ${linking && !isSource ? "cursor-crosshair" : edit ? "cursor-grab" : ""}`}
      style={{
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        borderLeft: `3px solid ${node.color}`,
      }}
    >
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={linking ? onPickTarget : onOpen}
        className="mb-1.5 block w-full pr-6 text-left text-[13px] font-semibold leading-[1.3] tracking-[-0.01em] hover:underline"
      >
        {node.title}
      </button>
      <p className="m-0 overflow-hidden text-[11.5px] leading-[1.45] text-dim">{node.preview}</p>
      {node.progress?.linked && (
        <div className="absolute inset-x-3.5 bottom-[22px]">
          <Bar pct={node.progress.pct} color={node.color} height={3} />
          <Mono className="mt-1 block text-[8.5px] text-faint">
            {node.progress.done}/{node.progress.total} TASKS
          </Mono>
        </div>
      )}
      <Mono className="absolute bottom-2 right-3 text-[8.5px] text-faint">{node.id}</Mono>

      {canDraw && edit && !linking && (
        <button
          type="button"
          aria-label={`Draw an arrow from ${node.title}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onStartLink}
          className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-[7px] border border-edge bg-bg font-mono text-[11px] leading-none text-faint transition-colors hover:text-ink"
        >
          →
        </button>
      )}
    </div>
  );
}
