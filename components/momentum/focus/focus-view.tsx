"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  clockOf,
  isLowDay,
  nextIndexAfterSkip,
  planRowsFor,
  type FocusModel,
  type RankedItem,
  type SkipReason,
} from "@/lib/view/focus";
import { LANES } from "@/lib/ui/momentum";
import { useMomentum } from "../context";
import { Bar, Mono, Ring, Rule, Tick } from "../primitives";

const MOODS = [
  { n: 1, label: "Flat", color: "#c9857a" },
  { n: 2, label: "Low", color: "#d9a463" },
  { n: 3, label: "Okay", color: "#8fbfc9" },
  { n: 4, label: "Good", color: "#63b894" },
];

const SKIP_REASONS = [
  { key: "energy", label: "No energy" },
  { key: "blocked", label: "Blocked" },
  { key: "urgent", label: "Something urgent" },
  { key: "quick", label: "Give me a quick win" },
] as const;

const FOCUS_MINUTES = 25;

function apiBase(type: "project" | "area"): string {
  return type === "project" ? "/api/projects" : "/api/areas";
}

export default function FocusView({ model }: { model: FocusModel }) {
  const router = useRouter();
  const { openCard, openComposer } = useMomentum();

  const [mood, setMood] = useState<number | null>(null);
  const [planState, setPlanState] = useState<"open" | "accepted" | "changed">("open");
  const [stuckOpen, setStuckOpen] = useState(false);
  const [stuckStep, setStuckStep] = useState(0);
  const [skipOpen, setSkipOpen] = useState(false);
  // Seeded from the model so a blocked task is never presented first.
  const [oneIndex, setOneIndex] = useState(model.oneIndex);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [seconds, setSeconds] = useState(FOCUS_MINUTES * 60);
  const [timing, setTiming] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!timing) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setTiming(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [timing]);

  const lowDay = isLowDay(mood);
  const ranked = model.ranked;
  const one: RankedItem | null = ranked[oneIndex] ?? ranked[0] ?? null;
  const planRows = planRowsFor(ranked, mood);

  const clock = clockOf(seconds);

  const comingUp = model.comingUp.length ? (
    <div className={model.todayEvents.length ? "mt-4 border-t border-edge2 pt-3.5" : ""}>
      <Mono className="mb-3 block text-[9px] tracking-[0.14em] text-faint">COMING UP</Mono>
      <div className="flex flex-col gap-2.5">
        {model.comingUp.map((e) => (
          <div key={e.key} className="flex min-w-0 items-start gap-2.5">
            <span
              className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-[2px]"
              style={{ background: e.color }}
            />
            <div className="flex min-w-0 flex-col gap-[3px]">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[13.5px] font-medium leading-[1.35]">{e.title}</span>
                <Mono className="text-[10px] text-dim">
                  IN {e.daysUntil} {e.daysUntil === 1 ? "DAY" : "DAYS"}
                </Mono>
              </div>
              {e.action ? (
                <span className="text-[12.5px] leading-[1.5] text-wait-ink">{e.action}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const eventStrip = model.todayEvents.length || model.comingUp.length ? (
    <div className="mb-[22px] rounded-[20px] border border-edge bg-surf px-[22px] py-[17px]">
      {model.todayEvents.length ? (
        <Mono className="mb-3 block text-[9px] tracking-[0.14em] text-faint">TODAY</Mono>
      ) : null}
      <div className="flex flex-col gap-2.5">
        {model.todayEvents.map((e) => (
          <div key={e.key} className="flex min-w-0 items-start gap-2.5">
            <span
              className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-[2px]"
              style={{ background: e.color }}
            />
            <div className="flex min-w-0 flex-col gap-[3px]">
              <div className="flex flex-wrap items-baseline gap-2">
                {e.time ? <Mono className="text-[10px] text-dim">{e.time}</Mono> : null}
                <span className="text-[13.5px] font-medium leading-[1.35]">{e.title}</span>
              </div>
              {e.note ? (
                <span className="text-[12.5px] leading-[1.5] text-dim">{e.note}</span>
              ) : null}
              {e.action ? (
                <span className="text-[12.5px] leading-[1.5] text-wait-ink">{e.action}</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {comingUp}
    </div>
  ) : null;

  const pickMood = async (n: number) => {
    setMood(n);
    setPlanState("open");
    const label = MOODS.find((m) => m.n === n)?.label ?? "";
    try {
      await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "life", message: `Mood: ${label.toLowerCase()}` }),
      });
    } catch {
      /* the picker still works offline; the journal line is a bonus */
    }
  };

  const complete = async (item: RankedItem) => {
    const next = !ticked[item.card.key];
    setTicked((prev) => ({ ...prev, [item.card.key]: next }));
    await fetch(`${apiBase(item.card.type)}/${item.card.slug}/tasks`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: item.card.id, complete: next }),
    });
    router.refresh();
  };

  const skip = async (reason: SkipReason) => {
    setSkipOpen(false);
    if (!one) return;
    if (reason === "blocked") {
      await fetch(`${apiBase(one.card.type)}/${one.card.slug}/tasks`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: one.card.id, lane: "wait" }),
      });
      router.refresh();
      return;
    }
    setOneIndex(nextIndexAfterSkip(ranked, oneIndex, reason));
  };

  if (ranked.length === 0) {
    return (
      <div className="mx-auto max-w-[680px] px-9 pt-16 pb-20">
        {eventStrip}
        <Mono className="text-[10px] tracking-[0.18em] text-faint">ONE THING</Mono>
        <h1 className="mt-3.5 mb-6 text-[31px] font-semibold leading-[1.22] tracking-[-0.03em]">
          Nothing is open.
        </h1>
        <p className="m-0 mb-6 max-w-[52ch] text-[13.5px] leading-[1.55] text-dim">
          No task in any project or area is waiting on you. Capture the next thing, or leave it
          closed for today.
        </p>
        <button
          type="button"
          onClick={() => openComposer("branch")}
          className="rounded-[13px] bg-quick px-[22px] py-3.5 text-[15px] font-semibold text-white"
        >
          Capture something
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[680px] px-9 pt-16 pb-20">
      <div className="mb-3.5 flex flex-wrap items-center gap-[11px]">
        <Mono className="text-[10px] tracking-[0.18em] text-faint">HOW IS TODAY</Mono>
        <div className="flex flex-wrap gap-[7px]">
          {MOODS.map((m) => {
            const on = mood === m.n;
            return (
              <button
                key={m.n}
                type="button"
                onClick={() => pickMood(m.n)}
                className="rounded-[20px] border px-3.5 py-1.5 text-[12.5px]"
                style={{
                  borderColor: on ? "transparent" : "var(--color-edge)",
                  background: on ? m.color : "var(--color-soft)",
                  color: on ? "#ffffff" : "var(--color-dim)",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {eventStrip}

      <div className="mb-[26px] rounded-[20px] border border-edge bg-surf px-[22px] py-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[7px] bg-quick-tint font-mono text-[9.5px] text-quick-ink">
            M
          </span>
          <span className="text-[13.5px] leading-[1.55] text-dim">
            {lowDay ? model.quietLead : model.planLead}
            {model.dailyNote && (
              <>
                {" "}
                <Link href="/daily" className="text-faint underline-offset-2 hover:underline">
                  {model.dailyNote}
                </Link>
              </>
            )}
          </span>
        </div>

        <div className="mb-4 flex flex-col gap-0.5">
          {planRows.map((r, i) => (
            <div
              key={r.card.key}
              className="flex min-w-0 flex-col items-start gap-1.5 border-b border-edge2 py-[9px] sm:grid sm:grid-cols-[52px_minmax(0,1fr)_minmax(0,auto)] sm:items-center sm:gap-3"
            >
              <Mono className="text-[10px] text-faint">{String(i + 1).padStart(2, "0")}</Mono>
              <div className="flex min-w-0 flex-wrap items-baseline gap-[9px]">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-[2px]"
                  style={{ background: r.card.color }}
                />
                <span className="text-[13.5px] leading-[1.35]">{r.card.title}</span>
                <Mono className="text-[9px] text-faint">{r.card.charterName}</Mono>
              </div>
              <Mono className="min-w-0 text-[9.5px] text-dim">{r.effort}</Mono>
            </div>
          ))}
          {lowDay && (
            <div className="py-[9px]">
              <span className="text-[13.5px] text-faint">Nothing else. Genuinely.</span>
            </div>
          )}
        </div>

        {planState === "open" && (
          <div className="flex flex-wrap gap-[9px]">
            <button
              type="button"
              onClick={() => setPlanState("accepted")}
              className="rounded-[11px] bg-quick px-[18px] py-2.5 text-[13.5px] font-semibold text-white"
            >
              Run this day
            </button>
            <button
              type="button"
              onClick={() => setPlanState("changed")}
              className="rounded-[11px] border border-edge px-4 py-2.5 text-[13.5px] text-dim transition-colors hover:text-ink"
            >
              Change it
            </button>
            <button
              type="button"
              onClick={() => {
                setStuckOpen((v) => !v);
                setStuckStep(0);
              }}
              className="rounded-[11px] px-3.5 py-2.5 text-[13.5px] text-faint transition-colors hover:text-ink"
            >
              I&apos;m stuck
            </button>
          </div>
        )}
        {planState === "accepted" && (
          <div className="animate-pop flex items-center gap-[9px]">
            <span className="grid h-4 w-4 place-items-center rounded-full bg-quick">
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ffffff"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M4.5 12.5l5 5 10-11" />
              </svg>
            </span>
            <span className="text-[13px] text-dim">
              Locked in. Work down the list; tick as you go.
            </span>
          </div>
        )}
        {planState === "changed" && (
          <div className="animate-pop text-[13px] text-dim">
            Reorder by changing dates, lanes or sizes — or tell the assistant what to move.
          </div>
        )}
      </div>

      {stuckOpen && (
        <div
          className="animate-slidein mb-[26px] rounded-[20px] border border-edge bg-surf px-[22px] py-5"
          style={{ borderLeft: "3px solid #c9857a" }}
        >
          <Mono className="mb-3.5 block text-[9px] tracking-[0.12em] text-faint">
            STRAIGHT VERSION
          </Mono>
          {model.stuckFacts.map((line) => (
            <p key={line} className="m-0 mb-3 max-w-[56ch] text-[14.5px] leading-[1.65] text-ink">
              {line}
            </p>
          ))}

          {stuckStep >= 1 && (
            <div className="animate-slidein mt-4 flex flex-col gap-[9px]">
              {model.stuckOffers.map((offer) => (
                <div
                  key={offer.text}
                  className="flex items-center gap-[11px] rounded-[13px] bg-soft px-[15px] py-[13px]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: offer.kind === "physical" ? "#8fbfc9" : "#63b894" }}
                  />
                  <span className="text-[13.5px] leading-[1.5]">{offer.text}</span>
                </div>
              ))}
              <div className="mt-1.5 flex flex-wrap gap-[9px]">
                <button
                  type="button"
                  onClick={() => setTiming((v) => !v)}
                  className="flex items-center gap-[9px] rounded-[11px] px-[18px] py-[11px] text-[13.5px] font-semibold"
                  style={{
                    background: timing ? "var(--color-soft)" : "var(--color-quick)",
                    color: timing ? "var(--color-ink)" : "#ffffff",
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d={timing ? "M9 6v12M15 6v12" : "M7 4l13 8-13 8z"} />
                  </svg>
                  {timing ? clock : `Start ${FOCUS_MINUTES} minutes`}
                </button>
                <button
                  type="button"
                  onClick={() => setStuckOpen(false)}
                  className="rounded-[11px] px-3.5 py-[11px] text-[13.5px] text-faint transition-colors hover:text-ink"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {stuckStep === 0 && (
            <button
              type="button"
              onClick={() => setStuckStep(1)}
              className="mt-1.5 font-mono text-[10px] tracking-[0.1em] text-faint transition-colors hover:text-ink"
            >
              THEN WHAT →
            </button>
          )}
        </div>
      )}

      <div className="mt-0 mb-[22px] flex items-center gap-2.5">
        <Mono className="text-[10px] tracking-[0.18em] text-faint">ONE THING</Mono>
        <div className="h-px flex-1 bg-edge" />
      </div>

      {one && (
        <div className="rounded-[22px] border border-edge bg-surf p-[34px] shadow-[0_1px_2px_rgba(46,42,38,.04)]">
          <div className="mb-[18px] flex items-center gap-[9px]">
            <span
              className="h-[9px] w-[9px] rounded-[3px]"
              style={{ background: one.card.color }}
            />
            <Link
              href={
                one.card.type === "project"
                  ? `/projects/${one.card.slug}`
                  : `/areas/${one.card.slug}`
              }
              className="text-[12.5px] text-dim hover:text-ink"
            >
              {one.card.charterName}
            </Link>
            <div className="flex-1" />
            <Mono
              className="rounded-[7px] px-[9px] py-1 text-[9.5px] tracking-[0.1em]"
              style={{
                color: LANES[one.card.lane].ink,
                background: LANES[one.card.lane].tint,
              }}
            >
              {LANES[one.card.lane].label.toUpperCase()}
            </Mono>
          </div>

          <button
            type="button"
            onClick={() => openCard(one.card)}
            className="mb-[26px] block max-w-[20ch] text-left text-[31px] font-semibold leading-[1.22] tracking-[-0.03em]"
          >
            {one.card.title}
          </button>

          {one.card.subTotal > 0 && (
            <div className="mb-[26px] flex items-center gap-3.5">
              <div className="flex-1">
                <Bar pct={one.card.pct} color={one.card.color} height={9} />
              </div>
              <Mono className="text-[11px] text-dim">
                {one.card.subDone}/{one.card.subTotal}
              </Mono>
            </div>
          )}

          <div className="mb-[26px] flex items-center gap-[11px] rounded-[14px] bg-soft px-[15px] py-[13px]">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[7px] bg-quick-tint font-mono text-[9.5px] text-quick-ink">
              M
            </span>
            <span className="text-[13.5px] leading-[1.5] text-dim">{one.why}</span>
          </div>

          <div className="flex flex-wrap items-center gap-[11px]">
            <button
              type="button"
              onClick={() => setTiming((v) => !v)}
              className="flex items-center gap-2.5 rounded-[13px] px-[22px] py-3.5 text-[15px] font-semibold"
              style={{
                background: timing ? "var(--color-soft)" : "var(--color-quick)",
                color: timing ? "var(--color-ink)" : "#ffffff",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d={timing ? "M9 6v12M15 6v12" : "M7 4l13 8-13 8z"} />
              </svg>
              {timing ? clock : `Start ${FOCUS_MINUTES} minutes`}
            </button>
            <button
              type="button"
              onClick={() => complete(one)}
              className="rounded-[13px] border border-edge px-[18px] py-3.5 text-sm text-dim transition-colors hover:border-faint hover:text-ink"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => setSkipOpen((v) => !v)}
              className="rounded-[13px] px-3.5 py-3.5 text-sm text-faint transition-colors hover:text-ink"
            >
              Skip
            </button>
          </div>

          {skipOpen && (
            <div className="animate-pop mt-3.5 flex flex-wrap gap-2">
              {SKIP_REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => skip(r.key)}
                  className="rounded-[9px] border border-edge bg-surf px-3 py-[7px] text-[12.5px] text-dim transition-colors hover:border-quick hover:text-ink"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-[30px] mb-1 flex flex-wrap items-center gap-2.5">
        <Mono className="text-[10px] tracking-[0.18em] text-faint">THEN, IN ORDER</Mono>
        <div className="h-px flex-1 bg-edge" />
        {model.held.map((h) => (
          <Mono key={h.label} className="text-[9.5px] text-dim">
            {h.n} {h.label}
          </Mono>
        ))}
      </div>

      <div className="mb-2 flex flex-col">
        {ranked.slice(oneIndex + 1, oneIndex + 8).map((r) => {
          const done = !!ticked[r.card.key];
          return (
            <div
              key={r.card.key}
              className="grid grid-cols-[18px_1fr_auto] items-start gap-[13px] rounded-[10px] border-b border-edge2 px-2.5 py-3.5"
              style={{
                background: r.pinned ? "var(--color-wait-tint)" : "transparent",
                opacity: done ? 0.45 : 1,
              }}
            >
              <button
                type="button"
                onClick={() => complete(r)}
                className="mt-0.5"
                aria-label={`Complete ${r.card.title}`}
              >
                <Tick done={done} color={r.card.color} size={17} />
              </button>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-[9px]">
                  <button
                    type="button"
                    onClick={() => openCard(r.card)}
                    className={`text-left text-[14.5px] font-medium tracking-[-0.01em] ${
                      done ? "line-through" : ""
                    }`}
                  >
                    {r.card.title}
                  </button>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[9px] text-faint">
                    <span
                      className="h-1.5 w-1.5 rounded-[2px]"
                      style={{ background: r.card.color }}
                    />
                    {r.card.charterName}
                  </span>
                </div>
                <div className="mt-1.5 max-w-[52ch] text-[12.5px] leading-[1.5] text-dim">
                  {r.why}
                </div>
              </div>
              <Mono className="mt-[3px] whitespace-nowrap text-[9.5px] text-dim">{r.effort}</Mono>
            </div>
          );
        })}
      </div>

      <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[11px]">
        {model.streaks.map((s) => (
          <div
            key={s.name}
            className="flex min-w-0 items-center gap-[13px] rounded-[18px] border border-edge bg-surf p-4"
          >
            <Ring pct={s.pct} color={s.color} size={46} />
            <div>
              <div className="text-[21px] font-bold leading-none tracking-[-0.03em]">{s.n}</div>
              <div className="mt-1 text-[11px] text-dim">{s.name}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <Rule label="ALL OPEN WORK" />
        <Link href="/board" className="text-[13px] text-quick-ink hover:text-ink">
          {model.openTotal} open across every lane →
        </Link>
      </div>
    </div>
  );
}
