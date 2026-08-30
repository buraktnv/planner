"use client";

import Link from "next/link";
import type { Proposal } from "@/lib/ai/schemas";
import { LANES } from "@/lib/ui/momentum";
import { taskHrefFromScope } from "@/lib/view/task";
import Markdown from "./markdown";
import { Mono } from "./primitives";

export type ProposalStatus = "idle" | "applying" | "applied" | "discarded" | "error";

export interface ProposalState {
  status: ProposalStatus;
  applied?: number;
  error?: string;
}

export default function ProposalCard({
  proposal,
  state,
  onAccept,
  onDiscard,
  onReview,
  editedCount = 0,
  selectedCount,
  superseded = false,
  stale = false,
  revising = false,
}: {
  proposal: Proposal;
  state: ProposalState;
  onAccept: () => void;
  onDiscard: () => void;
  /**
   * Opens the review modal, where rows can be inspected, edited and unticked.
   * Absent on the distillation panel, which has no modal of its own — the
   * button is simply not shown there rather than being shown and dead.
   */
  onReview?: () => void;
  editedCount?: number;
  selectedCount?: number;
  /** Replaced by a revised batch. Kept visible — it is the only record of a
   *  hand edit the model may have overwritten — but no longer applicable. */
  superseded?: boolean;
  /** Another card in the same lineage has already been applied. */
  stale?: boolean;
  revising?: boolean;
}) {
  const dot = proposal.preview[0]?.color ?? "var(--color-faint)";
  const settled = state.status === "applied" || state.status === "discarded";
  const busy = state.status === "applying";
  const total = proposal.actions.length;
  const picked = selectedCount ?? total;
  const partial = picked < total;

  return (
    <div
      className={`mt-3 rounded-[14px] border border-edge bg-surf p-[13px] ${
        state.status === "discarded" || superseded || stale ? "opacity-45" : ""
      }`}
    >
      <div className="mb-[11px] flex items-center gap-2">
        <span className="h-[7px] w-[7px] shrink-0 rounded-[2px]" style={{ background: dot }} />
        <span className="min-w-0 flex-1 text-[12.5px] font-semibold">{proposal.title}</span>
        {proposal.preview[0]?.charterName && (
          <Mono className="shrink-0 text-[8.5px] tracking-[0.06em] text-faint">
            {proposal.preview[0].charterName.toUpperCase()}
          </Mono>
        )}
      </div>

      {proposal.summary && (
        <Markdown
          className="mb-[11px] text-[12px] leading-[1.5] text-dim [&>p]:m-0"
          diagrams={false}
        >
          {proposal.summary}
        </Markdown>
      )}

      <div className="mb-[13px] flex flex-col gap-[7px]">
        {proposal.preview.map((row, i) => {
          const lane = row.lane ? LANES[row.lane] : null;
          return (
            <div key={`${row.id}-${i}`} className="flex flex-col gap-[3px]">
              <div className="flex items-center gap-[9px]">
                {row.scope ? (
                  <Link
                    href={taskHrefFromScope(row.scope, row.id)}
                    aria-label={`Open ${row.id}`}
                    className="shrink-0"
                  >
                    <Mono className="text-[9px] text-faint transition-colors hover:text-ink hover:underline">
                      {row.id}
                    </Mono>
                  </Link>
                ) : (
                  <Mono className="shrink-0 text-[9px] text-faint">{row.id}</Mono>
                )}
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-dim">{row.title}</span>
                <Mono
                  className="shrink-0 rounded-[5px] px-1.5 py-[3px] text-[8.5px] tracking-[0.08em]"
                  style={
                    lane
                      ? { color: lane.ink, background: lane.tint }
                      : { color: "var(--color-faint)", background: "var(--color-soft)" }
                  }
                >
                  {lane ? lane.label.toUpperCase() : row.note.toUpperCase() || "EVENT"}
                </Mono>
              </div>
              {row.detail ? (
                <span className="pl-[30px] text-[11.5px] leading-[1.45] text-faint">
                  {row.detail}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {state.status === "applied" ? (
        <Mono className="text-[9.5px] tracking-[0.08em] text-quick-ink">
          ✓ APPLIED {state.applied ?? proposal.actions.length} CHANGES
        </Mono>
      ) : state.status === "discarded" ? (
        <Mono className="text-[9.5px] tracking-[0.08em] text-faint">DISCARDED</Mono>
      ) : superseded ? (
        <Mono className="text-[9.5px] tracking-[0.08em] text-faint">
          SUPERSEDED — REVISED BELOW
        </Mono>
      ) : stale ? (
        <Mono className="text-[9.5px] tracking-[0.08em] text-faint">
          SUPERSEDED — ANOTHER VERSION WAS APPLIED
        </Mono>
      ) : revising ? (
        <Mono className="text-[9.5px] tracking-[0.08em] text-faint">REVISING…</Mono>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={busy || settled || picked === 0}
            className="rounded-[9px] bg-quick px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Applying…" : partial ? `Accept ${picked} of ${total}` : "Accept"}
          </button>
          {onReview && (
            <button
              type="button"
              onClick={onReview}
              disabled={busy || settled}
              className="rounded-[9px] border border-edge px-3 py-2 text-[12.5px] text-dim transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
            >
              Review{total > 1 ? ` ${total}` : ""}…
            </button>
          )}
          <button
            type="button"
            onClick={onDiscard}
            disabled={busy || settled}
            className="rounded-[9px] border border-edge px-3 py-2 text-[12.5px] text-dim transition-colors hover:text-ink disabled:opacity-50"
          >
            Discard
          </button>
          {editedCount > 0 && (
            <Mono className="shrink-0 text-[8.5px] tracking-[0.08em] text-dim">
              {editedCount} EDITED
            </Mono>
          )}
          {state.status === "error" && state.error && (
            <Mono className="min-w-0 flex-1 truncate text-[8.5px] text-faint">{state.error}</Mono>
          )}
        </div>
      )}
    </div>
  );
}
