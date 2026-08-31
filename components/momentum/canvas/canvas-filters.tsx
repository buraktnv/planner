"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  filterHref,
  isFiltered,
  NO_FILTER,
  toggleStatus,
  withTag,
  withTopic,
  type BandStatus,
  type CanvasFacets,
  type CanvasFilter,
} from "@/lib/view/canvas-filter";
import { Mono } from "../primitives";

/**
 * The filter bar over the whole knowledge base.
 *
 * Every filter is a LINK, not local state: filtering happens on the server,
 * because the bands and the viewport bounds are computed from the note list
 * and a client-side filter would draw each band around cards no longer in it.
 * A filtered board therefore has a URL you can keep, which a piece of local
 * state would not.
 *
 * Creating a topic is the one thing here that writes. A topic is an area
 * charter — not a new kind of record — so a note filed under it bands on this
 * canvas, auto-loads into chat context, reaches the MCP tools and gets a docs
 * page, all of which a new grouping concept would have had to earn separately.
 */
export default function CanvasFilters({
  facets,
  filter,
}: {
  facets: CanvasFacets;
  filter: CanvasFilter;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chip =
    "rounded-lg border px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em] transition-colors";
  const off = "border-edge text-faint hover:text-dim";
  const on = "border-ink text-ink";

  async function createTopic() {
    const n = name.trim();
    const w = why.trim();
    if (!n || !w || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, why: w }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setError(body.error ?? "Could not create the topic.");
        setBusy(false);
        return;
      }
      setAdding(false);
      setName("");
      setWhy("");
      setBusy(false);
      // Land on the new topic: an empty band is the one you want to fill.
      router.push(filterHref("/canvas", withTopic(NO_FILTER, `area:${body.id}`)));
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-[7px]">
        <Mono className="mr-1 text-[9px] tracking-[0.1em] text-faint">STATUS</Mono>
        {facets.statuses.map((s) => {
          const active = filter.status.includes(s.value as BandStatus);
          return (
            <Link
              key={s.value}
              href={filterHref("/canvas", toggleStatus(filter, s.value as BandStatus))}
              className={`${chip} ${active ? on : off}`}
            >
              {s.label.toUpperCase()} {s.count}
            </Link>
          );
        })}

        <span className="mx-1 h-4 w-px bg-edge" />

        <label className="flex items-center gap-1.5">
          <Mono className="text-[9px] tracking-[0.1em] text-faint">TOPIC</Mono>
          <select
            value={filter.topic ?? ""}
            onChange={(e) =>
              router.push(filterHref("/canvas", withTopic(filter, e.target.value || null)))
            }
            className="rounded-lg border border-edge bg-surf px-2 py-[4px] font-mono text-[9px] tracking-[0.06em] text-dim"
          >
            <option value="">all</option>
            {facets.topics.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} ({t.count})
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <Mono className="text-[9px] tracking-[0.1em] text-faint">TAG</Mono>
          <select
            value={filter.tag ?? ""}
            onChange={(e) =>
              router.push(filterHref("/canvas", withTag(filter, e.target.value || null)))
            }
            className="rounded-lg border border-edge bg-surf px-2 py-[4px] font-mono text-[9px] tracking-[0.06em] text-dim"
          >
            <option value="">all</option>
            {facets.tags.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} ({t.count})
              </option>
            ))}
          </select>
        </label>

        {isFiltered(filter) && (
          <Link href="/canvas" className={`${chip} ${off}`}>
            CLEAR
          </Link>
        )}

        <span className="mx-1 h-4 w-px bg-edge" />

        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
            setError(null);
          }}
          className={`${chip} ${adding ? on : off}`}
        >
          {adding ? "CANCEL" : "+ TOPIC"}
        </button>

        <div className="flex-1" />
        <Mono className="text-[9px] tracking-[0.08em] text-faint">
          {facets.shown === facets.total
            ? `${facets.total} NOTES`
            : `${facets.shown} OF ${facets.total}`}
        </Mono>
      </div>

      {adding && (
        <div className="flex flex-wrap items-start gap-2 rounded-xl border border-edge bg-surf p-3">
          <div className="flex min-w-[180px] flex-col gap-1">
            <Mono className="text-[9px] tracking-[0.1em] text-faint">NAME</Mono>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Health"
              className="rounded-lg border border-edge bg-bg px-2.5 py-[6px] text-[13px] text-ink outline-none focus:border-ink"
            />
          </div>
          <div className="flex min-w-[280px] flex-1 flex-col gap-1">
            <Mono className="text-[9px] tracking-[0.1em] text-faint">WHY IT EXISTS</Mono>
            <input
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createTopic();
              }}
              placeholder="What this topic is for — a charter needs a reason, not just a name."
              className="rounded-lg border border-edge bg-bg px-2.5 py-[6px] text-[13px] text-ink outline-none focus:border-ink"
            />
          </div>
          <button
            type="button"
            onClick={() => void createTopic()}
            disabled={busy || !name.trim() || !why.trim()}
            className={`${chip} mt-[18px] border-ink text-ink disabled:opacity-40`}
          >
            {busy ? "CREATING…" : "CREATE"}
          </button>
          {error && (
            <p className="mt-[18px] m-0 text-[12px] text-wait-ink">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
