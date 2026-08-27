"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectType, TaskSize } from "@/lib/core/types";

interface CharterOption {
  id: string;
  name: string;
  type: ProjectType;
}

const SIZES: TaskSize[] = ["S", "M", "L"];

export default function QuickCapture({ charters }: { charters: CharterOption[] }) {
  const router = useRouter();
  const [selection, setSelection] = useState("");
  const [title, setTitle] = useState("");
  const [size, setSize] = useState<TaskSize>("M");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const [type, slug] = selection.split("::") as [ProjectType, string];
    if (!slug || !title.trim()) {
      setError("Pick a project/area and enter a title");
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`/api/${type}s/${slug}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), size }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to add task");
      }
      setTitle("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <label className="flex flex-col text-xs text-neutral-400">
        Project / Area
        <select
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          className="mt-1 rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
        >
          <option value="">Select…</option>
          {charters.map((c) => (
            <option key={`${c.type}::${c.id}`} value={`${c.type}::${c.id}`}>
              {c.name} ({c.type})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col text-xs text-neutral-400">
        Task
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="mt-1 min-w-[12rem] rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
        />
      </label>
      <label className="flex flex-col text-xs text-neutral-400">
        Size
        <select
          value={size}
          onChange={(e) => setSize(e.target.value as TaskSize)}
          className="mt-1 rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
        >
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-emerald-600/20 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add"}
      </button>
      {error && <p className="w-full text-sm text-rose-400">{error}</p>}
    </form>
  );
}
