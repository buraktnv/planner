import { listArchived, listArchivedTasks } from "@/lib/core/store";
import { archiveNote, buildArchive } from "@/lib/view/archive";
import { AssistantNote, PageTitle } from "@/components/momentum/primitives";
import ArchiveView from "@/components/momentum/archive/archive-view";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const charters = await listArchived();
  const entries = await Promise.all(
    charters.map(async (charter) => ({
      charter,
      tasks: await listArchivedTasks(charter.type, charter.archivedAs),
    })),
  );
  const model = buildArchive(entries);

  return (
    <div className="mx-auto max-w-[820px] px-[36px] pt-[52px] pb-[90px]">
      <PageTitle
        title="Archive"
        meta={model.total > 0 ? `${model.total} RETIRED` : undefined}
      />
      <AssistantNote className="mb-6">{archiveNote(model)}</AssistantNote>
      <ArchiveView model={model} />
    </div>
  );
}
