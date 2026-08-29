import { NextResponse } from "next/server";
import {
  addCanvasEdge,
  canvasRefOk,
  removeCanvasEdge,
  saveNodePositions,
  type CanvasEdgeKind,
  type CanvasSurface,
} from "@/lib/core/canvas";
import { listCharters } from "@/lib/core/store";

export const dynamic = "force-dynamic";

const KINDS: CanvasEdgeKind[] = ["requires", "triggers", "rel"];

/**
 * A surface names a file path, and the slug arrives over HTTP — so it is
 * checked against the real charter list before it can reach path.join, the
 * same reasoning that put assertTaskId in details.ts.
 */
async function readSurface(raw: unknown): Promise<CanvasSurface | null> {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { kind?: unknown; type?: unknown; slug?: unknown };
  if (s.kind === "knowledge") return { kind: "knowledge" };
  if (s.kind !== "system" && s.kind !== "tasks") return null;
  if (s.type !== "project" && s.type !== "area") return null;
  if (typeof s.slug !== "string") return null;
  const charters = await listCharters(s.type);
  if (!charters.some((c) => c.id === s.slug)) return null;
  return { kind: s.kind, type: s.type, slug: s.slug };
}

function readMoves(raw: unknown) {
  if (!Array.isArray(raw)) return null;
  const moves = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { ref, x, y, w, h } = m as Record<string, unknown>;
    if (typeof ref !== "string" || !canvasRefOk(ref)) return null;
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    moves.push({
      ref,
      x,
      y,
      ...(typeof w === "number" && Number.isFinite(w) ? { w } : {}),
      ...(typeof h === "number" && Number.isFinite(h) ? { h } : {}),
    });
  }
  return moves;
}

function readEdge(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const { from, to, kind, label } = raw as Record<string, unknown>;
  if (typeof from !== "string" || !canvasRefOk(from)) return null;
  if (typeof to !== "string" || !canvasRefOk(to)) return null;
  if (from === to) return null;
  if (typeof kind !== "string" || !KINDS.includes(kind as CanvasEdgeKind)) return null;
  return {
    from,
    to,
    kind: kind as CanvasEdgeKind,
    ...(typeof label === "string" && label.trim() ? { label: label.trim() } : {}),
  };
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { surface?: unknown; moves?: unknown };
    const surface = await readSurface(body.surface);
    if (!surface) return NextResponse.json({ error: "unknown surface" }, { status: 400 });
    const moves = readMoves(body.moves);
    if (!moves) return NextResponse.json({ error: "invalid moves" }, { status: 400 });
    await saveNodePositions(surface, moves);
    return NextResponse.json({ ok: true, saved: moves.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { surface?: unknown; edge?: unknown };
    const surface = await readSurface(body.surface);
    if (!surface) return NextResponse.json({ error: "unknown surface" }, { status: 400 });
    const edge = readEdge(body.edge);
    if (!edge) return NextResponse.json({ error: "invalid edge" }, { status: 400 });
    await addCanvasEdge(surface, edge);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { surface?: unknown; edge?: unknown };
    const surface = await readSurface(body.surface);
    if (!surface) return NextResponse.json({ error: "unknown surface" }, { status: 400 });
    const edge = readEdge(body.edge);
    if (!edge) return NextResponse.json({ error: "invalid edge" }, { status: 400 });
    await removeCanvasEdge(surface, edge);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 },
    );
  }
}
