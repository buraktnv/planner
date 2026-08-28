"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import type { CardModel } from "@/lib/view/workspace";
import type { TaskLane, TaskSection } from "@/lib/core/types";
import { LANES, LANE_KEYS, shortDate } from "@/lib/ui/momentum";
import { Bar, Mono, Tick } from "./primitives";
import Dialog from "./dialog";

const FLOW: { key: TaskSection | "next"; label: string }[] = [
  { key: "backlog", label: "BACKLOG" },
  { key: "in-progress", label: "DOING" },
  { key: "done", label: "DONE" },
];

export default function CardDetail({
  card,
  onClose,
}: {
  card: CardModel;
  onClose: () => void;
}) {
  const router = useRouter();
  const [subs, setSubs] = useState(card.subs);
  const [section, setSection] = useState<TaskSection>(card.section);
  const [lane, setLane] = useState<TaskLane>(card.lane);
  const [waitsOn, setWaitsOn] = useState(card.waitsOn ?? "");
  const [busy, setBusy] = useState(false);

  const base = card.type === "project" ? "/api/projects" : "/api/areas";
  const done = subs.filter((s) => s.done).length;
  const pct = subs.length
    ? Math.round((done / subs.length) * 100)
    : section === "done"
      ? 100
      : section === "in-progress"
        ? 50
        : 0;

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`${base}/${card.slug}/tasks`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleSub = async (id: string, next: boolean) => {
    setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, done: next } : s)));
    await patch({ id, complete: next });
  };

  const moveSection = async (next: TaskSection) => {
    setSection(next);
    if (next === "done") await patch({ id: card.id, complete: true });
    else if (section === "done") await patch({ id: card.id, complete: false });
    else await patch({ id: card.id, section: next });
  };

  const setCardLane = async (next: TaskLane) => {
    setLane(next);
    await patch({ id: card.id, lane: next });
  };

  const saveWaitsOn = async () => {
    if (waitsOn.trim() === (card.waitsOn ?? "")) return;
    await patch({ id: card.id, waitsOn: waitsOn.trim() });
  };

  const href = card.type === "project" ? `/projects/${card.slug}` : `/areas/${card.slug}`;

  return (
    <Dialog label={card.title} onClose={onClose}>
      <>
        <div className="mb-3.5 flex items-center gap-2.5">
          <span
            className="h-[9px] w-[9px] rounded-[3px]"
            style={{ background: card.color }}
          />
          <Link href={href} className="text-[12.5px] text-dim hover:text-ink">
            {card.charterName}
          </Link>
          <Mono className="text-[10px] text-faint">{card.id}</Mono>
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
          {card.title}
        </h2>

        <div className="mb-5 flex flex-wrap gap-[7px]">
          {FLOW.map((f) => {
            const on = section === f.key;
            return (
              <button
                key={f.key}
                type="button"
                disabled={busy}
                onClick={() => moveSection(f.key as TaskSection)}
                className="rounded-lg border px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em] disabled:opacity-60"
                style={{
                  color: on ? "#ffffff" : "var(--color-dim)",
                  background: on ? card.color : "transparent",
                  borderColor: on ? card.color : "var(--color-edge)",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="mb-5 flex flex-wrap gap-[7px]">
          {LANE_KEYS.map((k) => {
            const meta = LANES[k];
            const on = lane === k;
            return (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => setCardLane(k)}
                className="rounded-lg px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em] disabled:opacity-60"
                style={{
                  color: on ? "#ffffff" : meta.ink,
                  background: on ? meta.color : meta.tint,
                }}
              >
                {meta.label.toUpperCase()}
              </button>
            );
          })}
        </div>

        <div className="mb-5 grid grid-cols-2 gap-[11px]">
          <div className="rounded-[13px] bg-soft p-[13px]">
            <Mono className="mb-2 block text-[9px] tracking-[0.1em] text-faint">
              SIZE · PRIORITY
            </Mono>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{card.size}</span>
              <span className="text-sm text-dim">{card.priority}</span>
            </div>
          </div>
          <div className="rounded-[13px] bg-soft p-[13px]">
            <Mono className="mb-2 block text-[9px] tracking-[0.1em] text-faint">PROGRESS</Mono>
            <div className="mb-1.5">
              <Bar pct={pct} color={card.color} />
            </div>
            <Mono className="text-[10.5px] text-dim">{pct}%</Mono>
          </div>
        </div>

        {(card.due || card.est) && (
          <div className="mb-5 flex flex-wrap gap-4">
            {card.due && (
              <Mono
                className={`text-[10px] ${card.overdue ? "text-wait-ink" : "text-dim"}`}
              >
                DUE {shortDate(card.due)}
                {card.overdue ? " · OVERDUE" : ""}
              </Mono>
            )}
            {card.est && <Mono className="text-[10px] text-dim">EST {card.est}</Mono>}
          </div>
        )}

        <div className="mb-5">
          <Mono className="mb-2.5 block text-[9px] tracking-[0.1em] text-faint">WAITS ON</Mono>
          {card.blocked && (
            <Mono className="mb-2 block text-[10px] tracking-[0.08em] text-wait-ink">
              BLOCKED — {(card.blockedByTitle ?? card.waitsOn ?? "").toUpperCase()}
            </Mono>
          )}
          <div className="flex gap-2">
            <input
              value={waitsOn}
              onChange={(e) => setWaitsOn(e.target.value)}
              placeholder="A task id in this project, or free text"
              className="min-w-0 flex-1 rounded-[11px] border border-edge bg-bg px-3 py-2 text-[12.5px] outline-none placeholder:text-faint"
            />
            <button
              type="button"
              disabled={busy || waitsOn.trim() === (card.waitsOn ?? "")}
              onClick={saveWaitsOn}
              className="rounded-[11px] border border-edge px-3 py-2 font-mono text-[9.5px] tracking-[0.08em] text-dim transition-colors hover:text-ink disabled:opacity-40"
            >
              SAVE
            </button>
          </div>
        </div>

        <Mono className="mb-2.5 block text-[9px] tracking-[0.1em] text-faint">
          SUBTASKS {subs.length ? `${done}/${subs.length}` : ""}
        </Mono>
        {subs.length === 0 ? (
          <p className="m-0 text-[13px] text-faint">
            No subtasks. Break this down from the task list or ask the assistant to split it.
          </p>
        ) : (
          <div className="flex flex-col">
            {subs.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => toggleSub(s.id, !s.done)}
                className="grid grid-cols-[16px_auto_1fr] items-center gap-[11px] border-b border-edge2 py-2.5 pl-3.5 text-left disabled:opacity-60"
              >
                <Tick done={s.done} color={card.color} size={15} />
                <Mono className="text-[9.5px] text-faint">{s.id}</Mono>
                <span
                  className={`text-[13.5px] ${s.done ? "text-faint line-through" : "text-ink"}`}
                >
                  {s.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </>
    </Dialog>
  );
}
