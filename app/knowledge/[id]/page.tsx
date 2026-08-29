import { notFound } from "next/navigation";
import { listNotes } from "@/lib/core/knowledge";
import { buildDocPage } from "@/lib/view/doc";
import DocPage from "@/components/momentum/docs/doc-page";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const notes = await listNotes();
  const model = buildDocPage(notes, id);
  if (!model) notFound();

  return <DocPage model={model} indexHref="/knowledge" backLabel="Knowledge" />;
}
