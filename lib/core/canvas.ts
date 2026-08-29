import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectType } from "./types";
import { canvasPathFor } from "./paths";
import { appendJournal } from "./journal";
import { commitData } from "./git";
import { withDataLock } from "./locks";

export type CanvasSurface =
  | { kind: "knowledge" }
  | { kind: "system"; type: ProjectType; slug: string }
  | { kind: "tasks"; type: ProjectType; slug: string };

export type CanvasEdgeKind = "requires" | "triggers" | "rel";

export interface CanvasNodeLine {
  ref: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  pin?: boolean;
  /** Verbatim `key:value` pairs this build does not understand. Never dropped. */
  extra: string[];
}

export interface CanvasEdgeLine {
  from: string;
  to: string;
  kind: CanvasEdgeKind;
  label?: string;
  extra: string[];
}

export interface CanvasFile {
  nodes: CanvasNodeLine[];
  edges: CanvasEdgeLine[];
  /** Lines that parsed as nothing at all, kept so a rewrite cannot lose them. */
  unknown: string[];
}

export const EMPTY_CANVAS: CanvasFile = { nodes: [], edges: [], unknown: [] };

const REF_RE = /^(?:K-\d{3,}|T-\d+(?:\.\d+)*|G-\d{3,}|group:[a-z0-9][a-z0-9-]*)$/i;
const EDGE_KINDS: CanvasEdgeKind[] = ["requires", "triggers", "rel"];

export function canvasRefOk(ref: string): boolean {
  return typeof ref === "string" && REF_RE.test(ref);
}

export function edgeKey(e: { from: string; to: string; kind: CanvasEdgeKind }): string {
  return `${e.from}>${e.kind}>${e.to}`;
}

function intOr(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Total: this never throws, for anything.
 *
 * A canvas file is machine-written and touched by two processes, so it is the
 * likeliest file in the repo to end up malformed — and it only records where
 * cards sit. Losing a page over that would be absurd, which is the opposite of
 * `parseTasks`, where a mis-parse must stop the world rather than drop a task.
 * Anything unrecognised is preserved verbatim so an older build cannot silently
 * delete a field a newer one wrote.
 */
export function parseCanvas(raw: string): CanvasFile {
  const file: CanvasFile = { nodes: [], edges: [], unknown: [] };
  let section: "nodes" | "edges" | null = null;

  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    const heading = /^##\s*(nodes|edges)\s*$/i.exec(trimmed);
    if (heading) {
      section = heading[1].toLowerCase() as "nodes" | "edges";
      continue;
    }
    if (trimmed.startsWith("#")) continue;

    if (!trimmed.startsWith("- ")) {
      file.unknown.push(line);
      continue;
    }

    const parts = trimmed
      .slice(2)
      .split("|")
      .map((p) => p.trim());
    const head = parts[0] ?? "";
    const fields = new Map<string, string>();
    const extra: string[] = [];
    for (const p of parts.slice(1)) {
      const at = p.indexOf(":");
      if (at <= 0) {
        if (p !== "") extra.push(p);
        continue;
      }
      fields.set(p.slice(0, at).trim().toLowerCase(), p.slice(at + 1).trim());
    }

    const arrow = head.split(">").map((s) => s.trim());
    const isEdge = arrow.length === 2 && canvasRefOk(arrow[0]) && canvasRefOk(arrow[1]);

    if (isEdge && section !== "nodes") {
      const rawKind = (fields.get("kind") ?? "rel").toLowerCase();
      const kind = (EDGE_KINDS as string[]).includes(rawKind)
        ? (rawKind as CanvasEdgeKind)
        : "rel";
      fields.delete("kind");
      const label = fields.get("label");
      fields.delete("label");
      file.edges.push({
        from: arrow[0],
        to: arrow[1],
        kind,
        ...(label ? { label } : {}),
        extra: [...extra, ...[...fields].map(([k, v]) => `${k}:${v}`)],
      });
      continue;
    }

    if (canvasRefOk(head) && section !== "edges") {
      const x = intOr(fields.get("x"), 0);
      const y = intOr(fields.get("y"), 0);
      if (x === null || y === null) {
        file.unknown.push(line);
        continue;
      }
      const w = fields.has("w") ? intOr(fields.get("w"), 0) : undefined;
      const h = fields.has("h") ? intOr(fields.get("h"), 0) : undefined;
      const pin = fields.get("pin");
      for (const k of ["x", "y", "w", "h", "pin"]) fields.delete(k);
      file.nodes.push({
        ref: head,
        x,
        y,
        ...(w !== null && w !== undefined ? { w } : {}),
        ...(h !== null && h !== undefined ? { h } : {}),
        ...(pin === "1" || pin === "true" ? { pin: true } : {}),
        extra: [...extra, ...[...fields].map(([k, v]) => `${k}:${v}`)],
      });
      continue;
    }

    file.unknown.push(line);
  }

  return file;
}

/**
 * Canonical form: nodes by ref, edges by key, unknown lines last. Serializing
 * is therefore not byte-identical to arbitrary input — it is *stable* (a second
 * pass changes nothing) and *lossless* (every ref, field and unknown line
 * survives), which is what protects the file from a rewrite by an older build.
 */
