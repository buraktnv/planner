"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { CardModel, SubModel } from "@/lib/view/workspace";
import type { TaskLane, TaskSection } from "@/lib/core/types";
import { LANES, LANE_KEYS, shortDate } from "@/lib/ui/momentum";
import { Bar, Mono, Tick } from "./primitives";
import Dialog from "./dialog";
import TaskPlan from "./task-plan";

const FLOW: { key: TaskSection | "next"; label: string }[] = [
  { key: "backlog", label: "BACKLOG" },
  { key: "in-progress", label: "DOING" },
  { key: "done", label: "DONE" },
];

interface Node {
  id: string;
  title: string;
  size: string;
  section: TaskSection;
  done: boolean;
  due?: string;
  est?: string;
  doneDate?: string;
  waitsOn?: string;
  subs: SubModel[];
  isRoot: boolean;
}

function nodeOfCard(card: CardModel): Node {
  return {
    id: card.id,
    title: card.title,
    size: card.size,
    section: card.section,
    done: card.done,
    due: card.due,
    est: card.est,
    doneDate: card.doneDate,
    waitsOn: card.waitsOn,
    subs: card.subs,
    isRoot: true,
  };
}

function nodeOfSub(sub: SubModel): Node {
  return {
    id: sub.id,
    title: sub.title,
    size: sub.size,
    section: sub.section,
    done: sub.done,
    due: sub.due,
    est: sub.est,
    doneDate: sub.doneDate,
    waitsOn: sub.waitsOn,
    subs: sub.subs,
    isRoot: false,
  };
}

function findSub(subs: SubModel[], id: string): SubModel | null {
  for (const s of subs) {
    if (s.id === id) return s;
    const deeper = findSub(s.subs, id);
    if (deeper) return deeper;
  }
  return null;
}

