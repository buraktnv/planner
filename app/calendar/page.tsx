import { loadWorkspace } from "@/lib/view/workspace";
import { AssistantNote } from "@/components/momentum/primitives";
import CalendarView from "@/components/momentum/calendar/calendar-view";
import NewButton from "@/components/momentum/new-button";

export const dynamic = "force-dynamic";

function noteFor(dated: number, overdue: number): string {
  if (dated === 0) return "Nothing is dated. Deadlines only exist once you write them down.";
  if (overdue === 0) return `${dated} dated ${dated === 1 ? "task" : "tasks"} ahead. Nothing needs you yet.`;
  return `${overdue} ${overdue === 1 ? "thing needs" : "things need"} you. The rest is just showing up.`;
}

export default async function CalendarPage() {
  const ws = await loadWorkspace();
  const dated = ws.cards.filter((c) => c.due && !c.done);
  const overdue = dated.filter((c) => c.overdue).length;

  return (
    <div className="mx-auto max-w-[720px] px-[36px] pt-[52px] pb-[90px]">
      <div className="mb-3.5 flex items-center gap-[11px]">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Calendar</h1>
        <div className="flex-1" />
        <NewButton kind="event">Event</NewButton>
      </div>

      <AssistantNote className="mb-4">{noteFor(dated.length, overdue)}</AssistantNote>

      <CalendarView cards={dated} today={ws.today} />
    </div>
  );
}
