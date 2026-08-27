"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  type: "project" | "area";
  slug: string;
  taskId: string;
}

export default function CompleteTask({ type, slug, taskId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function complete() {
    setBusy(true);
    try {
      await fetch(`/api/${type}s/${slug}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, complete: true }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <input
      type="checkbox"
      disabled={busy}
      onChange={complete}
      aria-label="Complete task"
      className="h-4 w-4 cursor-pointer accent-emerald-500 disabled:opacity-50"
    />
  );
}
