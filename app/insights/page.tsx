import Link from "next/link";
import { getInsights } from "@/lib/core/insights";
import { loadWorkspace } from "@/lib/view/workspace";
import { isoWeek, parseIso, isoToday } from "@/lib/ui/momentum";
import { Bar, Mono, Panel } from "@/components/momentum/primitives";

export const dynamic = "force-dynamic";

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoToday(d);
}

export default async function DashboardPage() {
  const [ws, insights] = await Promise.all([loadWorkspace(), getInsights()]);

  const since7 = daysAgoIso(7);
  const since14 = daysAgoIso(14);

  const projects = ws.projects.map((p) => {
    const last7 = p.cards.filter((c) => c.doneDate && c.doneDate >= since7).length;
    const prev7 = p.cards.filter(
      (c) => c.doneDate && c.doneDate >= since14 && c.doneDate < since7,
    ).length;
    const delta = last7 - prev7;
    return { ...p, delta };
  });

  const weeks = insights.weeks;
  const maxDone = Math.max(1, ...weeks.map((w) => w.done));
  const pts = weeks.map((w, i) => [
    12 + i * (276 / Math.max(1, weeks.length - 1)),
    100 - (w.done / maxDone) * 86,
  ]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L288 100 L12 100 Z`;
  const firstWeek = weeks.length ? isoWeek(parseIso(weeks[0].weekStart)) : 0;
  const midWeek = weeks.length ? isoWeek(parseIso(weeks[Math.floor(weeks.length / 2)].weekStart)) : 0;
  const lastWeek = weeks.length ? isoWeek(parseIso(weeks[weeks.length - 1].weekStart)) : 0;
  const thisDone = weeks.length ? weeks[weeks.length - 1].done : 0;
  const prevDone = weeks.length > 1 ? weeks[weeks.length - 2].done : 0;
  const momentumDelta =
    prevDone > 0
      ? `${thisDone >= prevDone ? "+" : ""}${Math.round(((thisDone - prevDone) / prevDone) * 100)}% VS W${isoWeek(parseIso(weeks[weeks.length - 2].weekStart))}`
      : `${thisDone} DONE THIS WEEK`;

  const openTotal = ws.charters.reduce((a, c) => a + c.open, 0);
  const splitSource = ws.charters
    .filter((c) => c.open > 0)
    .sort((a, b) => b.open - a.open)
    .slice(0, 4);
  const C = 2 * Math.PI * 38;
  const donut = splitSource.reduce<
    { name: string; color: string; pct: number; dash: string; offset: string }[]
  >((rows, c) => {
    const acc = rows.reduce((sum, r) => sum + r.pct, 0);
    const pct = openTotal ? Math.round((c.open / openTotal) * 100) : 0;
    rows.push({
      name: c.name,
      color: c.color,
      pct,
      dash: `${((C * pct) / 100).toFixed(1)} ${C.toFixed(1)}`,
      offset: ((-C * acc) / 100).toFixed(1),
    });
    return rows;
  }, []);

  const overdue = ws.cards.filter((c) => c.overdue).length;

  return (
    <div className="mx-auto max-w-[880px] px-9 pt-[52px] pb-20">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Dashboard</h1>
        <Mono className="text-[10px] tracking-[0.1em] text-faint">WEEK {isoWeek()}</Mono>
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
            <Mono className="text-[9.5px] tracking-[0.1em] text-quick-ink">{momentumDelta}</Mono>
          </div>
          <svg viewBox="0 0 300 110" width="100%" height="115" preserveAspectRatio="none" aria-hidden>
            <path d={area} fill="rgba(99,184,148,.12)" />
            <path
              d={line}
              fill="none"
              stroke="var(--color-quick)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p[0].toFixed(1)}
                cy={p[1].toFixed(1)}
                r={i === pts.length - 1 ? 4.5 : 2.4}
                fill={i === pts.length - 1 ? "#63b894" : "rgba(99,184,148,.5)"}
              />
            ))}
          </svg>
          <div className="mt-1 flex justify-between">
            <Mono className="text-[9px] text-faint">W{firstWeek}</Mono>
            <Mono className="text-[9px] text-faint">W{midWeek}</Mono>
            <Mono className="text-[9px] text-faint">W{lastWeek}</Mono>
          </div>
        </Panel>

        <Panel className="min-w-0 rounded-[20px] px-[22px] py-5">
          <div className="mb-3.5 text-sm font-semibold tracking-[-0.02em]">Time split</div>
          {donut.length === 0 ? (
            <p className="m-0 text-[13px] text-faint">Nothing open anywhere.</p>
          ) : (
            <div className="flex flex-col items-start gap-4 lg:flex-row lg:items-center">
              <svg width="104" height="104" viewBox="0 0 100 100" className="shrink-0 -rotate-90" aria-hidden>
                {donut.map((d) => (
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
                {donut.map((d) => (
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

      <div className="flex items-center gap-[11px] rounded-[14px] bg-soft px-[17px] py-3.5">
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
          <Link href="/calendar" className="font-mono text-[10px] text-faint transition-colors hover:text-ink">
            SHOW
          </Link>
        )}
      </div>
    </div>
  );
}
