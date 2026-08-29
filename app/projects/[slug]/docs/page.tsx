import { notFound } from "next/navigation";
import { getCharter } from "@/lib/core/store";
import { listNotes } from "@/lib/core/knowledge";
import { buildDocs, docsNote } from "@/lib/view/docs";
import { AssistantNote } from "@/components/momentum/primitives";
import DocsView from "@/components/momentum/docs/docs-view";

export const dynamic = "force-dynamic";

export default async function ProjectDocsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const charter = await getCharter("project", slug).catch(() => null);
  if (!charter) notFound();

  const notes = await listNotes();
  const model = buildDocs(notes, charter.id, charter.name);

  return (
    <div className="mx-auto max-w-[820px] px-[36px] pt-[34px] pb-[90px]">
      <DocsView model={model} backHref={`/projects/${charter.id}`} />
      <AssistantNote className="mt-5">{docsNote(model)}</AssistantNote>
    </div>
  );
}
