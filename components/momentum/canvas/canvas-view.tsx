"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Mono } from "../primitives";
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

export default function CanvasView({
  model,
  surface,
  title,
}: {
  model: CanvasModel;
  surface: Record<string, unknown>;
  title: string;
}) {
  const router = useRouter();
  const stage = useRef<HTMLDivElement | null>(null);
  const [vp, setVp] = useState<Viewport>({ tx: 60, ty: 60, k: 1 });
  const [edit, setEdit] = useState(false);
  const [local, setLocal] = useState<Record<string, Point>>({});
  const [dirty, setDirty] = useState<Record<string, Point>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
            {edges.map((e) => (
              <g key={e.key}>
                <path
                  d={e.d}
                  fill="none"
                  stroke="var(--color-edge)"
                  strokeWidth={e.source === "derived" ? 1.2 : 1.8}
                  strokeDasharray={e.kind === "triggers" ? "5 5" : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                <path d={e.head} fill="var(--color-edge)" />
              </g>
            ))}
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
            <CanvasCard key={n.id} node={n} edit={edit} onOpen={() => setOpenId(n.id)} />
          ))}
        </div>

        {nodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="m-0 text-[13px] text-faint">Nothing to map yet.</p>
          </div>
        )}
      </div>

      {open && (
        <CanvasPopup
          node={open}
          edges={edges}
          titleOf={titleOf}
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
  onOpen,
}: {
  node: CanvasNodeModel;
  edit: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      data-drag-ref={node.id}
      className={`absolute overflow-hidden rounded-[14px] border bg-surf px-3.5 py-3 ${
        edit ? "cursor-grab border-edge" : "border-edge2"
      }`}
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
        onClick={onOpen}
        className="mb-1.5 block w-full text-left text-[13px] font-semibold leading-[1.3] tracking-[-0.01em] hover:underline"
      >
        {node.title}
      </button>
      <p className="m-0 overflow-hidden text-[11.5px] leading-[1.45] text-dim">{node.preview}</p>
      <Mono className="absolute bottom-2 right-3 text-[8.5px] text-faint">{node.id}</Mono>
    </div>
  );
}
