"use client";

import { useEffect, useState } from "react";
import type { ProjectType } from "@/lib/core/types";
import { taskHref } from "@/lib/view/task";
import { linkifyTaskRefs } from "@/lib/view/task-refs";
import { Mono } from "./primitives";
import Markdown from "./markdown";

export default function TaskPlan({
  type,
  slug,
  taskId,
  color,
  knownIds = [],
  from,
  onSaved,
}: {
  type: ProjectType;
  slug: string;
  taskId: string;
  color: string;
  knownIds?: string[];
  from?: string | null;
  onSaved?: (hasPlan: boolean) => void;
}) {
  const [body, setBody] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/tasks/${type}/${slug}/${taskId}/detail`;

  /** The task being read links nowhere — it is already on screen. */
  const hrefForRef = (id: string) => {
    if (id === taskId || !knownIds.includes(id)) return null;
    return `${taskHref(type, slug, id)}${from ? `?from=${encodeURIComponent(from)}` : ""}`;
  };

  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { body?: string }) => {
        if (live) setBody(typeof data.body === "string" ? data.body : "");
      })
      .catch(() => {
        if (live) setError("Could not load the plan.");
      });
    return () => {
      live = false;
    };
  }, [url]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { body?: string };
      const next = typeof data.body === "string" ? data.body : "";
      setBody(next);
      setEditing(false);
      onSaved?.(next.trim() !== "");
    } catch {
      setError("Could not save the plan.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setDraft(body ?? "");
    setEditing(true);
  };

  return (
    <div className="mb-5">
      <div className="mb-2.5 flex items-center gap-2">
        <Mono className="block text-[9px] tracking-[0.1em] text-faint">PLAN</Mono>
        <div className="flex-1" />
        {!editing && body !== null && (
          <button
            type="button"
            onClick={startEdit}
            className="font-mono text-[9px] tracking-[0.08em] text-faint transition-colors hover:text-ink"
          >
            {body.trim() ? "EDIT" : ""}
          </button>
        )}
      </div>

      {error && (
        <Mono className="mb-2 block text-[10px] text-wait-ink">{error.toUpperCase()}</Mono>
      )}

      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            placeholder="What is the actual plan? Steps, findings, decisions, anything worth keeping."
            className="mb-2 w-full resize-y rounded-[13px] border border-edge bg-bg p-3 text-[13px] leading-[1.6] outline-none placeholder:text-faint"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-[11px] px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-white disabled:opacity-40"
              style={{ background: color }}
            >
              SAVE
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className="rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-dim transition-colors hover:text-ink disabled:opacity-40"
            >
              CANCEL
            </button>
            <div className="flex-1" />
            {body?.trim() && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraft("");
                }}
                className="rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-faint transition-colors hover:text-wait-ink disabled:opacity-40"
              >
                CLEAR
              </button>
            )}
          </div>
        </div>
      ) : body === null ? (
        <Mono className="block text-[10px] text-faint">LOADING…</Mono>
      ) : body.trim() ? (
        <div className="rounded-[13px] bg-soft p-[13px]">
          <Markdown>{linkifyTaskRefs(body.trim(), hrefForRef)}</Markdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="w-full rounded-[13px] border border-dashed border-edge p-[13px] text-left text-[12.5px] text-faint transition-colors hover:border-edge2 hover:text-dim"
        >
          Add a plan — the thinking behind this task, not just its title.
        </button>
      )}
    </div>
  );
}
