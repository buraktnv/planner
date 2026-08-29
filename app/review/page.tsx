import Link from "next/link";
import { getInsights } from "@/lib/core/insights";
import { readJournal } from "@/lib/core/journal";
import { loadWorkspace } from "@/lib/view/workspace";
import {
  closedSince,
  daysAgo,
  journalStreak,
  momentumChart,
  movedFronts,
  openSplit,
  openedSince,
  weekDeltas,
} from "@/lib/view/review";
import { isoWeek } from "@/lib/ui/momentum";
import { Bar, Mono, Panel, StatChip } from "@/components/momentum/primitives";
import WeeklyNote from "@/components/momentum/review/weekly-note";

export const dynamic = "force-dynamic";

function rangeLabel(): string {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "long" }).toUpperCase();
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${month(end)}`;
  }
  return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
}

export default async function ReviewPage() {
  const [ws, insights, journalDays] = await Promise.all([
    loadWorkspace(),
    getInsights(),
    readJournal(30),
  ]);

  const since7 = daysAgo(ws.today, 7);
  const closed = closedSince(ws.cards, since7);
  const created = openedSince(ws.cards, since7);
  const streak = journalStreak(
    journalDays.map((d) => d.date),
    ws.today,
  );
  const moved = movedFronts(ws.charters, since7);
  const projects = weekDeltas(ws.projects, ws.today);
  const chart = momentumChart(insights.weeks);
  const split = openSplit(ws.charters);
  const overdue = ws.cards.filter((c) => c.overdue).length;

  const stalled = insights.stalled.map((s) => ({
    ...s,
    color:
      ws.byId.get(`project/${s.slug}`)?.color ??
      ws.byId.get(`area/${s.slug}`)?.color ??
      "var(--color-faint)",
  }));

  return (
    <div className="mx-auto max-w-[880px] px-9 pt-[52px] pb-[90px]">
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Week {isoWeek()}</h1>
        <Mono className="text-[10px] tracking-[0.1em] text-faint">{rangeLabel()}</Mono>
      </div>

      <p className="m-0 mb-6 max-w-[26ch] text-[21px] font-semibold leading-[1.35] tracking-[-0.025em]">
        {closed === 0
          ? "Nothing closed this week yet."
          : `${closed} ${closed === 1 ? "task" : "tasks"} closed across ${moved.length} ${moved.length === 1 ? "front" : "fronts"}.`}
      </p>

      <div className="mb-[30px] grid grid-cols-2 gap-[11px] md:grid-cols-4">
        <StatChip n={closed} label="CLOSED" color="var(--color-quick-ink)" />
        <StatChip n={created} label="NEW OPEN" color="var(--color-ink)" />
        <StatChip n={streak} label="DAY STREAK" color="var(--color-deep-ink)" />
        <StatChip n={moved.length} label="FRONTS MOVED" color="var(--color-sky-ink)" />
      </div>

      <div className="mb-[30px] grid grid-cols-1 gap-[11px] md:grid-cols-[1.4fr_minmax(0,1fr)]">
        <Panel className="min-w-0 px-5 py-[18px]">
          <Mono className="mb-3.5 block text-[9px] tracking-[0.12em] text-quick-ink">MOVED</Mono>
          {moved.length === 0 ? (
            <p className="m-0 text-[12.5px] text-faint">Nothing moved in the last 7 days.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {moved.map((m) => (
                <div key={m.name} className="flex items-start gap-2.5">
                  <span
                    className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-[2px]"
                    style={{ background: m.color }}
                  />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">{m.name}</div>
                    <div className="mt-[3px] text-[12.5px] leading-[1.45] text-dim">
                      {m.done} {m.done === 1 ? "task" : "tasks"} closed
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel dashed className="min-w-0 px-5 py-[18px]">
          <Mono className="mb-3.5 block text-[9px] tracking-[0.12em] text-wait-ink">
            DIDN&apos;T
          </Mono>
          {stalled.length === 0 ? (
            <p className="m-0 text-[12.5px] text-faint">Nothing is stalled right now.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {stalled.map((m) => (
                <div key={m.slug} className="flex items-start gap-2.5">
                  <span
                    className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-[2px] opacity-50"
                    style={{ background: m.color }}
                  />
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-dim">{m.name}</div>
                    <div className="mt-[3px] text-[12.5px] leading-[1.45] text-faint">
                      nothing in {m.days} days
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mb-[11px] rounded-[20px] px-[26px] py-6">
        <div className="mb-[22px] flex items-baseline justify-between">
          <span className="text-[15px] font-semibold tracking-[-0.02em]">
            How close each one is
          </span>
          <Mono className="text-[9.5px] tracking-[0.1em] text-faint">TO MVP</Mono>
        </div>
        {projects.length === 0 ? (
          <p className="m-0 text-[13px] text-faint">No projects yet. Create one to see progress.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {projects.map((p) => (
              <div key={p.id}>
                <div className="mb-[9px] flex items-baseline gap-2.5">
                  <span
                    className="inline-block h-2 w-2 rounded-[3px]"
                    style={{ background: p.color }}
                  />
                  <span className="text-sm font-medium tracking-[-0.01em]">{p.name}</span>
                  <div className="flex-1" />
                  <Mono className="text-[11.5px] text-dim">{p.pct}%</Mono>
                  <Mono
                    className="text-[9.5px]"
                    style={{
                      color:
                        p.delta > 0
                          ? "var(--color-quick-ink)"
                          : p.delta < 0
                            ? "var(--color-wait-ink)"
                            : "var(--color-faint)",
                    }}
                  >
                    {p.delta > 0 ? `+${p.delta}` : p.delta < 0 ? `${p.delta}` : "—"}
                  </Mono>
                </div>
                <Bar pct={p.pct} color={p.color} height={12} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mb-[11px] grid grid-cols-1 gap-[11px] md:grid-cols-[1.4fr_minmax(0,1fr)]">
        <Panel className="min-w-0 rounded-[20px] px-[22px] py-5">
          <div className="mb-3.5 flex items-baseline justify-between">
            <span className="text-sm font-semibold tracking-[-0.02em]">Momentum</span>
            <Mono className="text-[9.5px] tracking-[0.1em] text-quick-ink">{chart.deltaLabel}</Mono>
          </div>
          <svg viewBox="0 0 300 110" width="100%" height="115" preserveAspectRatio="none" aria-hidden>
            <path d={chart.area} fill="rgba(99,184,148,.12)" />
            <path
              d={chart.line}
              fill="none"
              stroke="var(--color-quick)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {chart.pts.map((p, i) => (
              <circle
                key={i}
                cx={p[0].toFixed(1)}
                cy={p[1].toFixed(1)}
                r={i === chart.pts.length - 1 ? 4.5 : 2.4}
                fill={i === chart.pts.length - 1 ? "#63b894" : "rgba(99,184,148,.5)"}
              />
            ))}
          </svg>
          <div className="mt-1 flex justify-between">
            <Mono className="text-[9px] text-faint">W{chart.firstWeek}</Mono>
            <Mono className="text-[9px] text-faint">W{chart.midWeek}</Mono>
            <Mono className="text-[9px] text-faint">W{chart.lastWeek}</Mono>
          </div>
        </Panel>

        <Panel className="min-w-0 rounded-[20px] px-[22px] py-5">
          <div className="mb-3.5 text-sm font-semibold tracking-[-0.02em]">Time split</div>
          {split.length === 0 ? (
            <p className="m-0 text-[13px] text-faint">Nothing open anywhere.</p>
          ) : (
            <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center">
              <svg
                width="104"
                height="104"
                viewBox="0 0 100 100"
                className="shrink-0 -rotate-90"
                aria-hidden
              >
                {split.map((d) => (
                  <circle
                    key={d.name}
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke={d.color}
                    strokeWidth="15"
                    strokeDasharray={d.dash}
                    strokeDashoffset={d.offset}
                  />
                ))}
              </svg>
              <div className="flex min-w-0 flex-col gap-2">
                {split.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-[3px]"
                      style={{ background: d.color }}
                    />
                    <span className="text-[11.5px] text-dim">{d.name}</span>
                    <Mono className="text-[10px] text-faint">{d.pct}%</Mono>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="mb-[30px] flex items-center gap-[11px] rounded-[14px] bg-soft px-[17px] py-3.5">
        <span
          className="h-[7px] w-[7px] shrink-0 rounded-full"
          style={{ background: overdue ? "var(--color-wait)" : "var(--color-quick)" }}
        />
        <span className="text-[13px] text-dim">
          {overdue === 0
            ? "Nothing has slipped past its date."
            : `${overdue} ${overdue === 1 ? "card" : "cards"} slipped past ${overdue === 1 ? "its" : "their"} date.`}
        </span>
        <div className="flex-1" />
        {overdue > 0 && (
          <Link
            href="/calendar"
            className="font-mono text-[10px] text-faint transition-colors hover:text-ink"
          >
            SHOW
          </Link>
        )}
      </div>

      <WeeklyNote />
    </div>
  );
}
