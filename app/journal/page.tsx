import { readJournal } from "@/lib/core/journal";

export const dynamic = "force-dynamic";

const MAX_DAYS = 365;

function scopeClass(scope: string): string {
  const s = scope.toLowerCase();
  if (s === "chat") return "bg-emerald-600/20 text-emerald-300";
  if (s === "life" || s === "journal") return "bg-sky-600/20 text-sky-300";
  return "bg-neutral-800 text-neutral-300";
}

function ScopeChip({ scope }: { scope: string }) {
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${scopeClass(scope)}`}>
      {scope}
    </span>
  );
}

function parseDays(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(Math.floor(n), MAX_DAYS);
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const journalDays = await readJournal(days);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-100">Journal</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Last {days} {days === 1 ? "day" : "days"}
            {days < MAX_DAYS && (
              <a className="ml-2 text-emerald-400 hover:underline" href={`?days=${Math.min(days * 2, MAX_DAYS)}`}>
                load more
              </a>
            )}
          </p>
        </div>
      </div>

      {journalDays.length === 0 ? (
        <p className="text-sm text-neutral-500">No journal entries yet.</p>
      ) : (
        <div className="space-y-8">
          {journalDays.map((day) => (
            <section key={day.date}>
              <h2 className="mb-3 sticky top-0 bg-neutral-950/90 py-1 text-sm font-medium uppercase tracking-wide text-neutral-500">
                {day.date}
              </h2>
              <ul className="space-y-1 text-sm">
                {day.entries.map((e, i) => (
                  <li key={`${e.time}-${i}`} className="flex items-baseline gap-3">
                    <span className="shrink-0 font-mono text-xs text-neutral-500">{e.time}</span>
                    <ScopeChip scope={e.scope} />
                    <span className="min-w-0 flex-1 text-neutral-200">{e.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
