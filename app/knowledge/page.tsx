import { listNotes } from "@/lib/core/knowledge";
import { listCharters } from "@/lib/core/store";
import { buildKnowledge, knowledgeNote } from "@/lib/view/knowledge";
import { AssistantNote } from "@/components/momentum/primitives";
import KnowledgeView from "@/components/momentum/knowledge/knowledge-view";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const [notes, projects, areas] = await Promise.all([
    listNotes(),
    listCharters("project"),
    listCharters("area"),
  ]);

  const names: Record<string, string> = {};
  for (const p of projects) names[p.id] = p.name;
  for (const a of areas) names[`area:${a.id}`] = a.name;

  const model = buildKnowledge(notes, names);

  return (
    <div className="mx-auto max-w-[820px] px-[36px] pt-[52px] pb-[90px]">
      <AssistantNote className="mb-4">{knowledgeNote(model)}</AssistantNote>
      <KnowledgeView model={model} />
    </div>
  );
}
