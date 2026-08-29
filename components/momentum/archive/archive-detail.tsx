"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ArchivedRow } from "@/lib/view/archive";
import type { Task } from "@/lib/core/types";
import { shortDate } from "@/lib/ui/momentum";
import { Mono } from "../primitives";
import Dialog from "../dialog";

export default function ArchiveDetail({
  row,
  onClose,
}: {
  row: ArchivedRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [why, setWhy] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/archive/${row.type}/${row.archivedAs}`;

  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { charter?: { why?: string }; tasks?: Task[] }) => {
        if (!live) return;
        setTasks(data.tasks ?? []);
        setWhy((data.charter?.why ?? "").trim());
      })
      .catch(() => {
        if (live) setError("Could not load this charter.");
      });
    return () => {
      live = false;
    };
  }, [url]);

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json()) as { error?: string; slug?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onClose();
      router.push(row.type === "project" ? `/projects/${data.slug}` : `/areas/${data.slug}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <Dialog label={row.name} onClose={() => (busy ? undefined : onClose())} maxWidth={620}>
      <>
        <div className="mb-3.5 flex items-center gap-2.5">
          <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: row.color }} />
          <Mono className="text-[9.5px] tracking-[0.08em] text-faint">
            ARCHIVED {shortDate(row.archivedAt)}
          </Mono>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-lg leading-none text-faint transition-colors hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <h2 className="m-0 mb-[18px] text-[21px] font-semibold leading-[1.25] tracking-[-0.025em]">
          {row.name}
        </h2>

        {why && (
          <div className="mb-5">
            <Mono className="mb-2 block text-[9px] tracking-[0.1em] text-faint">WHY</Mono>
            <div className="whitespace-pre-wrap rounded-[13px] bg-soft p-[13px] text-[13px] leading-[1.65]">
              {why}
            </div>
          </div>
        )}

        <Mono className="mb-2.5 block text-[9px] tracking-[0.1em] text-faint">
          TASKS {tasks ? `${tasks.filter((t) => t.done).length}/${tasks.length}` : ""}
        </Mono>
        {tasks === null ? (
          <Mono className="block text-[10px] text-faint">LOADING…</Mono>
        ) : tasks.length === 0 ? (
          <p className="m-0 text-[13px] text-faint">This charter had no tasks.</p>
        ) : (
          <div className="mb-5 flex flex-col">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-[11px] border-b border-edge2 py-2.5"
                style={{ paddingLeft: `${(t.id.split(".").length - 1) * 14}px` }}
              >
                <Mono className="text-[9.5px] text-faint">{t.id}</Mono>
                <span
                  className={`text-[13.5px] ${t.done ? "text-faint line-through" : "text-ink"}`}
                >
                  {t.title}
                </span>
                <Mono className="text-[9px] text-faint">
                  {t.done ? (t.doneDate ? shortDate(t.doneDate) : "DONE") : t.size}
                </Mono>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-3.5 rounded-[11px] bg-clay-tint px-3.5 py-2.5 text-[12.5px] text-clay-ink">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center gap-2">
          {confirm ? (
            <>
              <span className="text-[12.5px] text-dim">Bring this back as active?</span>
              <div className="flex-1" />
              <button
                type="button"
                disabled={busy}
                onClick={restore}
                className="rounded-[11px] px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-white disabled:opacity-40"
                style={{ background: row.color }}
              >
                {busy ? "RESTORING…" : "YES, RESTORE"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(false)}
                className="rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-dim transition-colors hover:text-ink disabled:opacity-40"
              >
                CANCEL
              </button>
            </>
          ) : (
            <>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setConfirm(true)}
                className="rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-dim transition-colors hover:text-ink"
              >
                RESTORE
              </button>
            </>
          )}
        </div>
      </>
    </Dialog>
  );
}
