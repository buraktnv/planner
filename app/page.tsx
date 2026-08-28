import { readJournal } from "@/lib/core/journal";
import { listEvents } from "@/lib/core/calendar";
import { getDaily } from "@/lib/core/daily";
import { buildFocus } from "@/lib/view/focus";
import { toEventModels } from "@/lib/view/calendar";
import { buildDaily } from "@/lib/view/daily";
import { loadWorkspace } from "@/lib/view/workspace";
import FocusView from "@/components/momentum/focus/focus-view";

export const dynamic = "force-dynamic";

export default async function FocusPage() {
  const [ws, journal, events, daily] = await Promise.all([
    loadWorkspace(),
    readJournal(30),
    listEvents(),
    getDaily(),
  ]);
  const model = buildFocus(ws, journal, toEventModels(events, ws), buildDaily(daily, ws.today));
  return <FocusView model={model} />;
}
