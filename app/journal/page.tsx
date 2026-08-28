import { readJournal } from "@/lib/core/journal";
import { loadWorkspace } from "@/lib/view/workspace";
import { isoToday, shortDate, weekdayOf } from "@/lib/ui/momentum";
import { Mono, Panel } from "@/components/momentum/primitives";

export const dynamic = "force-dynamic";

const WEEKDAY_FULL: Record<string, string> = {
  MON: "MONDAY",
  TUE: "TUESDAY",
  WED: "WEDNESDAY",
  THU: "THURSDAY",
  FRI: "FRIDAY",
  SAT: "SATURDAY",
  SUN: "SUNDAY",
};

function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoToday(d);
}

export default async function ActivityPage() {
  const [days, ws] = await Promise.all([readJournal(30), loadWorkspace()]);

  const colorOf = (scope: string): string =>
    ws.byId.get(`project/${scope}`)?.color ??
    ws.byId.get(`area/${scope}`)?.color ??
    "var(--color-faint)";

  const since30 = daysAgoIso(30);
  const closed30 = ws.cards.filter((c) => c.doneDate && c.doneDate >= since30).length;
  const entries30 = days.reduce((a, d) => a + d.entries.length, 0);

  const journalDates = new Set(days.map((d) => d.date));
  let streak = 0;
  const offset = journalDates.has(isoToday()) ? 0 : 1;
  while (streak < 30 && journalDates.has(daysAgoIso(offset + streak))) streak++;

  return (
    <div className="mx-auto max-w-[720px] px-9 pt-[52px] pb-20">
      <h1 className="m-0 mb-[26px] text-2xl font-semibold tracking-[-0.03em]">Activity</h1>

      <Panel className="mb-7 rounded-[20px] px-6 py-[22px]">
        <div className="flex flex-wrap gap-[26px]">
          <div>
            <div className="text-[26px] font-bold leading-none tracking-[-0.03em] text-quick-ink">
              {closed30}
            </div>
            <Mono className="mt-1.5 block text-[9px] tracking-[0.1em] text-faint">CLOSED</Mono>
          </div>
          <div>
            <div className="text-[26px] font-bold leading-none tracking-[-0.03em] text-ink">
              {entries30}
            </div>
            <Mono className="mt-1.5 block text-[9px] tracking-[0.1em] text-faint">ENTRIES</Mono>
          </div>
          <div>
            <div className="text-[26px] font-bold leading-none tracking-[-0.03em] text-deep-ink">
              {streak}
            </div>
            <Mono className="mt-1.5 block text-[9px] tracking-[0.1em] text-faint">DAY STREAK</Mono>
          </div>
        </div>
      </Panel>

      {days.length === 0 ? (
        <p className="m-0 text-[13.5px] text-faint">
          Nothing logged in the last 30 days. Every task you add or finish lands here.
        </p>
      ) : (
        days.map((day) => (
          <div
            key={day.date}
            className="grid grid-cols-[70px_1fr] gap-5 border-t border-edge2 py-[18px]"
          >
            <div>
              <Mono className="block text-[11px]">{shortDate(day.date)}</Mono>
              <Mono className="mt-1 block text-[9px] text-faint">
                {WEEKDAY_FULL[weekdayOf(day.date)] ?? weekdayOf(day.date)}
              </Mono>
            </div>
            <div className="flex flex-col gap-2.5">
              {day.entries.map((e, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[38px_10px_1fr] items-baseline gap-2.5 text-[13px] leading-[1.5]"
                >
                  <Mono className="text-[10px] text-faint">{e.time}</Mono>
                  <span
                    className="h-[7px] w-[7px] -translate-y-px rounded-[2px]"
                    style={{ background: colorOf(e.scope) }}
                  />
                  <span className="text-dim">{e.message}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
