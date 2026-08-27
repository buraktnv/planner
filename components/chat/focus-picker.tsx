"use client";

import { useEffect, useState } from "react";

interface CharterLike {
  id: string;
  name: string;
  type: "project" | "area";
}

export default function FocusPicker({
  value,
  onChange,
}: {
  value: { type: "project" | "area"; slug: string } | null;
  onChange: (f: { type: "project" | "area"; slug: string } | null) => void;
}) {
  const [items, setItems] = useState<CharterLike[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json() as Promise<CharterLike[]>),
      fetch("/api/areas").then((r) => r.json() as Promise<CharterLike[]>),
    ])
      .then(([projects, areas]) => setItems([...projects, ...areas]))
      .catch(() => setItems([]));
  }, []);

  const current = value ? `${value.type}/${value.slug}` : "";

  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-500">
      Focus
      <select
        value={current}
        onChange={(e) => {
          const [type, slug] = e.target.value.split("/");
          onChange(slug ? { type: type as "project" | "area", slug } : null);
        }}
        className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-sm text-neutral-100 outline-none focus:border-emerald-500"
      >
        <option value="">Global (no focus)</option>
        {items.map((it) => (
          <option key={it.id} value={`${it.type}/${it.id}`}>
            {it.type}: {it.name}
          </option>
        ))}
      </select>
    </label>
  );
}
