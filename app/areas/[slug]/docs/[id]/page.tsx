import { notFound } from "next/navigation";
import { getCharter } from "@/lib/core/store";
import { listNotes } from "@/lib/core/knowledge";
import { buildDocPage } from "@/lib/view/doc";
import DocPage from "@/components/momentum/docs/doc-page";

export const dynamic = "force-dynamic";

export default async function AreaDocPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const charter = await getCharter("area", slug).catch(() => null);
  if (!charter) notFound();

  const notes = await listNotes();
  const model = buildDocPage(notes, id, `area:${charter.id}`, charter.name);
  if (!model) notFound();

  return (
    <DocPage
      model={model}
      indexHref={`/areas/${charter.id}/docs`}
      backLabel={`${charter.name} docs`}
    />
  );
}
