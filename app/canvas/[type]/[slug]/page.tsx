import { notFound } from "next/navigation";
import { readCanvas } from "@/lib/core/canvas";
import type { ProjectType } from "@/lib/core/types";
import { loadWorkspace } from "@/lib/view/workspace";
import { buildTaskCanvas } from "@/lib/view/canvas";
import CanvasView from "@/components/momentum/canvas/canvas-view";

export const dynamic = "force-dynamic";

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

  const [ws, file] = await Promise.all([
    loadWorkspace(),
    readCanvas({ kind: "tasks", type, slug }),
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
        title={`${charter.name} — tasks`}
        backHref={type === "project" ? `/projects/${slug}` : `/areas/${slug}`}
      />
    </div>
  );
}
