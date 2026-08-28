"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mono, Rule } from "@/components/momentum/primitives";

export default function AboutEditor({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/about", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ about: value }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save about");
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <Rule label="GENERAL CONTEXT — ALWAYS SENT TO THE ASSISTANT" />
      <form onSubmit={save}>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={8}
          placeholder="Who you are, what matters, how you work best…"
          className="w-full resize-y rounded-[13px] border border-edge bg-surf px-3.5 py-3 text-[13px] leading-[1.6] outline-none placeholder:text-faint"
        />
        <div className="mt-2.5 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-[11px] bg-quick px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && (
            <Mono className="text-[9px] tracking-[0.08em] text-quick-ink">SAVED TO about.md</Mono>
          )}
        </div>
        {error && <p className="mt-2.5 text-[12.5px] text-clay-ink">{error}</p>}
      </form>
    </section>
  );
}
