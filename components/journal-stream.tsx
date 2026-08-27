import type { JournalEntry } from "@/lib/core/journal";

export interface StreamEntry extends JournalEntry {
  date: string;
}

export default function JournalStream({ entries }: { entries: StreamEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-neutral-500">No journal entries yet.</p>;
  }
  return (
    <ul className="space-y-1 text-sm">
      {entries.map((e, i) => (
        <li key={`${e.date}-${e.time}-${i}`} className="flex gap-2 text-neutral-300">
          <span className="shrink-0 font-mono text-xs text-neutral-500">
            {e.date} {e.time}
          </span>
          <span className="shrink-0 rounded bg-neutral-800 px-1.5 text-xs text-neutral-400">
            {e.scope}
          </span>
          <span className="min-w-0 flex-1">{e.message}</span>
        </li>
      ))}
    </ul>
  );
}
