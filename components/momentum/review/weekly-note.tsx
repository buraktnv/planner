"use client";

import { useState } from "react";
import { Mono } from "@/components/momentum/primitives";

export default function WeeklyNote() {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    setText("");
    try {
      const res = await fetch("/api/insights/analyze", { method: "POST" });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setText(acc);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-[26px] border-l-[3px] border-quick pl-5">
        <div className="mb-3 flex items-center gap-3">
          <Mono className="text-[9px] tracking-[0.12em] text-faint">WHAT THE ASSISTANT NOTICED</Mono>
          <button
            type="button"
            onClick={analyze}
            disabled={loading}
            className="rounded-[9px] border border-edge bg-surf px-3 py-1.5 text-[11.5px] text-dim transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
          >
            {loading ? "Reading the week…" : text ? "Run it again" : "Analyze my week"}
          </button>
        </div>
        {error && (
          <p className="m-0 mb-3 max-w-[56ch] text-[13px] leading-[1.6] text-wait-ink">{error}</p>
        )}
        {text ? (
          <p className="m-0 max-w-[56ch] text-[15.5px] leading-[1.7] whitespace-pre-wrap text-ink [text-wrap:pretty]">
            {text}
          </p>
        ) : (
          !loading &&
          !error && (
            <p className="m-0 max-w-[56ch] text-[13.5px] leading-[1.6] text-faint">
              Not run yet. It reads your journal, tasks and charters — nothing is made up.
            </p>
          )
        )}
        {loading && !text && <p className="m-0 text-[13.5px] text-faint">Thinking…</p>}
      </div>
    </div>
  );
}
