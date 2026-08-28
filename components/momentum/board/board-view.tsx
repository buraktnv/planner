"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CardModel } from "@/lib/view/workspace";
import type { TaskLane } from "@/lib/core/types";
import { LANES } from "@/lib/ui/momentum";
import { useMomentum } from "../context";
import { Bar, Empty, Mono } from "../primitives";

interface FilterOption {
  key: string;
  label: string;
  dot: string;
}

function apiBase(type: "project" | "area"): string {
  return type === "project" ? "/api/projects" : "/api/areas";
}

function LaneHeader({ lane, count }: { lane: TaskLane; count: number }) {
  return (
    <div className="mb-3.5 flex items-center gap-[9px]">
      <span className="h-[9px] w-[9px] rounded-full" style={{ background: LANES[lane].color }} />
      <span className={`text-[13px] font-semibold ${lane === "some" ? "text-dim" : "text-ink"}`}>
        {LANES[lane].label}
      </span>
      <Mono className="text-[10px] text-faint">{count}</Mono>
    </div>
  );
}

export default function BoardView({
  cards,
  filters,
}: {
  cards: CardModel[];
  filters: FilterOption[];
}) {
  const router = useRouter();
  const { openCard, openComposer } = useMomentum();
  const [filter, setFilter] = useState("all");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TaskLane | null>(null);
  const [moved, setMoved] = useState<Record<string, TaskLane>>({});

  const visible = useMemo(
    () =>
      cards
        .filter((c) => filter === "all" || `${c.type}/${c.slug}` === filter)
        .map((c) => ({ ...c, lane: moved[c.key] ?? c.lane })),
    [cards, filter, moved],
  );

  const byLane = (lane: TaskLane) => visible.filter((c) => c.lane === lane);

  const drop = async (lane: TaskLane) => {
    const key = dragging;
    setDragging(null);
    setOver(null);
    if (!key) return;
    const card = cards.find((c) => c.key === key);
    if (!card || (moved[key] ?? card.lane) === lane) return;
    setMoved((prev) => ({ ...prev, [key]: lane }));
    await fetch(`${apiBase(card.type)}/${card.slug}/tasks`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: card.id, lane }),
    });
    router.refresh();
  };

  const laneProps = (lane: TaskLane) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (over !== lane) setOver(lane);
    },
    onDragLeave: () => {
      if (over === lane) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      void drop(lane);
    },
    style: {
      borderColor: over === lane ? LANES[lane].color : "var(--color-edge2)",
      background: over === lane ? LANES[lane].tint : "rgba(255,255,255,0.5)",
    },
  });

  const cardProps = (card: CardModel) => ({
    draggable: true,
    onDragStart: () => setDragging(card.key),
    onDragEnd: () => setDragging(null),
    onClick: () => openCard(card),
    style: { opacity: dragging === card.key ? 0.35 : 1 },
  });

  const quick = byLane("quick");
  const deep = byLane("deep");
  const wait = byLane("wait");
  const some = byLane("some");

  return (
    <div className="px-[30px] pt-[34px] pb-[60px]">
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <h1 className="m-0 mr-3.5 text-2xl font-semibold tracking-[-0.03em]">Board</h1>
        <button
          type="button"
          onClick={() => openComposer("branch")}
          className="order-9 flex items-center gap-1.5 rounded-[10px] border border-edge bg-surf px-3 py-1.5 text-[12px] font-medium transition-colors hover:border-ink"
        >
          <Mono className="text-[12px]">+</Mono>
          Card
        </button>
        {filters.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className="inline-flex items-center gap-[7px] rounded-[10px] border px-[11px] py-1.5 text-[12px]"
              style={{
                borderColor: on ? "var(--color-faint)" : "var(--color-edge)",
                background: on ? "var(--color-surf)" : "transparent",
                color: on ? "var(--color-ink)" : "var(--color-dim)",
              }}
            >
              <span
                className="inline-block h-[7px] w-[7px] rounded-[2px]"
                style={{ background: f.dot }}
              />
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 items-start gap-[11px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:grid-rows-[auto_auto]">
        <div
          {...laneProps("quick")}
          className="rounded-[20px] border-[1.5px] p-[15px] lg:row-span-2 lg:min-h-[500px]"
        >
          <LaneHeader lane="quick" count={quick.length} />
          {quick.length === 0 && <Empty>Nothing quick here yet.</Empty>}
          <div className="flex flex-col gap-[9px]">
            {quick.map((c) => (
              <div
                key={c.key}
                {...cardProps(c)}
                className="cursor-grab rounded-[13px] border border-edge bg-surf px-3.5 py-[13px] transition-colors hover:border-faint"
                style={{ ...cardProps(c).style, borderLeft: `3px solid ${c.color}` }}
              >
                <div className="mb-[11px] text-sm font-medium leading-[1.35] tracking-[-0.01em]">
                  {c.title}
                </div>
                <Bar pct={c.pct} color={c.color} height={5} />
              </div>
            ))}
          </div>
        </div>

        <div {...laneProps("deep")} className="rounded-[20px] border-[1.5px] p-[15px]">
          <LaneHeader lane="deep" count={deep.length} />
          {deep.length === 0 && <Empty>No deep work queued.</Empty>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-[9px]">
            {deep.map((c) => (
              <div
                key={c.key}
                {...cardProps(c)}
                className="cursor-grab rounded-[13px] border border-edge bg-surf p-3.5 transition-colors hover:border-faint"
                style={{ ...cardProps(c).style, borderLeft: `3px solid ${c.color}` }}
              >
                <div className="mb-3.5 text-[14.5px] font-medium leading-[1.35] tracking-[-0.01em]">
                  {c.title}
                </div>
                <Bar pct={c.pct} color={c.color} height={5} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-[11px] sm:grid-cols-2">
          <div
            {...laneProps("wait")}
            className="rounded-[20px] border-[1.5px] p-[15px] sm:min-h-[210px]"
          >
            <LaneHeader lane="wait" count={wait.length} />
            {wait.length === 0 && <Empty>Nothing waiting on anyone.</Empty>}
            <div className="flex flex-col gap-[9px]">
              {wait.map((c) => (
                <div
                  key={c.key}
                  {...cardProps(c)}
                  className="cursor-grab rounded-[13px] border border-dashed border-edge px-[13px] py-3 transition-colors hover:bg-surf"
                  style={{ ...cardProps(c).style, borderLeft: `3px solid ${c.color}` }}
                >
                  <div className="text-[13.5px] font-medium leading-[1.35] text-dim">
                    {c.title}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            {...laneProps("some")}
            className="rounded-[20px] border-[1.5px] p-[15px] sm:min-h-[210px]"
          >
            <LaneHeader lane="some" count={some.length} />
            {some.length === 0 && <Empty>Nothing parked.</Empty>}
            <div className="flex flex-col gap-2">
              {some.map((c) => (
                <div
                  key={c.key}
                  {...cardProps(c)}
                  className="flex cursor-grab items-center gap-[9px] rounded-[11px] bg-surf px-3 py-2.5 transition-colors hover:bg-soft"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-[2px] opacity-70"
                    style={{ background: c.color }}
                  />
                  <span className="text-[13px] leading-[1.3] text-faint">{c.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Mono className="mt-6 block text-[9px] tracking-[0.1em] text-faint">
        DRAG A CARD BETWEEN LANES — THE LANE IS SAVED ON THE TASK LINE
      </Mono>
    </div>
  );
}
