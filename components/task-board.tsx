"use client";

import { useRouter } from "next/navigation";
import type { Task, TaskSize } from "@/lib/core/types";
import TaskRow from "./task-row";

const COLUMNS: { key: Task["section"]; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "in-progress", label: "In progress" },
  { key: "done", label: "Done" },
];

export default function TaskBoard({
  type,
  slug,
  tasks,
}: {
  type: "project" | "area";
  slug: string;
  tasks: Task[];
}) {
  const router = useRouter();

  async function toggle(task: Task) {
    await fetch(`/api/${type}/${slug}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: task.id, complete: !task.done }),
    });
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    const size = (data.get("size") as TaskSize) ?? "M";
    if (!title) return;
    await fetch(`/api/${type}/${slug}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, size }),
    });
    form.reset();
    router.refresh();
  }

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold text-neutral-100">Tasks</h2>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.section === col.key);
          return (
            <div key={col.key} className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-300">{col.label}</span>
                <span className="text-xs text-neutral-500">{colTasks.length}</span>
              </div>
              <div className="space-y-2">
                {colTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} />
                ))}
                {colTasks.length === 0 && (
                  <p className="text-xs text-neutral-600">No tasks.</p>
                )}
              </div>
              {col.key === "backlog" && (
                <form onSubmit={add} className="mt-3 space-y-2 border-t border-neutral-800 pt-3">
                  <input
                    name="title"
                    placeholder="New task…"
                    className="w-full rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      name="size"
                      defaultValue="M"
                      className="rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
                    >
                      <option value="S">S</option>
                      <option value="M">M</option>
                      <option value="L">L</option>
                    </select>
                    <button
                      type="submit"
                      className="rounded bg-emerald-600/20 px-3 py-1 text-sm text-emerald-400 hover:bg-emerald-600/30"
                    >
                      Add
                    </button>
                  </div>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
