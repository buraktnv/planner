import { listCharters, listTasks } from "@/lib/core/store";
import CharterCard from "@/components/charter-card";
import NewAreaForm from "./new-area-form";

export const dynamic = "force-dynamic";

export default async function AreasPage() {
  const charters = await listCharters("area");
  const rows = await Promise.all(
    charters.map(async (charter) => {
      const tasks = await listTasks("area", charter.id);
      const total = tasks.length;
      const done = tasks.filter((t) => t.done).length;
      return { charter, total, done };
    }),
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-neutral-100">Areas</h1>
      <NewAreaForm />
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-400">No areas yet. Create one above.</p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ charter, total, done }) => (
            <CharterCard
              key={charter.id}
              type="area"
              charter={charter}
              total={total}
              done={done}
            />
          ))}
        </div>
      )}
    </div>
  );
}
