"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProposalCard, { type ProposalState } from "../proposal-card";
import { Mono } from "../primitives";
import type { Proposal, ProposalApplyResult } from "@/lib/ai/schemas";

interface CompareReply {
  verdict?: string;
  summaryStillTrue?: boolean;
  proposal?: Proposal | null;
  error?: string;
}

/**
 * Asks a model whether the summary and the AI section still match the body.
 * The answer arrives as a filed proposal, never a write: Accept goes through
 * the claiming apply route the chat rail uses, and a card closed without a
 * decision is still waiting on /proposals.
 */
export default function ComparePanel({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [stillTrue, setStillTrue] = useState<boolean | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [state, setState] = useState<ProposalState>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function compare() {
    setRunning(true);
    setError(null);
    setVerdict(null);
    setProposal(null);
    setState({ status: "idle" });
    try {
      const res = await fetch(`/api/knowledge/${noteId}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as CompareReply;
      if (!res.ok) {
        setError(data.error ?? "Could not compare.");
      } else {
        setVerdict(data.verdict ?? "");
        setStillTrue(data.summaryStillTrue ?? null);
        setProposal(data.proposal ?? null);
      }
    } catch {
      setError("Could not reach the server.");
    }
    setRunning(false);
  }

  async function accept() {
    if (!proposal) return;
    setState({ status: "applying" });
    try {
      const res = await fetch(`/api/proposals/${proposal.proposalId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: proposal.actions }),
      });
      const data = (await res.json()) as ProposalApplyResult & { error?: string };
      if (!res.ok) {
        setState({ status: "error", error: data.error ?? "Could not apply." });
        return;
      }
      const failed = data.results?.find((r) => !r.ok);
      if (failed) {
        setState({ status: "error", applied: data.applied, error: failed.error });
        return;
      }
      setState({ status: "applied", applied: data.applied });
      router.refresh();
    } catch {
      setState({ status: "error", error: "Could not reach the server." });
    }
  }

  async function discard() {
    if (!proposal) return;
    setState({ status: "discarded" });
    void fetch(`/api/proposals/${proposal.proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "discarded" }),
    }).catch(() => undefined);
  }

  return (
    <div className="mt-5 rounded-[14px] border border-dashed border-edge px-[15px] py-[13px]">
      <div className="flex flex-wrap items-center gap-3">
        <Mono className="text-[9px] tracking-[0.16em] text-faint">COMPARE</Mono>
        <span className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-dim">
          Ask a model whether the summary and this section still say what the note says.
        </span>
        <button
          type="button"
          onClick={compare}
          disabled={running}
          className="shrink-0 rounded-[11px] border border-edge bg-surf px-[14px] py-[8px] text-[12.5px] font-medium transition-colors hover:border-ink disabled:opacity-45 disabled:hover:border-edge"
        >
          {running ? "Reading the note…" : "Compare"}
        </button>
      </div>

      {error ? <div className="mt-3 text-[12.5px] text-wait-ink">{error}</div> : null}

      {verdict !== null ? (
        <div className="mt-3 rounded-[11px] bg-soft px-[12px] py-[9px]">
          <Mono className="mb-1 block text-[8px] tracking-[0.14em] text-faint">
            {stillTrue === false ? "SUMMARY NO LONGER TRUE" : "VERDICT"}
          </Mono>
          <div className="text-[12.5px] leading-[1.55] text-ink">
            {verdict || "Nothing to change."}
          </div>
        </div>
      ) : null}

      {proposal ? (
        <>
          <ProposalCard proposal={proposal} state={state} onAccept={accept} onDiscard={discard} />
          <Mono className="mt-2 block text-[8px] tracking-[0.1em] text-faint">
            TO EDIT BEFORE ACCEPTING, OPEN IT ON{" "}
            <Link href="/proposals" className="underline">
              /PROPOSALS
            </Link>
          </Mono>
        </>
      ) : null}
    </div>
  );
}
