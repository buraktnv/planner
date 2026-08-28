"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CardModel } from "@/lib/view/workspace";
import {
  dayGap,
  monthName,
  parseIso,
  relativeLabel,
  shortDate,
  weekdayOf,
  SIZE_MINUTES,
} from "@/lib/ui/momentum";
import { Mono, Tick } from "@/components/momentum/primitives";

interface DayCell {
  iso: string;
  num: number;
  isToday: boolean;
  past: boolean;
  dots: { overdue: boolean }[];
}

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildGrid(today: string, cards: CardModel[]): { rows: DayCell[][]; label: string } {
  const todayDate = parseIso(today);
  const start = new Date(todayDate);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const byDay = new Map<string, CardModel[]>();
  for (const c of cards) {
    if (!c.due) continue;
    const list = byDay.get(c.due) ?? [];
    list.push(c);
    byDay.set(c.due, list);
  }
  const rows: DayCell[][] = [0, 1, 2].map((w) =>
    [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + i);
      const iso = isoOf(d);
      const dueHere = byDay.get(iso) ?? [];
      return {
        iso,
        num: d.getDate(),
        isToday: iso === today,
        past: iso < today,
        dots: dueHere.slice(0, 3).map((c) => ({ overdue: c.overdue })),
      };
    }),
  );
  const last = new Date(start);
  last.setDate(start.getDate() + 20);
  const label =
    start.getMonth() === last.getMonth()
      ? `${monthName(start.getMonth())} ${start.getFullYear()}`
      : `${monthName(start.getMonth())} — ${monthName(last.getMonth())} ${last.getFullYear()}`;
  return { rows, label };
}

function groupCards(
  today: string,
  cards: CardModel[],
): { label: string; items: CardModel[] }[] {
  const from = parseIso(today);
  const sorted = [...cards].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  const gap = (c: CardModel) => dayGap(c.due ?? today, from);
  const groups = [
    { label: "OVERDUE", items: sorted.filter((c) => gap(c) < 0) },
    { label: "THIS WEEK", items: sorted.filter((c) => gap(c) >= 0 && gap(c) <= 3) },
    { label: "NEXT WEEK", items: sorted.filter((c) => gap(c) > 3 && gap(c) <= 10) },
    { label: "LATER", items: sorted.filter((c) => gap(c) > 10) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

export default function CalendarView({
  cards,
  today,
}: {
  cards: CardModel[];
  today: string;
}) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const open = cards.filter((c) => !c.done && !ticked[c.key]);
  const { rows, label } = buildGrid(today, open);
  const groups = groupCards(today, open);
  const from = parseIso(today);

  const complete = async (card: CardModel) => {
    if (busy) return;
    setBusy(card.key);
    setTicked((prev) => ({ ...prev, [card.key]: true }));
    try {
      const base = card.type === "project" ? "/api/projects" : "/api/areas";
      const res = await fetch(`${base}/${card.slug}/tasks`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: card.id, complete: true }),
      });
      if (!res.ok) setTicked((prev) => ({ ...prev, [card.key]: false }));
      router.refresh();
    } catch {
      setTicked((prev) => ({ ...prev, [card.key]: false }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="mb-[26px] rounded-[18px] border border-edge bg-surf px-[18px] py-4">
        <Mono className="mb-3 block text-[9px] tracking-[0.14em] text-faint">{label}</Mono>
        <div className="mb-1.5 grid grid-cols-7 gap-1">
          {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
            <Mono key={i} className="text-center text-[8.5px] text-faint">
              {w}
            </Mono>
          ))}
        </div>
        {rows.map((row, ri) => (
          <div key={ri} className="mb-1 grid grid-cols-7 gap-1">
            {row.map((d) => (
              <div
                key={d.iso}
                className={`flex aspect-square min-w-0 flex-col items-center justify-center gap-[3px] rounded-[9px] border ${
                  d.isToday
                    ? "border-transparent bg-wait"
                    : d.dots.length
                      ? "border-edge bg-soft"
                      : "border-transparent"
                }`}
              >
                <Mono
                  className={`text-[10.5px] ${
                    d.isToday ? "text-white" : d.past ? "text-faint" : "text-ink"
                  }`}
                >
                  {d.num}
                </Mono>
                <div className="flex h-1 gap-0.5">
                  {d.dots.map((dot, di) => (
                    <span
                      key={di}
                      className={`h-1 w-1 rounded-full ${
                        dot.overdue ? "bg-wait-ink" : "bg-sky"
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="text-[13px] text-faint">
          No dates on anything. Give a task a due date and it lands here.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="mb-6">
            <div className="mb-1.5 flex items-center gap-2.5">
              <Mono className="text-[9.5px] tracking-[0.16em] text-faint">{g.label}</Mono>
              <div className="h-px flex-1 bg-edge" />
            </div>
            {g.items.map((c) => {
              const done = !!ticked[c.key];
              return (
                <div
                  key={c.key}
                  className="flex items-start gap-3 border-b border-edge2 py-3.5"
                >
                  <button
                    type="button"
                    onClick={() => complete(c)}
                    disabled={busy === c.key}
                    className="mt-0.5 shrink-0 disabled:opacity-60"
                    aria-label={`Complete ${c.title}`}
                  >
                    <Tick done={done} color="#63b894" size={16} />
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <Mono
                        className={`text-[10.5px] ${done ? "text-faint" : "text-ink"}`}
                      >
                        {c.due ? shortDate(c.due) : ""}
                      </Mono>
                      <Mono className="text-[8.5px] text-faint">
                        {c.due ? weekdayOf(c.due) : ""}
                      </Mono>
                      <Mono className="text-[8.5px] text-faint">
                        {c.due ? relativeLabel(c.due, from) : ""}
                      </Mono>
                      {c.overdue && !done && (
                        <Mono className="rounded-[5px] bg-wait-tint px-[7px] py-[3px] text-[8px] tracking-[0.08em] text-wait-ink">
                          NEEDS YOU
                        </Mono>
                      )}
                    </div>
                    <div
                      className={`text-sm font-medium leading-[1.3] tracking-[-0.01em] ${
                        done ? "text-faint line-through" : "text-ink"
                      }`}
                    >
                      {c.title}
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <Mono className="text-[9px] text-faint">
                        {c.est ?? SIZE_MINUTES[c.size] ?? c.size}
                      </Mono>
                      <Link
                        href={
                          c.type === "project"
                            ? `/projects/${c.slug}`
                            : `/areas/${c.slug}`
                        }
                        className="font-mono text-[9px] tracking-[0.12em] text-dim hover:text-ink"
                      >
                        {c.charterName}
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </>
  );
}
