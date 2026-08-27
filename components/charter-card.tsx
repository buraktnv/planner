import Link from "next/link";
import type { Charter, ProjectStatus } from "@/lib/core/types";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  paused: "bg-amber-500/15 text-amber-400",
  done: "bg-neutral-500/15 text-neutral-400",
  abandoned: "bg-rose-500/15 text-rose-400",
};

export default function CharterCard({
  charter,
  done,
  total,
}: {
  charter: Charter;
  done: number;
  total: number;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <Link
      href={`/projects/${charter.id}`}
      className="block rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition-colors hover:border-neutral-700"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium text-neutral-100">{charter.name}</h2>
        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLES[charter.status]}`}>
          {charter.status}
        </span>
      </div>
      {charter.mvp && (
        <p className="mt-1 line-clamp-2 text-sm text-neutral-400">{charter.mvp}</p>
      )}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-neutral-500">
          <span>{pct}% done</span>
          <span>
            {done}/{total} tasks
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded bg-neutral-800">
          <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="mt-3 text-xs text-neutral-500">Priority {charter.priority}</div>
    </Link>
  );
}
