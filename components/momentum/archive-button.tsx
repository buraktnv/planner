"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectType } from "@/lib/core/types";
import Dialog from "./dialog";

export default function ArchiveButton({
  type,
  slug,
  name,
}: {
  type: ProjectType;
  slug: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archive = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/charters/${type}/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(((await res.json()) as { error?: string }).error ?? "Failed");
      }
      setOpen(false);
      router.push(type === "project" ? "/projects" : "/life");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-wait-ink"
      >
        DELETE
      </button>

      {open && (
        <Dialog
          label={`Archive ${name}`}
          onClose={() => (busy ? undefined : setOpen(false))}
          maxWidth={440}
          paddingTop={64}
        >
          <>
            <div className="mb-3 text-[17px] font-semibold tracking-[-0.02em]">
              Archive {name}?
            </div>
            <p className="m-0 text-[13px] leading-[1.6] text-dim">
              Its tasks move to archive/ in the data repo and disappear from the app. Nothing is
              destroyed.
            </p>

            {error && (
              <div className="mt-3.5 rounded-[11px] bg-clay-tint px-3.5 py-2.5 text-[12.5px] text-clay-ink">
                {error}
              </div>
            )}

            <div className="mt-[22px] flex gap-2.5 border-t border-edge2 pt-[18px]">
              <button
                type="button"
                onClick={archive}
                disabled={busy}
                className="rounded-[11px] bg-wait px-5 py-[11px] text-[13.5px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Archiving…" : "Archive"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="rounded-[11px] border border-edge px-4 py-[11px] text-[13.5px] text-dim transition-colors hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </>
        </Dialog>
      )}
    </>
  );
}
