import { notFound } from "next/navigation";
import type { ProjectType } from "@/lib/core/types";
import { loadWorkspace } from "@/lib/view/workspace";
import {
  backLabelFor,
  buildTaskPage,
  charterHref,
  parentIdOf,
  safeBackPath,
  taskIdsOf,
} from "@/lib/view/task";
import TaskView from "./task-view";

export default async function TaskScreen({
  type,
  slug,
  taskId,
  from,
}: {
  type: ProjectType;
  slug: string;
  taskId: string;
  from?: string;
}) {
  const ws = await loadWorkspace();
  const model = buildTaskPage(ws.cards, type, slug, taskId);
  if (!model) notFound();

  const back = safeBackPath(from);
  const home = charterHref(type, slug);
  const query = back ? `?from=${encodeURIComponent(back)}` : "";

  const parentId = model.parentHref ? parentIdOf(taskId) : null;
  const parent = parentId ? buildTaskPage(ws.cards, type, slug, parentId) : null;

  return (
    <TaskView
      model={model}
      backHref={model.parentHref ? `${model.parentHref}${query}` : (back ?? home)}
      backLabel={
        parent ? parent.node.title : backLabelFor(back, model.card.charterName)
      }
      charterHref={home}
      from={back}
      knownIds={taskIdsOf(ws.cards, type, slug)}
    />
  );
}