export default function CardDetail({
  card,
  onClose,
}: {
  card: CardModel;
  onClose: () => void;
}) {
  const router = useRouter();
  const [doneIds, setDoneIds] = useState<Record<string, boolean>>({});
  const [section, setSection] = useState<TaskSection>(card.section);
  const [lane, setLane] = useState<TaskLane>(card.lane);
  const [waitsOn, setWaitsOn] = useState(card.waitsOn ?? "");
  const [busy, setBusy] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const base = card.type === "project" ? "/api/projects" : "/api/areas";

  const node = useMemo<Node>(() => {
    if (!focusId) return nodeOfCard(card);
    const sub = findSub(card.subs, focusId);
    return sub ? nodeOfSub(sub) : nodeOfCard(card);
  }, [card, focusId]);

  const isDone = (id: string, fallback: boolean) => doneIds[id] ?? fallback;
  const subs = node.subs;
  const openSubs = subs.filter((s) => !isDone(s.id, s.done));
  const doneSubs = subs.filter((s) => isDone(s.id, s.done));
  const doneCount = doneSubs.length;

  const pct = subs.length
    ? Math.round((doneCount / subs.length) * 100)
    : isDone(node.id, node.done)
      ? 100
      : (node.isRoot ? section : node.section) === "in-progress"
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

  const toggleTask = async (id: string, next: boolean) => {
    setDoneIds((prev) => ({ ...prev, [id]: next }));
    await patch({ id, complete: next });
  };

  const moveSection = async (next: TaskSection) => {
    setSection(next);
    if (next === "done") await patch({ id: node.id, complete: true });
    else if (section === "done") await patch({ id: node.id, complete: false });
    else await patch({ id: node.id, section: next });
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

  const subRow = (s: SubModel) => {
    const done = isDone(s.id, s.done);
    return (
      <div
        key={s.id}
        className="grid grid-cols-[16px_auto_1fr_auto] items-center gap-[11px] border-b border-edge2 pl-3.5"
      >
        <button
          type="button"
          disabled={busy}
          aria-label={done ? `Reopen ${s.id}` : `Complete ${s.id}`}
          onClick={() => toggleTask(s.id, !done)}
          className="py-2.5 disabled:opacity-60"
        >
          <Tick done={done} color={card.color} size={15} />
        </button>
        <Mono className="text-[9.5px] text-faint">{s.id}</Mono>
        <button
          type="button"
          onClick={() => setFocusId(s.id)}
          className="py-2.5 text-left"
        >
          <span className={`text-[13.5px] ${done ? "text-faint line-through" : "text-ink"}`}>
            {s.title}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setFocusId(s.id)}
          aria-label={`Open ${s.id}`}
          className="flex items-center gap-1.5 py-2.5 pr-1 text-faint transition-colors hover:text-ink"
        >
          {s.hasDetail && (
            <span className="h-[5px] w-[5px] rounded-full" style={{ background: card.color }} />
          )}
          {s.subs.length > 0 && <Mono className="text-[9px]">{s.subs.length}</Mono>}
          <span className="text-[13px] leading-none">›</span>
        </button>
      </div>
    );
  };

  return (
    <Dialog label={node.title} onClose={onClose}>
      <>
        <div className="mb-3.5 flex items-center gap-2.5">
          <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: card.color }} />
          {focusId ? (
            <button
              type="button"
              onClick={() => setFocusId(null)}
              className="text-[12.5px] text-dim transition-colors hover:text-ink"
            >
              ‹ {card.id}
            </button>
          ) : (
            <Link href={href} className="text-[12.5px] text-dim hover:text-ink">
              {card.charterName}
            </Link>
          )}
          <Mono className="text-[10px] text-faint">{node.id}</Mono>
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
          {node.title}
        </h2>

        {node.isRoot ? (
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
        ) : (
          <div className="mb-5 flex flex-wrap items-center gap-[7px]">
            <button
              type="button"
              disabled={busy}
              onClick={() => toggleTask(node.id, !isDone(node.id, node.done))}
              className="rounded-lg border px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em] disabled:opacity-60"
              style={{
                color: isDone(node.id, node.done) ? "#ffffff" : "var(--color-dim)",
                background: isDone(node.id, node.done) ? card.color : "transparent",
                borderColor: isDone(node.id, node.done) ? card.color : "var(--color-edge)",
              }}
            >
              {isDone(node.id, node.done) ? "DONE" : "MARK DONE"}
            </button>
            <Mono className="text-[9px] tracking-[0.08em] text-faint">
              SUBTASK OF {card.id}
            </Mono>
          </div>
        )}

        {node.isRoot && (
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
        )}

        <div className="mb-5 grid grid-cols-2 gap-[11px]">
          <div className="rounded-[13px] bg-soft p-[13px]">
            <Mono className="mb-2 block text-[9px] tracking-[0.1em] text-faint">
              SIZE · PRIORITY
            </Mono>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{node.size}</span>
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

        {(node.due || node.est || node.doneDate) && (
          <div className="mb-5 flex flex-wrap gap-4">
            {node.due && (
              <Mono className={`text-[10px] ${card.overdue ? "text-wait-ink" : "text-dim"}`}>
                DUE {shortDate(node.due)}
                {card.overdue && node.isRoot ? " · OVERDUE" : ""}
              </Mono>
            )}
            {node.est && <Mono className="text-[10px] text-dim">EST {node.est}</Mono>}
            {node.doneDate && (
              <Mono className="text-[10px] text-dim">DONE {shortDate(node.doneDate)}</Mono>
            )}
          </div>
        )}

        <TaskPlan
          key={node.id}
          type={card.type}
          slug={card.slug}
          taskId={node.id}
          color={card.color}
          onSaved={() => router.refresh()}
        />

        {node.isRoot && (
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
        )}

        <Mono className="mb-2.5 block text-[9px] tracking-[0.1em] text-faint">
          SUBTASKS {subs.length ? `${doneCount}/${subs.length}` : ""}
        </Mono>
        {subs.length === 0 ? (
          <p className="m-0 text-[13px] text-faint">
            No subtasks. Break this down from the task list or ask the assistant to split it.
          </p>
        ) : (
          <div className="flex flex-col">
            {openSubs.map(subRow)}
            {doneCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  className="flex items-center gap-2 py-2.5 text-left font-mono text-[9px] tracking-[0.08em] text-faint transition-colors hover:text-dim"
                >
                  <span>{showDone ? "▾" : "▸"}</span>
                  DONE ({doneCount})
                </button>
                {showDone && doneSubs.map(subRow)}
              </>
            )}
          </div>
        )}
      </>
    </Dialog>
  );
}
