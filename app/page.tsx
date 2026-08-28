import { readJournal } from "@/lib/core/journal";
import { buildFocus } from "@/lib/view/focus";
import { loadWorkspace } from "@/lib/view/workspace";
import FocusView from "@/components/momentum/focus/focus-view";

export const dynamic = "force-dynamic";

export default async function FocusPage() {
  const [ws, journal] = await Promise.all([loadWorkspace(), readJournal(30)]);
  const model = buildFocus(ws, journal);
  return <FocusView model={model} />;
}
