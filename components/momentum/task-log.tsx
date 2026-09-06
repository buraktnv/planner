"use client";

import { useEffect, useState } from "react";
import type { TaskComment } from "@/lib/core/comments";
import { STATUS_MARKER, parseStatus } from "@/lib/core/status";
import type { ProjectType } from "@/lib/core/types";
import { taskRefLinker } from "@/lib/view/task";
import { linkifyTaskRefs } from "@/lib/view/task-refs";
import { shortDate } from "@/lib/ui/momentum";
import { Mono } from "./primitives";
import Markdown from "./markdown";

const RECENT = 5;

type Kind = "note" | "status";

const BOX =
  "w-full resize-y rounded-[13px] border border-edge bg-bg p-3 text-[13px] leading-[1.6] outline-none placeholder:text-faint";

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
  const [kind, setKind] = useState<Kind>("note");
  const [draft, setDraft] = useState("");
  const [happened, setHappened] = useState("");
  const [changed, setChanged] = useState("");
  const [next, setNext] = useState("");
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

  const ready = kind === "note" ? draft.trim() !== "" : happened.trim() !== "";

  /**
   * A status is the same append with three parts sent separately, so the page
   * cannot post one without the middle part — what changed elsewhere — which
   * is the one people skip and the one the owner needs.
   */
  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const payload =
      kind === "note" ? { body: draft.trim() } : { status: { happened, changed, next } };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { entries?: TaskComment[] };
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setDraft("");
      setHappened("");
      setChanged("");
      setNext("");
    } catch {
      setError("Could not save the entry.");
    } finally {
      setBusy(false);
    }
  };

  const all = entries ?? [];
  const hidden = Math.max(0, all.length - RECENT);
  const shown = showAll ? all : all.slice(-RECENT);

  const kindClass = (on: boolean) =>
    `rounded-[7px] px-2 py-[3px] font-mono text-[8.5px] tracking-[0.12em] transition-colors ${
      on ? "bg-ink text-bg" : "text-faint hover:text-ink"
    }`;

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
            {shown.map((entry, i) => {
              const status = entry.marker === STATUS_MARKER ? parseStatus(entry.body) : null;
              return (
                <div
                  key={`${entry.date}-${entry.time}-${i}`}
                  className={`rounded-[13px] p-[13px] ${status ? "border border-edge bg-surf" : "bg-soft"}`}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />
                    <Mono className="text-[9px] tracking-[0.1em] text-faint">
                      {shortDate(entry.date)} · {entry.time}
                    </Mono>
                    {status ? (
                      <Mono className="rounded-[4px] bg-soft px-1.5 py-0.5 text-[8px] tracking-[0.12em] text-dim">
                        STATUS
                      </Mono>
                    ) : null}
                  </div>
                  {status ? (
                    <div className="flex flex-col gap-2">
                      <Markdown>{linkifyTaskRefs(status.happened, hrefForRef)}</Markdown>
                      <div>
                        <Mono className="mb-0.5 block text-[8px] tracking-[0.12em] text-faint">
                          CHANGED ELSEWHERE
                        </Mono>
                        <Markdown>{linkifyTaskRefs(status.changed || "nothing", hrefForRef)}</Markdown>
                      </div>
                      <div>
                        <Mono className="mb-0.5 block text-[8px] tracking-[0.12em] text-faint">NEXT</Mono>
                        <Markdown>{linkifyTaskRefs(status.next || "nothing", hrefForRef)}</Markdown>
                      </div>
                    </div>
                  ) : (
                    <Markdown>{linkifyTaskRefs(entry.body, hrefForRef)}</Markdown>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-2.5">
        <div className="mb-2 flex items-center gap-1.5">
          <button type="button" onClick={() => setKind("note")} className={kindClass(kind === "note")}>
            NOTE
          </button>
          <button type="button" onClick={() => setKind("status")} className={kindClass(kind === "status")}>
            STATUS
          </button>
          <Mono className="ml-1 text-[8.5px] tracking-[0.06em] text-faint">
            {kind === "note"
              ? "WHAT YOU TRIED, ESPECIALLY WHAT FAILED"
              : "A DECISION, A FOLLOW-UP, OR ANOTHER DOC THAT WAS WRONG"}
          </Mono>
        </div>

        {kind === "note" ? (
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
            className={`${BOX} mb-2`}
          />
        ) : (
          <div className="mb-2 flex flex-col gap-2">
            <textarea
              value={happened}
              onChange={(e) => setHappened(e.target.value)}
              rows={2}
              placeholder="What happened — what was done or decided"
              aria-label="What happened"
              className={BOX}
            />
            <textarea
              value={changed}
              onChange={(e) => setChanged(e.target.value)}
              rows={2}
              placeholder="What changed elsewhere — notes updated, tasks created, decisions reversed, by id (K-…, T-…)"
              aria-label="What changed elsewhere"
              className={BOX}
            />
            <textarea
              value={next}
              onChange={(e) => setNext(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              placeholder="Next"
              aria-label="Next"
              className={BOX}
            />
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy || !ready}
            onClick={submit}
            className="rounded-[11px] px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-white disabled:opacity-40"
            style={{ background: color }}
          >
            {kind === "note" ? "LOG IT" : "POST STATUS"}
          </button>
          <Mono className="text-[9px] tracking-[0.08em] text-faint">⌘↵ TO SAVE</Mono>
        </div>
      </div>
    </div>
  );
}
