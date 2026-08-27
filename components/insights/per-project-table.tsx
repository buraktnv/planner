import type { Insights } from "@/lib/core/insights";

export default function PerProjectTable({ rows }: { rows: Insights["perProject"] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">No projects or areas yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-900 text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2 text-right">Open</th>
            <th className="px-3 py-2 text-right">Done</th>
            <th className="px-3 py-2">Last activity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {rows.map((r) => (
            <tr key={r.slug} className="text-neutral-300">
              <td className="px-3 py-2 font-medium text-neutral-100">{r.name}</td>
              <td className="px-3 py-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    r.type === "project"
                      ? "bg-sky-600/20 text-sky-400"
                      : "bg-violet-600/20 text-violet-400"
                  }`}
                >
                  {r.type}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.open}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.doneTotal}</td>
              <td className="px-3 py-2 font-mono text-xs text-neutral-500">
                {r.lastActivity ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
