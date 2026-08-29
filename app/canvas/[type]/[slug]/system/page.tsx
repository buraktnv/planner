import { notFound } from "next/navigation";
import { listNotes } from "@/lib/core/knowledge";
import { getCharter, listCharters, listTasks } from "@/lib/core/store";
import { readCanvas } from "@/lib/core/canvas";
import type { ProjectType } from "@/lib/core/types";
import { buildNoteCanvas } from "@/lib/view/canvas";
import { hueOf } from "@/lib/ui/momentum";
import CanvasView from "@/components/momentum/canvas/canvas-view";

export const dynamic = "force-dynamic";

function isType(value: string): value is ProjectType {
  return value === "project" || value === "area";
}

export default async function SystemCanvasPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type, slug } = await params;
  if (!isType(type)) notFound();

  const charter = await getCharter(type, slug).catch(() => null);
  if (!charter) notFound();

  const scopeKey = type === "area" ? `area:${slug}` : slug;
  const [notes, projects, areas, file, tasks] = await Promise.all([
    listNotes(),
    listCharters("project"),
    listCharters("area"),
    readCanvas({ kind: "system", type, slug }),
    listTasks(type, slug),
  ]);

  const charterNames: Record<string, string> = {};
  for (const p of projects) charterNames[p.id] = p.name;
  for (const a of areas) charterNames[`area:${a.id}`] = a.name;

  const tone = hueOf(charter.id);
  const model = buildNoteCanvas(notes, file, {
    scopeKey,
    charterNames,
    tasks,
    core: {
      title: charter.name,
      why: charter.why,
      mvpScope: charter.mvpScope,
      href: type === "project" ? `/projects/${slug}` : `/areas/${slug}`,
      color: tone.color,
      tint: tone.tint,
    },
  });

  return (
    <div className="h-full">
      <CanvasView
        model={model}
        surface={{ kind: "system", type, slug }}
        title={`${charter.name} — system`}
        backHref={type === "project" ? `/projects/${slug}` : `/areas/${slug}`}
        drawEdges
        delegate={{ type, slug }}
        createScope={scopeKey}
      />
    </div>
  );
}
