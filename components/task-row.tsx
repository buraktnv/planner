"use client";

import type { Task, TaskSize } from "@/lib/core/types";

const SIZE_STYLES: Record<TaskSize, string> = {
  S: "bg-emerald-500/15 text-emerald-400",
  M: "bg-amber-500/15 text-amber-400",
  L: "bg-rose-500/15 text-rose-400",
};

function depth(id: string): number {
  return id.split(".").length - 1;
}

export default function TaskRow({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const indent = depth(task.id) * 12;
  return (
    <div
      className="flex items-center gap-2 rounded bg-neutral-800/50 p-2"
      style={{ marginLeft: indent }}
    >
      <input
        type="checkbox"
        checked={task.done}
        onChange={onToggle}
        className="accent-emerald-500"
      />
      <span className="font-mono text-xs text-neutral-500">{task.id}</span>
      <span className={`rounded px-1.5 py-0.5 text-xs ${SIZE_STYLES[task.size]}`}>
        {task.size}
      </span>
      <span
        className={`flex-1 text-sm ${
          task.done ? "text-neutral-500 line-through" : "text-neutral-200"
        }`}
      >
        {task.title}
      </span>
      <div className="flex gap-1">
        {task.est && (
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
            est {task.est}
          </span>
        )}
        {task.due && (
          <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
            due {task.due}
          </span>
        )}
      </div>
    </div>
  );
}
