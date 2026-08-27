"use client";

import { useState } from "react";

interface ToolPartLike {
  type: string;
  toolName?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}

function summarize(output: unknown): string {
  if (output == null) return "(no output)";
  if (typeof output === "string") return output;
  if (typeof output === "object") {
    const id = (output as { id?: unknown }).id;
    if (typeof id === "string") return `result: ${id}`;
    const msg = (output as { message?: unknown }).message;
    if (typeof msg === "string") return msg;
  }
  const s = JSON.stringify(output);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

export default function ToolCard({ part }: { part: ToolPartLike }) {
  const [open, setOpen] = useState(false);
  const name = part.toolName ?? part.type.replace(/^tool-/, "");
  const done = part.state === "output-available" || part.state === "output-error";

  return (
    <div className="my-2 rounded-lg border border-neutral-800 bg-neutral-900/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-800/50"
      >
        <span className="font-medium text-emerald-400">Tool: {name}</span>
        <span className="truncate text-xs text-neutral-400">
          {done ? summarize(part.output) : "running…"}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-neutral-800 px-3 py-3 text-xs">
          <div>
            <div className="mb-1 font-medium text-neutral-500">Input</div>
            <pre className="overflow-x-auto rounded bg-neutral-950 p-2 text-neutral-300">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          </div>
          <div>
            <div className="mb-1 font-medium text-neutral-500">Output</div>
            <pre className="overflow-x-auto rounded bg-neutral-950 p-2 text-neutral-300">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
