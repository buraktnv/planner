"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProposalCard, { type ProposalState } from "../proposal-card";
import { Mono } from "../primitives";
import type { Proposal } from "@/lib/ai/schemas";
import type { DistillStatus } from "@/lib/view/distill";

export default function DistillPanel({ status }: { status: DistillStatus }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [state, setState] = useState<ProposalState>({ status: "idle" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auto, setAuto] = useState<Proposal | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/knowledge/pending")
      .then(async (res) => (await res.json()) as { proposal?: Proposal | null })
      .then((data) => {
        if (live && data.proposal) setAuto(data.proposal);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const shown = proposal ?? auto;
  const isAuto = !proposal && auto !== null;

  async function resolveAuto(outcome: "accepted" | "discarded", count: number) {
    if (!isAuto) return;
    await fetch("/api/knowledge/pending", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, count }),
    }).catch(() => undefined);
    setAuto(null);
  }

  async function distill() {
    setRunning(true);
    setMessage(null);
    setError(null);
    setProposal(null);
    setState({ status: "idle" });
    try {
      const res = await fetch("/api/knowledge/distill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 7 }),
      });
      const data = (await res.json()) as {
        proposal?: Proposal | null;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Distillation failed.");
      } else if (data.proposal) {
        setProposal(data.proposal);
      } else {
        setMessage(data.message ?? "Nothing worth filing.");
      }
    } catch {
      setError("Could not reach the server.");
    }
    setRunning(false);
  }

  async function accept() {
    if (!shown) return;
    setState({ status: "applying" });
    try {
      const res = await fetch("/api/proposals/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions: shown.actions }),
      });
      const data = (await res.json()) as {
        applied?: number;
        failedIndex?: number | null;
        results?: Array<{ ok: boolean; error?: string }>;
        error?: string;
      };
      if (!res.ok) {
        setState({ status: "error", error: data.error ?? "Could not apply." });
        return;
      }
      const failed = data.results?.find((r) => !r.ok);
      if (failed) {
        setState({ status: "error", applied: data.applied, error: failed.error });
        router.refresh();
        return;
      }
      setState({ status: "applied", applied: data.applied });
      await resolveAuto("accepted", data.applied ?? shown.actions.length);
      router.refresh();
    } catch {
      setState({ status: "error", error: "Could not reach the server." });
    }
  }

  return (
    <div className="mb-4 rounded-[18px] border border-dashed border-edge px-[17px] py-[15px]">
      <div className="flex flex-wrap items-center gap-3">
        <Mono className="text-[9.5px] tracking-[0.16em] text-faint">DISTILL</Mono>
        <span className="min-w-0 flex-1 text-[12.5px] leading-[1.5] text-dim">
          {status.headline}
        </span>
        <button
          type="button"
          onClick={distill}
          disabled={running || !status.ready}
          className="shrink-0 rounded-[11px] border border-edge bg-surf px-[14px] py-[8px] text-[12.5px] font-medium transition-colors hover:border-ink disabled:opacity-45 disabled:hover:border-edge"
        >
          {running ? "Reading the journal…" : "Distill 7 days"}
        </button>
      </div>

      {message ? <div className="mt-3 text-[12.5px] text-faint">{message}</div> : null}
      {error ? <div className="mt-3 text-[12.5px] text-wait-ink">{error}</div> : null}

      {isAuto ? (
        <Mono className="mt-3 block text-[9px] tracking-[0.14em] text-faint">
          FOUND ON ITS OWN — NOTHING IS WRITTEN UNTIL YOU ACCEPT
        </Mono>
      ) : null}

      {shown ? (
        <ProposalCard
          proposal={shown}
          state={state}
          onAccept={accept}
          onDiscard={() => {
            setState({ status: "discarded" });
            void resolveAuto("discarded", 0);
          }}
        />
      ) : null}
    </div>
  );
}
