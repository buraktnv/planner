"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  applyTabOrder,
  LAST_CANVAS_KEY,
  readTabOrder,
  reorderTabs,
  TAB_ORDER_KEY,
  type CanvasTab,
} from "@/lib/view/canvas-tabs";
import { useStored, writeStored } from "../use-stored";

/**
 * The canvas tab strip.
 *
 * Tab order and the last-open surface live in browser storage, not in the data
 * repo. Everything else in this app is a git commit, but the tab you were last
 * on changes on every navigation — committing that would bury the journal
 * under noise, and neither value is any use to the MCP server or another
 * machine. Ordering is a per-browser convenience, so it is stored like one.
 */
export default function CanvasTabs({
  tabs,
  activeKey,
  path,
}: {
  tabs: CanvasTab[];
  activeKey: string;
  path: string;
}) {
  const order = readTabOrder(useStored(TAB_ORDER_KEY));
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  useEffect(() => {
    writeStored(LAST_CANVAS_KEY, path);
  }, [path]);

  const shown = applyTabOrder(tabs, order);

  function onDrop(to: string) {
    if (!dragKey) return;
    writeStored(
      TAB_ORDER_KEY,
      JSON.stringify(reorderTabs(shown.map((t) => t.key), dragKey, to)),
    );
    setDragKey(null);
    setOverKey(null);
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-9 pt-4">
      {shown.map((tab) => {
        const active = tab.key === activeKey;
        const over = overKey === tab.key && dragKey !== null && dragKey !== tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", tab.key);
              setDragKey(tab.key);
            }}
            onDragEnd={() => {
              setDragKey(null);
              setOverKey(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverKey(tab.key);
            }}
            onDragLeave={() => setOverKey((k) => (k === tab.key ? null : k))}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(tab.key);
            }}
            title={`${tab.label} — drag to reorder`}
            className={`flex shrink-0 items-center gap-2 rounded-[10px] border px-3 py-[7px] text-[12px] whitespace-nowrap transition-colors ${
              active
                ? "border-edge bg-surf font-semibold text-ink"
                : "border-transparent text-faint hover:bg-soft hover:text-dim"
            } ${over ? "border-dashed border-ink" : ""} ${
              dragKey === tab.key ? "opacity-40" : ""
            }`}
          >
            {tab.color && (
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: tab.color }}
              />
            )}
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
