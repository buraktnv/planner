"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewAreaForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [why, setWhy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, why }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to create area");
      }
      setName("");
      setWhy("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-600/20"
      >
        + New area
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Area name"
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
        autoFocus
      />
      <textarea
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Why (purpose)"
        rows={2}
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-emerald-600/20 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
