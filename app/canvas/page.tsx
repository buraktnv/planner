import { listNotes } from "@/lib/core/knowledge";
import { listCharters } from "@/lib/core/store";
import { readCanvas } from "@/lib/core/canvas";
import { buildNoteCanvas } from "@/lib/view/canvas";
import CanvasView from "@/components/momentum/canvas/canvas-view";

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  const [notes, projects, areas, file] = await Promise.all([
    listNotes(),
    listCharters("project"),
    listCharters("area"),
    readCanvas({ kind: "knowledge" }),
  ]);

  const charterNames: Record<string, string> = {};
  for (const p of projects) charterNames[p.id] = p.name;
  for (const a of areas) charterNames[`area:${a.id}`] = a.name;

  const model = buildNoteCanvas(notes, file, { charterNames });

  return (
    <div className="h-full">
      <CanvasView model={model} surface={{ kind: "knowledge" }} title="Canvas" />
    </div>
  );
}
