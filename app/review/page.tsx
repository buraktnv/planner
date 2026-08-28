import { getInsights } from "@/lib/core/insights";
import { readJournal } from "@/lib/core/journal";
import { loadWorkspace } from "@/lib/view/workspace";
import { isoWeek, isoToday } from "@/lib/ui/momentum";
import { Mono, Panel, StatChip } from "@/components/momentum/primitives";
import WeeklyNote from "@/components/momentum/review/weekly-note";

export const dynamic = "force-dynamic";

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoToday(d);
}

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

  const since7 = daysAgoIso(7);
  const closed = ws.cards.filter((c) => c.doneDate && c.doneDate >= since7).length;
  const created = ws.cards.filter((c) => c.created && c.created >= since7 && !c.done).length;

  const journalDates = new Set(journalDays.map((d) => d.date));
  let streak = 0;
  const cursor = journalDates.has(isoToday()) ? 0 : 1;
  while (streak < 30 && journalDates.has(daysAgoIso(cursor + streak))) streak++;

  const moved = ws.charters
    .map((c) => ({
      name: c.name,
      color: c.color,
      done: c.cards.filter((t) => t.doneDate && t.doneDate >= since7).length,
    }))
    .filter((c) => c.done > 0)
    .sort((a, b) => b.done - a.done);

  const stalled = insights.stalled.map((s) => ({
    ...s,
    color: ws.byId.get(`project/${s.slug}`)?.color ?? ws.byId.get(`area/${s.slug}`)?.color ?? "var(--color-faint)",
  }));

  return (
    <div className="mx-auto max-w-[720px] px-9 pt-[52px] pb-[90px]">
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

      <WeeklyNote />
    </div>
  );
}
