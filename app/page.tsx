import Link from "next/link";
import { getNextActions } from "@/lib/core/next";
import { readJournal } from "@/lib/core/journal";
import { listCharters } from "@/lib/core/store";
import type { ProjectType } from "@/lib/core/types";
import CompleteTask from "@/components/complete-task";
import QuickCapture from "@/components/quick-capture";
import JournalStream, { type StreamEntry } from "@/components/journal-stream";

export const dynamic = "force-dynamic";

function today(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

function isOverdue(due?: string): boolean {
  if (!due) return false;
  return due < today();
}

function sizeBadge(size: string) {
  const cls =
    size === "S"
      ? "bg-sky-600/20 text-sky-300"
      : size === "M"
        ? "bg-amber-600/20 text-amber-300"
        : "bg-rose-600/20 text-rose-300";
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>{size}</span>
  );
}

export default async function Home() {
  const [actions, charters, journalDays] = await Promise.all([
    getNextActions(10),
    listCharters(),
    readJournal(30),
  ]);

  const entries: StreamEntry[] = journalDays
    .flatMap((d) => d.entries.map((e) => ({ ...e, date: d.date })))
    .slice(0, 20);

  const charterOptions = charters.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type as ProjectType,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-100">Today</h1>
        <p className="mt-1 text-sm text-neutral-400">What to do next, and why.</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Next actions
        </h2>
        {actions.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing open. Capture something below.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {actions.map(({ task, charter }) => {
              const href = `/${charter.type}s/${charter.id}`;
              const overdue = isOverdue(task.due);
              return (
                <li key={`${charter.id}/${task.id}`} className="flex items-center gap-3 p-3">
                  <CompleteTask type={charter.type} slug={charter.id} taskId={task.id} />
                  <span className="min-w-0 flex-1 truncate text-neutral-100">{task.title}</span>
                  <Link
                    href={href}
                    className="shrink-0 rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-700"
                  >
                    {charter.name}
                  </Link>
                  {sizeBadge(task.size)}
                  {task.due && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${
                        overdue ? "bg-rose-600/30 text-rose-300" : "bg-neutral-800 text-neutral-400"
                      }`}
                    >
                      {overdue ? "overdue " : "due "}
                      {task.due}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Quick capture
        </h2>
        <QuickCapture charters={charterOptions} />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Recent journal
        </h2>
        <JournalStream entries={entries} />
      </section>
    </div>
  );
}
