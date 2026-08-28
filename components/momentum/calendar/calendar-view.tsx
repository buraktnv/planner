"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CardModel } from "@/lib/view/workspace";
import type { CalendarDay, CalendarModel, EventModel } from "@/lib/view/calendar";
import { parseIso, relativeLabel, shortDate, SIZE_MINUTES } from "@/lib/ui/momentum";
import { Mono, Tick } from "@/components/momentum/primitives";

function charterHref(type: "project" | "area" | undefined, slug: string | undefined): string | null {
  if (!type || !slug) return null;
  return type === "project" ? `/projects/${slug}` : `/areas/${slug}`;
}

export default function CalendarView({ model }: { model: CalendarModel }) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const from = parseIso(model.today);

  const completeEvent = async (event: EventModel) => {
    if (busy) return;
    setBusy(event.key);
    setTicked((prev) => ({ ...prev, [event.key]: true }));
    try {
      const res = await fetch(`/api/calendar/${event.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      if (!res.ok) setTicked((prev) => ({ ...prev, [event.key]: false }));
      router.refresh();
    } catch {
      setTicked((prev) => ({ ...prev, [event.key]: false }));
    } finally {
      setBusy(null);
    }
  };

  const completeCard = async (card: CardModel) => {
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

  const eventRow = (e: EventModel) => {
    const done = !!ticked[e.key];
    const href = charterHref(e.scopeType, e.scopeSlug);
    return (
      <div key={e.key} className="flex items-start gap-3 border-b border-edge2 py-3.5">
        <button
          type="button"
          onClick={() => completeEvent(e)}
          disabled={busy === e.key}
          className="mt-0.5 shrink-0 disabled:opacity-60"
          aria-label={`Mark ${e.title} done`}
        >
          <Tick done={done} color={e.color} size={16} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <Mono className="text-[9px] tracking-[0.14em] text-faint">EVENT</Mono>
            {e.time && <Mono className="text-[10.5px] text-ink">{e.time}</Mono>}
            {e.past && !done && (
              <Mono className="rounded-[5px] bg-wait-tint px-[7px] py-[3px] text-[8px] tracking-[0.08em] text-wait-ink">
                PASSED
              </Mono>
            )}
          </div>
          <div
            className={`text-sm font-medium leading-[1.3] tracking-[-0.01em] ${
              done ? "text-faint line-through" : "text-ink"
            }`}
          >
            {e.title}
          </div>
          {e.note && <div className="text-[12.5px] leading-[1.5] text-dim">{e.note}</div>}
          {e.action && !done && (
            <div className="text-[12.5px] leading-[1.5] text-wait-ink">{e.action}</div>
          )}
          {href && (
            <Link
              href={href}
              className="font-mono text-[9px] tracking-[0.12em] text-dim hover:text-ink"
            >
              {e.charterName ?? e.scopeSlug}
            </Link>
          )}
        </div>
      </div>
    );
  };

  const cardRow = (c: CardModel) => {
    const done = !!ticked[c.key];
    return (
      <div key={c.key} className="flex items-start gap-3 border-b border-edge2 py-3.5">
        <button
          type="button"
          onClick={() => completeCard(c)}
          disabled={busy === c.key}
          className="mt-0.5 shrink-0 disabled:opacity-60"
          aria-label={`Complete ${c.title}`}
        >
          <Tick done={done} color="#63b894" size={16} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <Mono className="text-[9px] tracking-[0.14em] text-faint">TASK</Mono>
            {c.due && (
              <Mono className="text-[8.5px] text-faint">{relativeLabel(c.due, from)}</Mono>
            )}
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
              href={c.type === "project" ? `/projects/${c.slug}` : `/areas/${c.slug}`}
              className="font-mono text-[9px] tracking-[0.12em] text-dim hover:text-ink"
            >
              {c.charterName}
            </Link>
          </div>
        </div>
      </div>
    );
  };

  const dayGroup = (day: CalendarDay) => (
    <div key={day.iso} className="mb-6">
      <div className="mb-1.5 flex items-center gap-2.5">
        <Mono className="text-[9.5px] tracking-[0.16em] text-faint">
          {shortDate(day.iso)} · {day.weekday} · {relativeLabel(day.iso, from)}
        </Mono>
        <div className="h-px flex-1 bg-edge" />
      </div>
      {day.events.map(eventRow)}
      {day.cards.map(cardRow)}
    </div>
  );

  const pastItems = [...model.pastEvents, ...model.overdueCards];

  return (
    <>
      <div className="mb-[26px] rounded-[18px] border border-edge bg-surf px-[18px] py-4">
        <Mono className="mb-3 block text-[9px] tracking-[0.14em] text-faint">{model.label}</Mono>
        <div className="mb-1.5 grid grid-cols-7 gap-1">
          {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
            <Mono key={i} className="text-center text-[8.5px] text-faint">
              {w}
            </Mono>
          ))}
        </div>
        {model.rows.map((row, ri) => (
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
                  {d.dots.map((dot, di) =>
                    dot.kind === "event" ? (
                      <span
                        key={di}
                        className="h-1 w-1 rounded-[1px]"
                        style={{ background: dot.color }}
                      />
                    ) : (
                      <span
                        key={di}
                        className={`h-1 w-1 rounded-full ${dot.overdue ? "bg-wait-ink" : "bg-sky"}`}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {model.needsAction.length > 0 && (
        <div className="mb-[26px] rounded-[18px] border border-edge bg-surf px-[18px] py-4">
          <Mono className="mb-3 block text-[9px] tracking-[0.14em] text-faint">NEEDS ACTION</Mono>
          <div className="flex flex-col gap-2.5">
            {model.needsAction.map((e) => (
              <div key={e.key} className="flex min-w-0 items-start gap-2.5">
                <span
                  className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-[2px]"
                  style={{ background: e.color }}
                />
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-medium leading-[1.35]">{e.title}</span>
                    <Mono className="text-[9px] text-faint">{shortDate(e.date)}</Mono>
                  </div>
                  <span className="text-[12.5px] leading-[1.5] text-wait-ink">{e.action}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pastItems.length > 0 && (
        <div className="mb-6">
          <div className="mb-1.5 flex items-center gap-2.5">
            <Mono className="text-[9.5px] tracking-[0.16em] text-faint">BEHIND</Mono>
            <div className="h-px flex-1 bg-edge" />
          </div>
          {model.pastEvents.map(eventRow)}
          {model.overdueCards.map(cardRow)}
        </div>
      )}

      {model.upNext.length === 0 && pastItems.length === 0 ? (
        <p className="text-[13px] text-faint">
          Nothing in the next two weeks. Add an event, or give a task a due date.
        </p>
      ) : (
        <>
          <div className="mb-2.5 flex items-center gap-2.5">
            <Mono className="text-[9.5px] tracking-[0.16em] text-faint">UP NEXT</Mono>
            <div className="h-px flex-1 bg-edge" />
          </div>
          {model.upNext.length === 0 ? (
            <p className="text-[13px] text-faint">Nothing in the next two weeks.</p>
          ) : (
            model.upNext.map(dayGroup)
          )}
        </>
      )}
    </>
  );
}
