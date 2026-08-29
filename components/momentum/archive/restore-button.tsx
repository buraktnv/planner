"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectType } from "@/lib/core/types";
import { Mono } from "../primitives";

export default function RestoreButton({
  type,
  archivedAs,
}: {
  type: ProjectType;
  archivedAs: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/archive/${type}/${archivedAs}`, { method: "POST" });
      const data = (await res.json()) as { error?: string; slug?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(type === "project" ? `/projects/${data.slug}` : `/areas/${data.slug}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div>
      {error && <Mono className="mb-2 block text-[10px] text-wait-ink">{error.toUpperCase()}</Mono>}
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <Mono className="text-[9.5px] tracking-[0.08em] text-dim">
            RESTORE THIS CHARTER AND ITS TASKS?
          </Mono>
          <button
            type="button"
            disabled={busy}
            onClick={restore}
            className="rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-ink transition-colors hover:bg-soft disabled:opacity-40"
          >
            {busy ? "RESTORING…" : "YES, RESTORE"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirm(false)}
            className="rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-faint transition-colors hover:text-ink disabled:opacity-40"
          >
            CANCEL
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-dim transition-colors hover:text-ink"
        >
          RESTORE
        </button>
      )}
    </div>
  );
}
