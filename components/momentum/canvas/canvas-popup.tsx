"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CanvasEdgeModel, CanvasNodeModel } from "@/lib/view/canvas";
import { Bar, Mono } from "../primitives";
import Markdown from "../markdown";
import Dialog from "../dialog";

const KIND_LABEL: Record<string, string> = {
  requires: "REQUIRES",
  triggers: "TRIGGERS",
  rel: "RELATED",
};

/**
 * Depth 2 of three: canvas → popup → page. Rendered outside the canvas
 * transform, or it would be scaled and clipped along with the cards.
 */
export default function CanvasPopup({
  node,
  edges,
  titleOf,
  delegate,
  onClose,
  onOpenNode,
}: {
  node: CanvasNodeModel;
  edges: CanvasEdgeModel[];
  titleOf: (id: string) => string;
  delegate?: { type: string; slug: string };
  onClose: () => void;
  onOpenNode: (id: string) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [size, setSize] = useState<"S" | "M" | "L">("M");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const out = edges.filter((e) => e.from === node.id);
  const into = edges.filter((e) => e.to === node.id);

  /** Turns a component into work: a task carrying note:K-nnn back to this card. */
  const delegateTask = async () => {
    const text = title.trim();
    if (!delegate || !text || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const base = delegate.type === "project" ? "/api/projects" : "/api/areas";
      const res = await fetch(`${base}/${delegate.slug}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: text, size, note: node.id }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setTitle("");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const neighbour = (id: string, label: string, source: string) => (
    <button
      key={`${label}-${id}`}
      type="button"
      onClick={() => onOpenNode(id)}
      className="flex w-full items-center gap-2 border-b border-edge2 py-2 text-left last:border-b-0"
    >
      <Mono className="w-[76px] shrink-0 text-[8.5px] tracking-[0.1em] text-faint">{label}</Mono>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-dim">{titleOf(id)}</span>
      {source === "derived" && (
        <Mono className="shrink-0 text-[8.5px] tracking-[0.08em] text-faint">FROM TEXT</Mono>
      )}
    </button>
  );

  return (
    <Dialog label={node.title} onClose={onClose} maxWidth={560}>
      <>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: node.color }} />
          <Mono className="text-[9px] tracking-[0.1em] text-faint">
            {node.groupLabel.toUpperCase()}
          </Mono>
          <Mono className="text-[10px] text-faint">{node.id}</Mono>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-lg leading-none text-faint transition-colors hover:text-ink"
          >
            ×
          </button>
        </div>

        <h2 className="m-0 mb-2.5 text-[21px] font-semibold leading-[1.25] tracking-[-0.025em]">
          {node.title}
        </h2>

        <p className="m-0 mb-4 text-[13px] leading-[1.55] text-dim">{node.preview}</p>

        {node.tags.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-[7px]">
            {node.tags.map((t) => (
              <Mono key={t} className="rounded-[7px] bg-soft px-[9px] py-[4px] text-[9px] text-dim">
                {t}
              </Mono>
            ))}
          </div>
        )}

        {node.body?.trim() ? (
          <div className="mb-4 max-h-[38vh] overflow-y-auto rounded-[13px] bg-soft p-[13px]">
            <Markdown>{node.body.trim()}</Markdown>
          </div>
        ) : (
          <p className="m-0 mb-4 text-[12.5px] text-faint">This note has no body yet.</p>
        )}

        {(out.length > 0 || into.length > 0) && (
          <div className="mb-4">
            <Mono className="mb-1.5 block text-[9px] tracking-[0.1em] text-faint">CONNECTED</Mono>
            <div className="flex flex-col">
              {out.map((e) => neighbour(e.to, KIND_LABEL[e.kind] ?? e.kind, e.source))}
              {into.map((e) =>
                neighbour(e.from, `${KIND_LABEL[e.kind] ?? e.kind} ←`, e.source),
              )}
            </div>
          </div>
        )}

        {delegate && (
          <div className="mb-4 border-t border-edge2 pt-4">
            <Mono className="mb-2 block text-[9px] tracking-[0.1em] text-faint">
              WORK ON THIS
              {node.progress?.linked
                ? ` · ${node.progress.done}/${node.progress.total} DONE`
                : ""}
            </Mono>
            {node.progress?.linked && (
              <div className="mb-2.5">
                <Bar pct={node.progress.pct} color={node.color} />
              </div>
            )}
            {failed && (
              <Mono className="mb-2 block text-[10px] text-wait-ink">
                COULD NOT CREATE THAT TASK
              </Mono>
            )}
            <div className="flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void delegateTask();
                  }
                }}
                placeholder="Delegate a task…"
                aria-label={`Delegate a task from ${node.title}`}
                className="min-w-0 flex-1 rounded-[11px] border border-edge bg-bg px-3 py-2 text-[12.5px] outline-none placeholder:text-faint"
              />
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as "S" | "M" | "L")}
                aria-label="Size"
                className="rounded-[11px] border border-edge bg-bg px-2 py-2 font-mono text-[9.5px] tracking-[0.08em] text-dim outline-none"
              >
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
              </select>
              <button
                type="button"
                disabled={busy || title.trim() === ""}
                onClick={delegateTask}
                className="rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-dim transition-colors hover:text-ink disabled:opacity-40"
              >
                {busy ? "…" : "ADD"}
              </button>
            </div>
          </div>
        )}

        <Link
          href={node.href}
          className="inline-block rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-dim transition-colors hover:text-ink"
        >
          OPEN FULL PAGE →
        </Link>
      </>
    </Dialog>
  );
}
