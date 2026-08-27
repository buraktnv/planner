"use client";

import { useEffect, useState } from "react";
import type { ProvidersFile } from "@/lib/core/types";

export default function ProfilePicker({
  value,
  onChange,
  onLoaded,
}: {
  value: string;
  onChange: (id: string) => void;
  onLoaded: (p: ProvidersFile) => void;
}) {
  const [providers, setProviders] = useState<ProvidersFile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((p: ProvidersFile) => {
        setProviders(p);
        onLoaded(p);
      })
      .catch(() => setError(true));
  }, [onLoaded]);

  if (error) return <span className="text-sm text-red-400">Failed to load profiles</span>;
  if (!providers) return <span className="text-sm text-neutral-500">Loading profiles…</span>;

  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-500">
      Profile
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500"
      >
        {providers.profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
            {p.id === providers.default ? " (default)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