export function serializeCanvas(file: CanvasFile): string {
  const nodes = [...file.nodes].sort((a, b) => a.ref.localeCompare(b.ref));
  const edges = [...file.edges].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)));

  const out: string[] = ["## Nodes"];
  for (const n of nodes) {
    const fields = [`x:${n.x}`, `y:${n.y}`];
    if (n.w !== undefined) fields.push(`w:${n.w}`);
    if (n.h !== undefined) fields.push(`h:${n.h}`);
    if (n.pin) fields.push("pin:1");
    out.push(`- ${[n.ref, ...fields, ...n.extra].join(" | ")}`);
  }

  out.push("", "## Edges");
  for (const e of edges) {
    const fields = [`kind:${e.kind}`];
    if (e.label) fields.push(`label:${e.label}`);
    out.push(`- ${[`${e.from} > ${e.to}`, ...fields, ...e.extra].join(" | ")}`);
  }

  if (file.unknown.length > 0) out.push("", ...file.unknown);
  return `${out.join("\n")}\n`;
}

export function canvasPath(surface: CanvasSurface): string {
  return canvasPathFor(surface);
}

function scopeOf(surface: CanvasSurface): string {
  return surface.kind === "knowledge" ? "knowledge" : surface.slug;
}

function labelOf(surface: CanvasSurface): string {
  return surface.kind === "knowledge" ? "knowledge" : `${surface.kind} ${surface.slug}`;
}

export async function readCanvas(surface: CanvasSurface): Promise<CanvasFile> {
  try {
    return parseCanvas(await fs.readFile(canvasPath(surface), "utf8"));
  } catch {
    return { nodes: [], edges: [], unknown: [] };
  }
}

export interface NodeMove {
  ref: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

function applyMoves(file: CanvasFile, moves: NodeMove[]): CanvasFile {
  const byRef = new Map(file.nodes.map((n) => [n.ref, n]));
  for (const m of moves) {
    if (!canvasRefOk(m.ref)) continue;
    const existing = byRef.get(m.ref);
    byRef.set(m.ref, {
      ...(existing ?? { ref: m.ref, extra: [] }),
      ref: m.ref,
      x: Math.round(m.x),
      y: Math.round(m.y),
      ...(m.w !== undefined ? { w: Math.round(m.w) } : {}),
      ...(m.h !== undefined ? { h: Math.round(m.h) } : {}),
    });
  }
  return { ...file, nodes: [...byRef.values()] };
}

/**
 * Every writer re-reads inside the lock and merges by ref. Reading first and
 * writing later is the classic lost update: the MCP process or a second tab
 * writes in between, and a whole-file rewrite silently clobbers it.
 */
async function mutate(
  surface: CanvasSurface,
  message: string,
  change: (file: CanvasFile) => CanvasFile,
): Promise<CanvasFile> {
  return withDataLock(async () => {
    const before = await readCanvas(surface);
    const after = change(before);
    const text = serializeCanvas(after);
    if (text === serializeCanvas(before)) return after;
    const file = canvasPath(surface);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text, "utf8");
    await appendJournal(scopeOf(surface), `canvas: ${message}`);
    await commitData(`canvas: ${message} (${labelOf(surface)})`);
    return after;
  });
}

export function saveNodePositions(
  surface: CanvasSurface,
  moves: NodeMove[],
): Promise<CanvasFile> {
  const n = moves.length;
  return mutate(surface, `${n} node${n === 1 ? "" : "s"} moved`, (f) => applyMoves(f, moves));
}

export function addCanvasEdge(
  surface: CanvasSurface,
  edge: { from: string; to: string; kind: CanvasEdgeKind; label?: string },
): Promise<CanvasFile> {
  return mutate(surface, `${edge.kind} ${edge.from} → ${edge.to}`, (f) => {
    if (!canvasRefOk(edge.from) || !canvasRefOk(edge.to) || edge.from === edge.to) return f;
    const key = edgeKey(edge);
    if (f.edges.some((e) => edgeKey(e) === key)) return f;
    return { ...f, edges: [...f.edges, { ...edge, extra: [] }] };
  });
}

export function removeCanvasEdge(
  surface: CanvasSurface,
  edge: { from: string; to: string; kind: CanvasEdgeKind },
): Promise<CanvasFile> {
  const key = edgeKey(edge);
  return mutate(surface, `removed ${edge.kind} ${edge.from} → ${edge.to}`, (f) => ({
    ...f,
    edges: f.edges.filter((e) => edgeKey(e) !== key),
  }));
}

/**
 * Drop refs whose note or task no longer exists. Deliberately explicit and
 * never automatic: a completed task can be reopened, and silently forgetting
 * where it sat is a small, avoidable loss.
 */
export function pruneCanvas(
  surface: CanvasSurface,
  liveRefs: string[],
): Promise<CanvasFile> {
  const live = new Set(liveRefs);
  const keep = (ref: string) => live.has(ref) || ref.startsWith("group:");
  return mutate(surface, "pruned stale references", (f) => ({
    ...f,
    nodes: f.nodes.filter((n) => keep(n.ref)),
    edges: f.edges.filter((e) => keep(e.from) && keep(e.to)),
  }));
}
