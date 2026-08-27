import type { Insights } from "@/lib/core/insights";

export default function StalledList({ rows }: { rows: Insights["stalled"] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-emerald-400">
        Nothing stalled — all active projects have recent activity.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.slug}
          className="flex items-center justify-between rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2 text-sm"
        >
          <span className="font-medium text-amber-300">{r.name}</span>
          <span className="text-xs text-amber-400/80">
            no activity for {r.days} days
          </span>
        </li>
      ))}
    </ul>
  );
}
