import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getArchived,
  listArchivedDetailIds,
  listArchivedTasks,
} from "@/lib/core/store";
import type { ProjectType } from "@/lib/core/types";
import { hueOf, shortDate } from "@/lib/ui/momentum";
import { Mono, Rule } from "@/components/momentum/primitives";
import Markdown from "@/components/momentum/markdown";
import RestoreButton from "@/components/momentum/archive/restore-button";

export const dynamic = "force-dynamic";

function isType(value: string): value is ProjectType {
  return value === "project" || value === "area";
}

export default async function ArchivedCharterPage({
  params,
}: {
  params: Promise<{ type: string; name: string }>;
}) {
  const { type, name } = await params;
  if (!isType(type)) notFound();

  const charter = await getArchived(type, name).catch(() => null);
  if (!charter) notFound();

  const [tasks, detailIds] = await Promise.all([
    listArchivedTasks(type, name),
    listArchivedDetailIds(type, name).then((ids) => new Set(ids)),
  ]);
  const tone = hueOf(charter.archivedAs);
  const done = tasks.filter((t) => t.done).length;

  return (
    <div className="mx-auto max-w-[720px] px-[36px] pt-[34px] pb-[90px]">
      <Link
        href="/done"
        className="mb-[26px] inline-block font-mono text-[9.5px] tracking-[0.1em] text-faint transition-colors hover:text-ink"
      >
        ← DONE
      </Link>

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
        <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: tone.color }} />
        <Mono className="text-[9px] tracking-[0.1em] text-faint">
          ARCHIVED {type === "project" ? "PROJECT" : "AREA"} · {shortDate(charter.archivedAt)}
        </Mono>
      </div>

      <h1 className="m-0 mb-[18px] text-[24px] font-semibold leading-[1.2] tracking-[-0.03em]">
        {charter.name}
      </h1>

      <div className="mb-6">
        <RestoreButton type={type} archivedAs={charter.archivedAs} />
      </div>

      {charter.why.trim() && (
        <div className="mb-6">
          <Mono className="mb-2.5 block text-[9px] tracking-[0.1em] text-faint">WHY</Mono>
          <div className="rounded-[13px] bg-soft p-[13px]">
            <Markdown>{charter.why.trim()}</Markdown>
          </div>
        </div>
      )}

      <Rule label={tasks.length > 0 ? `TASKS · ${done}/${tasks.length} DONE` : "TASKS"} />
      {tasks.length === 0 ? (
        <p className="m-0 text-[13px] text-faint">This charter had no tasks.</p>
      ) : (
        <div className="flex flex-col">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-[11px] border-b border-edge2 py-2.5"
              style={{ paddingLeft: `${(t.id.split(".").length - 1) * 14}px` }}
            >
              <Mono className="text-[9.5px] text-faint">{t.id}</Mono>
              <span className={`text-[13.5px] ${t.done ? "text-faint line-through" : "text-ink"}`}>
                {t.title}
                {detailIds.has(t.id) ? (
                  <Mono className="ml-2 text-[9px] tracking-[0.08em] text-faint">PLAN</Mono>
                ) : null}
              </span>
              <Mono className="text-[9px] text-faint">
                {t.done ? (t.doneDate ? shortDate(t.doneDate) : "DONE") : t.size}
              </Mono>
            </div>
          ))}
        </div>
      )}

      <Mono className="mt-6 block text-[9.5px] leading-[1.6] tracking-[0.08em] text-faint">
        NOTHING HERE WAS DELETED. RESTORING PUTS THE CHARTER, ITS TASKS AND ITS PLANS BACK.
      </Mono>
    </div>
  );
}
