"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    <section className="space-y-3">
      <h2 className="text-lg font-medium text-neutral-100">About</h2>
      <form onSubmit={save} className="space-y-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={8}
          placeholder="A short bio / context for the assistant…"
          className="w-full rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-emerald-600/20 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {saved && <span className="text-sm text-emerald-400">Saved.</span>}
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
      </form>
    </section>
  );
}
