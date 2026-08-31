"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Proposal, ProposalApplyResult } from "@/lib/ai/schemas";
import {
  buildDraft,
  remainderDraft,
  selectedActions,
  type ReviewDraft,
} from "@/lib/view/proposal-review";
import { ageLabel, rowSummary, statusLabel, type ProposalRow } from "@/lib/view/proposals";
import ProposalReview from "@/components/momentum/chat/proposal-review";
import { Empty, Mono } from "@/components/momentum/primitives";

export interface ProposalEntry {
  row: ProposalRow;
  /** Null when nothing in the batch is still applicable. */
  proposal: Proposal | null;
}

const TINT: Record<string, { color: string; background: string }> = {
  pending: { color: "var(--color-quick-ink)", background: "var(--color-quick-tint)" },
  applying: { color: "var(--color-deep-ink)", background: "var(--color-deep-tint)" },
  applied: { color: "var(--color-faint)", background: "var(--color-soft)" },
  partial: { color: "var(--color-wait-ink)", background: "var(--color-wait-tint)" },
  discarded: { color: "var(--color-faint)", background: "var(--color-soft)" },
};

export default function ProposalsView({ entries }: { entries: ProposalEntry[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const open = entries.find((e) => e.row.id === openId) ?? null;
  const draft = openId ? drafts[openId] : undefined;

  const openCard = (entry: ProposalEntry) => {
    if (!entry.proposal) return;
    setOpenId(entry.row.id);
    setDrafts((prev) =>
      prev[entry.row.id]
        ? prev
        : // The modal needs a toolCallId it can key by; a filed proposal has no
          // chat turn behind it, so its own id serves.
          { ...prev, [entry.row.id]: buildDraft(entry.proposal!, entry.row.id) },
    );
  };

  const accept = async () => {
    if (!openId || !draft || busy) return;
    const id = openId;
    setBusy(true);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/proposals/${id}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actions: selectedActions(draft) }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data && typeof data === "object" && "error" in data
            ? String((data as { error: unknown }).error)
            : "Could not apply";
        setErrors((prev) => ({ ...prev, [id]: message }));
        return;
      }
      const result = data as ProposalApplyResult;
      if (result.failedIndex !== null) {
        // Everything before the failure is already committed. Rebuild from the
        // per-row results so Accept resumes rather than writing them twice.
        setDrafts((prev) => ({ ...prev, [id]: remainderDraft(draft, result) }));
        setErrors((prev) => ({
          ...prev,
          [id]: `Stopped at row ${result.failedIndex! + 1}. The rows above it are already saved.`,
        }));
        router.refresh();
        return;
      }
      setOpenId(null);
      router.refresh();
    } catch {
      setErrors((prev) => ({ ...prev, [id]: "Could not reach the server" }));
    } finally {
      setBusy(false);
    }
  };

  const discard = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "discarded" }),
      });
      setOpenId(null);
      router.refresh();
    } catch {
      setErrors((prev) => ({ ...prev, [id]: "Could not reach the server" }));
    } finally {
      setBusy(false);
    }
  };

  if (entries.length === 0) {
    return (
      <div className="mt-6">
        <Empty>
          Nothing waiting. When an assistant proposes a batch of changes — from this app or from a
          coding agent over MCP — it lands here until you accept or discard it.
        </Empty>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-2.5">
      {entries.map(({ row, proposal }) => {
        const tint = TINT[row.status] ?? TINT.pending;
        const actionable = row.status === "pending" && proposal !== null;
        return (
          <div
            key={row.id}
            className="rounded-[18px] border border-edge bg-surf px-[17px] py-[15px]"
          >
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="min-w-0 flex-1 text-[14px] font-semibold tracking-[-0.01em]">
                {row.title}
              </span>
              <Mono
                className="shrink-0 rounded-[5px] px-[7px] py-[3px] text-[8px] tracking-[0.1em]"
                style={tint}
              >
                {statusLabel(row.status)}
              </Mono>
            </div>

            <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
              <span className="text-[12.5px] text-dim">{rowSummary(row)}</span>
              <Mono className="text-[9px] tracking-[0.06em] text-faint">
                {row.agent}
                {row.created ? ` · ${ageLabel(row.created)}` : ""}
              </Mono>
            </div>

            {row.summary && (
              <p className="mt-2 mb-0 text-[12.5px] leading-[1.5] text-dim">{row.summary}</p>
            )}
            {row.outcome && (
              <Mono className="mt-2 block text-[9.5px] tracking-[0.04em] text-faint">
                {row.outcome}
              </Mono>
            )}
            {errors[row.id] && (
              <p className="mt-2 mb-0 text-[12px] leading-[1.45] text-wait-ink">{errors[row.id]}</p>
            )}

            <div className="mt-3 flex items-center gap-2">
              {actionable ? (
                <>
                  <button
                    type="button"
                    onClick={() => openCard({ row, proposal })}
                    className="rounded-[10px] bg-ink px-[13px] py-[7px] text-[12px] font-medium text-bg transition-opacity hover:opacity-90"
                  >
                    Review {row.actions.length}{" "}
                    {row.actions.length === 1 ? "change" : "changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => discard(row.id)}
                    disabled={busy}
                    className="rounded-[10px] border border-edge px-[13px] py-[7px] text-[12px] text-dim transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
                  >
                    Discard
                  </button>
                </>
              ) : (
                <Mono className="text-[9px] tracking-[0.06em] text-faint">
                  {row.status === "applying"
                    ? "BEING APPLIED"
                    : row.empty
                      ? "NOTHING LEFT TO APPLY"
                      : "SETTLED"}
                </Mono>
              )}
            </div>
          </div>
        );
      })}

      {open && draft && (
        <ProposalReview
          draft={draft}
          busy={busy}
          revising={false}
          /* Filed proposals carry no chat lineage; the persisted status is what
             says whether this batch has already been written. */
          stale={open.row.status !== "pending"}
          error={errors[open.row.id] || undefined}
          onChange={(next) => setDrafts((prev) => ({ ...prev, [open.row.id]: next }))}
          onAccept={accept}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
