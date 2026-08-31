"use client";

import { useEffect, useState } from "react";
import type { TaskComment } from "@/lib/core/comments";
import type { ProjectType } from "@/lib/core/types";
import { taskRefLinker } from "@/lib/view/task";
import { linkifyTaskRefs } from "@/lib/view/task-refs";
import { shortDate } from "@/lib/ui/momentum";
import { Mono } from "./primitives";
import Markdown from "./markdown";

const RECENT = 5;

export default function TaskLog({
  type,
  slug,
  taskId,
  color,
  knownIds = [],
  from,
}: {
  type: ProjectType;
  slug: string;
  taskId: string;
  color: string;
  knownIds?: string[];
  from?: string | null;
}) {
  const [entries, setEntries] = useState<TaskComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/tasks/${type}/${slug}/${taskId}/comments`;
  const hrefForRef = taskRefLinker(type, slug, taskId, knownIds, from);

  useEffect(() => {
    let live = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { entries?: TaskComment[] }) => {
        if (live) setEntries(Array.isArray(data.entries) ? data.entries : []);
      })
      .catch(() => {
        if (live) {
          setError("Could not load the log.");
          setEntries([]);
        }
      });
    return () => {
      live = false;
    };
  }, [url]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { entries?: TaskComment[] };
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setDraft("");
    } catch {
      setError("Could not save the entry.");
    } finally {
      setBusy(false);
    }
  };

  const all = entries ?? [];
  const hidden = Math.max(0, all.length - RECENT);
  const shown = showAll ? all : all.slice(-RECENT);

  return (
    <div className="mb-5">
      <div className="mb-2.5 flex items-center gap-2">
        <Mono className="block text-[9px] tracking-[0.1em] text-faint">
          LOG {all.length ? all.length : ""}
        </Mono>
        <div className="flex-1" />
        <Mono className="text-[9px] tracking-[0.08em] text-faint">APPEND-ONLY</Mono>
      </div>

      {error && (
        <Mono className="mb-2 block text-[10px] text-wait-ink">{error.toUpperCase()}</Mono>
      )}

      {entries === null ? (
        <Mono className="block text-[10px] text-faint">LOADING…</Mono>
      ) : (
        <>
          {hidden > 0 && !showAll && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="mb-2 flex items-center gap-2 py-1 text-left font-mono text-[9px] tracking-[0.08em] text-faint transition-colors hover:text-dim"
            >
              <span>▸</span> EARLIER ({hidden})
            </button>
          )}

          {all.length === 0 && (
            <p className="m-0 mb-2.5 text-[12.5px] text-faint">
              Nothing logged yet. Write what you tried as you go — especially the turns that
              were wrong.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {shown.map((entry, i) => (
              <div key={`${entry.date}-${entry.time}-${i}`} className="rounded-[13px] bg-soft p-[13px]">
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="h-[5px] w-[5px] rounded-full"
                    style={{ background: color }}
                  />
                  <Mono className="text-[9px] tracking-[0.1em] text-faint">
                    {shortDate(entry.date)} · {entry.time}
                  </Mono>
                </div>
                <Markdown>{linkifyTaskRefs(entry.body, hrefForRef)}</Markdown>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-2.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Plain Enter is a newline: an entry is expected to be multi-line.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={3}
          placeholder="What happened? What did you try, and did it work?"
          aria-label={`Add a log entry to ${taskId}`}
          className="mb-2 w-full resize-y rounded-[13px] border border-edge bg-bg p-3 text-[13px] leading-[1.6] outline-none placeholder:text-faint"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || draft.trim() === ""}
            onClick={submit}
            className="rounded-[11px] px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-white disabled:opacity-40"
            style={{ background: color }}
          >
            LOG IT
          </button>
          <Mono className="text-[9px] tracking-[0.08em] text-faint">⌘↵ TO SAVE</Mono>
        </div>
      </div>
    </div>
  );
}
