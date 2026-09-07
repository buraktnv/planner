"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SearchHit } from "@/lib/view/search";
import Dialog from "../dialog";
import { Mono } from "../primitives";

/**
 * Declared here rather than imported, the way `mention-picker.tsx` declares
 * its own: this file must value-import nothing that can reach `lib/core`, or
 * `simple-git` and `node:fs` land in the browser bundle and the build fails.
 * The type import above is erased.
 */
const KIND_LABEL: Record<SearchHit["kind"], string> = {
  note: "NOTE",
  charter: "CHARTER",
  task: "TASK",
  description: "DESC",
  log: "LOG",
  event: "EVENT",
  habit: "HABIT",
  rhythm: "RHYTHM",
  meal: "MEAL",
  grocery: "SHOP",
  journal: "JOURNAL",
};

const CARRIES_FROM = new Set<SearchHit["kind"]>(["task", "description", "log"]);
const DEBOUNCE_MS = 120;

export default function SearchPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const list = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mine = ++seq.current;
    const controller = new AbortController();
    // Fires for the empty query too, so the cold index build overlaps the
    // first keystrokes rather than following them.
    const run = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { hits?: SearchHit[] };
        if (mine !== seq.current) return;
        setHits(Array.isArray(data.hits) ? data.hits : []);
        setSelected(0);
      } catch {
        if (mine === seq.current) {
          setHits([]);
          setSelected(0);
        }
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    };
    const timer = setTimeout(run, q ? DEBOUNCE_MS : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const node = list.current?.querySelector<HTMLElement>('[data-selected="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const go = (hit: SearchHit) => {
    const from = `${window.location.pathname}${window.location.search}`;
    const href = CARRIES_FROM.has(hit.kind)
      ? `${hit.href}?from=${encodeURIComponent(from)}`
      : hit.href;
    router.push(href);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelected(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelected(Math.max(hits.length - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[selected];
      if (hit) go(hit);
    }
  };

  return (
    <Dialog label="Search everything" onClose={onClose} maxWidth={640} paddingTop={90}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search notes, tasks, logs, events, journal…"
        aria-label="Search everything"
        className="w-full rounded-[12px] border border-edge bg-bg px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-faint"
      />

      <div ref={list} className="mt-3 max-h-[52vh] overflow-y-auto" role="listbox">
        {hits.map((hit, i) => (
          <button
            key={hit.key}
            type="button"
            role="option"
            aria-selected={i === selected}
            data-selected={i === selected}
            onMouseEnter={() => setSelected(i)}
            onClick={() => go(hit)}
            className={`flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
              i === selected ? "bg-soft" : "hover:bg-soft"
            }`}
          >
            <Mono className="mt-[3px] w-[54px] shrink-0 text-[7.5px] tracking-[0.12em] text-faint">
              {KIND_LABEL[hit.kind]}
            </Mono>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] text-ink">{hit.title}</span>
              {hit.snippet && (
                <span className="mt-[3px] block truncate text-[11.5px] text-dim">
                  {hit.snippet}
                </span>
              )}
            </span>
            <Mono className="mt-[3px] max-w-[34%] shrink-0 truncate text-[8.5px] text-faint">
              {hit.hint}
            </Mono>
          </button>
        ))}

        {!hits.length && (
          <p className="m-0 px-2.5 py-2 text-[12.5px] text-faint">
            {q.trim() === ""
              ? "Type to search notes, charters, tasks, descriptions, logs, events, routines and the journal."
              : loading
                ? "Searching…"
                : "Nothing matches."}
          </p>
        )}
      </div>
    </Dialog>
  );
}
