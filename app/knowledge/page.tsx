import { listNotes } from "@/lib/core/knowledge";
import { listCharters } from "@/lib/core/store";
import { readJournal } from "@/lib/core/journal";
import { buildKnowledge, knowledgeNote } from "@/lib/view/knowledge";
import { buildDistillStatus } from "@/lib/view/distill";
import { isoToday } from "@/lib/ui/momentum";
import { AssistantNote } from "@/components/momentum/primitives";
import KnowledgeView from "@/components/momentum/knowledge/knowledge-view";
import DistillPanel from "@/components/momentum/knowledge/distill-panel";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const [notes, projects, areas, journal] = await Promise.all([
    listNotes(),
    listCharters("project"),
    listCharters("area"),
    readJournal(7),
  ]);

  const names: Record<string, string> = {};
  for (const p of projects) names[p.id] = p.name;
  for (const a of areas) names[`area:${a.id}`] = a.name;

  const model = buildKnowledge(notes, names);
  const distill = buildDistillStatus(journal, notes, isoToday());

  return (
    <div className="mx-auto max-w-[820px] px-[36px] pt-[52px] pb-[90px]">
      <KnowledgeView
        model={model}
        note={<AssistantNote className="mb-3">{knowledgeNote(model)}</AssistantNote>}
        distill={<DistillPanel status={distill} />}
      />
    </div>
  );
}
