import Link from "next/link";
import { notFound } from "next/navigation";
import type { ProjectStatus } from "@/lib/core/types";
import { getCharter, listTasks } from "@/lib/core/store";
import TaskBoard from "@/components/task-board";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  paused: "bg-amber-500/15 text-amber-400",
  done: "bg-neutral-500/15 text-neutral-400",
  abandoned: "bg-rose-500/15 text-rose-400",
};

export default async function AreaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const charter = await getCharter("area", slug).catch(() => null);
  if (!charter) notFound();
  const tasks = await listTasks("area", slug);

  return (
    <div>
      <Link href="/areas" className="text-sm text-neutral-400 hover:text-neutral-100">
        ← Areas
      </Link>

      <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-neutral-100">{charter.name}</h1>
          <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[charter.status]}`}>
            {charter.status}
          </span>
        </div>

        <section className="mt-4">
          <h2 className="text-sm font-semibold text-neutral-300">Why</h2>
          <blockquote className="mt-1 border-l-2 border-neutral-700 pl-3 text-sm text-neutral-400">
            {charter.why}
          </blockquote>
        </section>

        {charter.mvp && (
          <section className="mt-4">
            <h2 className="text-sm font-semibold text-neutral-300">MVP scope</h2>
            {charter.mvpScope.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-500">None defined.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {charter.mvpScope.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-neutral-400">
                    <input type="checkbox" checked readOnly className="accent-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="mt-4">
          <h2 className="text-sm font-semibold text-neutral-300">Parking lot</h2>
          {charter.parkingLot.length === 0 ? (
            <p className="mt-1 text-sm text-neutral-500">Empty.</p>
          ) : (
            <ul className="mt-1 list-disc pl-5 text-sm text-neutral-400">
              {charter.parkingLot.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <TaskBoard type="area" slug={slug} tasks={tasks} />
    </div>
  );
}
