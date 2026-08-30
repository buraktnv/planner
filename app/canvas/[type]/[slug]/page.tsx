import { notFound } from "next/navigation";
import { readCanvas } from "@/lib/core/canvas";
import { listCharters } from "@/lib/core/store";
import type { ProjectType } from "@/lib/core/types";
import { loadWorkspace } from "@/lib/view/workspace";
import { buildTaskCanvas } from "@/lib/view/canvas";
import CanvasView from "@/components/momentum/canvas/canvas-view";
import { buildCanvasTabs, type TabCharter } from "@/lib/view/canvas-tabs";
import { hueOf } from "@/lib/ui/momentum";

export const dynamic = "force-dynamic";

function tabCharters(
  projects: { id: string; name: string }[],
  areas: { id: string; name: string }[],
): TabCharter[] {
  return [
    ...projects.map((p) => ({
      id: p.id,
      name: p.name,
      type: "project" as const,
      color: hueOf(p.id).color,
    })),
    ...areas.map((a) => ({
      id: a.id,
      name: a.name,
      type: "area" as const,
      color: hueOf(a.id).color,
    })),
  ];
}


function isType(value: string): value is ProjectType {
  return value === "project" || value === "area";
}

export default async function TaskCanvasPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type, slug } = await params;
  if (!isType(type)) notFound();

  const [ws, file, projects, areas] = await Promise.all([
    loadWorkspace(),
    readCanvas({ kind: "tasks", type, slug }),
    listCharters("project"),
    listCharters("area"),
  ]);
  const charter = ws.byId.get(`${type}/${slug}`);
  if (!charter) notFound();

  const model = buildTaskCanvas(
    {
      id: charter.id,
      name: charter.name,
      type: charter.type,
      color: charter.color,
      tint: charter.tint,
      mvpScope: charter.mvpScope,
      cards: charter.cards,
    },
    file,
  );

  return (
    <div className="h-full">
      <CanvasView
        model={model}
        surface={{ kind: "tasks", type, slug }}
        tabs={buildCanvasTabs(tabCharters(projects, areas), "tasks")}
        title={`${charter.name} — tasks`}
        backHref={type === "project" ? `/projects/${slug}` : `/areas/${slug}`}
      />
    </div>
  );
}
