"use client";

import { useState } from "react";

export default function WeeklyAnalysis() {
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
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-100">AI weekly analysis</h2>
        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="rounded bg-emerald-600/20 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
        >
          {loading ? "Analyzing…" : "Analyze my week"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-amber-400">{error}</p>}
      {text && (
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-3 text-sm text-neutral-200">
          {text}
        </pre>
      )}
      {loading && !text && (
        <p className="mt-3 text-sm text-neutral-500">Thinking…</p>
      )}
    </div>
  );
}
