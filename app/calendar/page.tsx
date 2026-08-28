import { listEvents } from "@/lib/core/calendar";
import { loadWorkspace } from "@/lib/view/workspace";
import { buildCalendar } from "@/lib/view/calendar";
import { AssistantNote } from "@/components/momentum/primitives";
import CalendarView from "@/components/momentum/calendar/calendar-view";
import NewButton from "@/components/momentum/new-button";

export const dynamic = "force-dynamic";

function noteFor(events: number, dated: number, needsAction: number): string {
  if (events === 0 && dated === 0) {
    return "Nothing is dated. Deadlines only exist once you write them down.";
  }
  if (needsAction > 0) {
    return `${needsAction} ${needsAction === 1 ? "event needs" : "events need"} something from you before the day arrives.`;
  }
  return `${events} ${events === 1 ? "event" : "events"} and ${dated} dated ${
    dated === 1 ? "task" : "tasks"
  } ahead. Nothing needs you yet.`;
}

export default async function CalendarPage() {
  const ws = await loadWorkspace();
  const events = await listEvents();
  const model = buildCalendar(ws, events);

  return (
    <div className="mx-auto max-w-[720px] px-[36px] pt-[52px] pb-[90px]">
      <div className="mb-3.5 flex items-center gap-[11px]">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Calendar</h1>
        <div className="flex-1" />
        <NewButton kind="event">Event</NewButton>
      </div>

      <AssistantNote className="mb-4">
        {noteFor(model.eventCount, model.datedCount, model.needsAction.length)}
      </AssistantNote>

      <CalendarView model={model} />
    </div>
  );
}
