import { listArchived, listArchivedTasks } from "@/lib/core/store";
import { loadWorkspace } from "@/lib/view/workspace";
import type { CardModel } from "@/lib/view/workspace";
import { buildDone, doneNote } from "@/lib/view/done";
import { hueOf } from "@/lib/ui/momentum";
import { AssistantNote, PageTitle } from "@/components/momentum/primitives";
import DoneView from "@/components/momentum/done/done-view";

export const dynamic = "force-dynamic";

async function archivedCards(): Promise<CardModel[]> {
  const charters = await listArchived();
  const out: CardModel[] = [];
  for (const charter of charters) {
    const tasks = await listArchivedTasks(charter.type, charter.archivedAs);
    const tone = hueOf(charter.archivedAs);
    for (const t of tasks) {
      if (!t.done) continue;
      out.push({
        key: `archive/${charter.type}/${charter.archivedAs}/${t.id}`,
        type: charter.type,
        slug: charter.archivedAs,
        charterName: `${charter.name} (archived)`,
        color: tone.color,
        tint: tone.tint,
        id: t.id,
        title: t.title,
        size: t.size,
        lane: "some",
        section: t.section,
        done: true,
        due: t.due,
        est: t.est,
        created: t.created,
        doneDate: t.doneDate,
        waitsOn: t.waitsOn,
        blocked: false,
        hasDetail: false,
        overdue: false,
        pct: 100,
        subDone: 0,
        subTotal: 0,
        subs: [],
        priority: "—",
      });
    }
  }
  return out;
}

export default async function DonePage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const includeArchived = archived === "1";

  const [ws, fromArchive] = await Promise.all([loadWorkspace(), archivedCards()]);
  const model = buildDone(ws, includeArchived ? fromArchive : []);

  return (
    <div className="mx-auto max-w-[820px] px-[36px] pt-[52px] pb-[90px]">
      <PageTitle title="Done" meta={model.total > 0 ? `${model.total} FINISHED` : undefined} />
      <AssistantNote className="mb-6">{doneNote(model)}</AssistantNote>
      <DoneView
        model={model}
        archivedCount={fromArchive.length}
        includeArchived={includeArchived}
      />
    </div>
  );
}
