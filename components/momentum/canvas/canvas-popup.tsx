"use client";

import Link from "next/link";
import type { CanvasEdgeModel, CanvasNodeModel } from "@/lib/view/canvas";
import { Mono } from "../primitives";
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
  onClose,
  onOpenNode,
}: {
  node: CanvasNodeModel;
  edges: CanvasEdgeModel[];
  titleOf: (id: string) => string;
  onClose: () => void;
  onOpenNode: (id: string) => void;
}) {
  const out = edges.filter((e) => e.from === node.id);
  const into = edges.filter((e) => e.to === node.id);

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
