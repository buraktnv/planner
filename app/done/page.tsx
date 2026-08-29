import {
  listArchived,
  listArchivedDetailIds,
  listArchivedTasks,
  type ArchivedCharter,
} from "@/lib/core/store";
import type { Task } from "@/lib/core/types";
import { loadWorkspace } from "@/lib/view/workspace";
import type { CardModel } from "@/lib/view/workspace";
import { buildDone, doneNote } from "@/lib/view/done";
import { buildArchive } from "@/lib/view/archive";
import { hueOf } from "@/lib/ui/momentum";
import { AssistantNote, PageTitle } from "@/components/momentum/primitives";
import DoneView from "@/components/momentum/done/done-view";

export const dynamic = "force-dynamic";

interface ArchiveEntry {
  charter: ArchivedCharter;
  tasks: Task[];
  detailIds: Set<string>;
}

async function archiveEntries(): Promise<ArchiveEntry[]> {
  const charters = await listArchived();
  return Promise.all(
    charters.map(async (charter) => ({
      charter,
      tasks: await listArchivedTasks(charter.type, charter.archivedAs),
      detailIds: new Set(await listArchivedDetailIds(charter.type, charter.archivedAs)),
    })),
  );
}

function doneCardsOf(entries: ArchiveEntry[]): CardModel[] {
  const out: CardModel[] = [];
  for (const { charter, tasks, detailIds } of entries) {
    const tone = hueOf(charter.archivedAs);
    for (const t of tasks) {
      if (!t.done) continue;
      out.push({
        key: `archive/${charter.type}/${charter.archivedAs}/${t.id}`,
        type: charter.type,
        slug: charter.archivedAs,
        charterName: charter.name,
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
        hasDetail: detailIds.has(t.id),
        overdue: false,
        pct: 100,
        subDone: 0,
        subTotal: 0,
        subs: [],
        priority: "—",
        archived: true,
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

  const [ws, entries] = await Promise.all([loadWorkspace(), archiveEntries()]);
  const fromArchive = doneCardsOf(entries);
  const model = buildDone(ws, includeArchived ? fromArchive : []);
  const archive = buildArchive(entries);

  return (
    <div className="mx-auto max-w-[820px] px-[36px] pt-[52px] pb-[90px]">
      <PageTitle title="Done" meta={model.total > 0 ? `${model.total} FINISHED` : undefined} />
      <AssistantNote className="mb-6">{doneNote(model)}</AssistantNote>
      <DoneView
        model={model}
        archive={archive}
        archivedCount={fromArchive.length}
        includeArchived={includeArchived}
      />
    </div>
  );
}
