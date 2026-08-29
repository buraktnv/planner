import type { ArchivedCharter } from "@/lib/core/store";
import type { ProjectType, Task } from "@/lib/core/types";
import { hueOf } from "@/lib/ui/momentum";

export interface ArchivedRow {
  key: string;
  type: ProjectType;
  name: string;
  archivedAs: string;
  archivedAt: string;
  color: string;
  tint: string;
  why: string;
  total: number;
  done: number;
}

export interface ArchiveModel {
  projects: ArchivedRow[];
  areas: ArchivedRow[];
  total: number;
}

export function buildArchive(
  entries: { charter: ArchivedCharter; tasks: Task[] }[],
): ArchiveModel {
  const rows = entries.map(({ charter, tasks }) => {
    const tone = hueOf(charter.archivedAs);
    return {
      key: `${charter.type}/${charter.archivedAs}`,
      type: charter.type,
      name: charter.name,
      archivedAs: charter.archivedAs,
      archivedAt: charter.archivedAt,
      color: tone.color,
      tint: tone.tint,
      why: charter.why.trim(),
      total: tasks.length,
      done: tasks.filter((t) => t.done).length,
    };
  });
  const sort = (a: ArchivedRow, b: ArchivedRow) =>
    b.archivedAt.localeCompare(a.archivedAt) || a.name.localeCompare(b.name);
  return {
    projects: rows.filter((r) => r.type === "project").sort(sort),
    areas: rows.filter((r) => r.type === "area").sort(sort),
    total: rows.length,
  };
}

export function archiveNote(model: ArchiveModel): string {
  if (model.total === 0) return "Nothing archived. Retired projects and areas land here.";
  const noun = model.total === 1 ? "charter" : "charters";
  return `${model.total} retired ${noun}. Nothing here was deleted — restore any of it.`;
}
