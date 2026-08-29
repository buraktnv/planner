"use client";

import { useState } from "react";
import type { ArchiveModel, ArchivedRow } from "@/lib/view/archive";
import { shortDate } from "@/lib/ui/momentum";
import { Empty, Mono, Rule } from "../primitives";
import ArchiveDetail from "./archive-detail";

function Row({ row, onOpen }: { row: ArchivedRow; onOpen: (row: ArchivedRow) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row)}
      className="grid w-full grid-cols-[9px_1fr_auto] items-center gap-3 border-b border-edge2 py-3.5 text-left transition-colors hover:bg-soft"
    >
      <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: row.color }} />
      <span className="min-w-0">
        <span className="block truncate text-[14px] text-ink">{row.name}</span>
        <Mono className="mt-1 block text-[9.5px] tracking-[0.08em] text-faint">
          ARCHIVED {shortDate(row.archivedAt)}
          {row.total > 0 ? ` · ${row.done}/${row.total} DONE` : " · NO TASKS"}
        </Mono>
      </span>
      <span className="text-[13px] leading-none text-faint">›</span>
    </button>
  );
}

export default function ArchiveView({ model }: { model: ArchiveModel }) {
  const [open, setOpen] = useState<ArchivedRow | null>(null);

  if (model.total === 0) {
    return <Empty>Nothing archived yet. Retiring a project or area moves it here.</Empty>;
  }

  return (
    <>
      {model.projects.length > 0 && (
        <>
          <Rule label="PROJECTS" />
          <div className="mb-8 flex flex-col">
            {model.projects.map((r) => (
              <Row key={r.key} row={r} onOpen={setOpen} />
            ))}
          </div>
        </>
      )}

      {model.areas.length > 0 && (
        <>
          <Rule label="AREAS" />
          <div className="mb-8 flex flex-col">
            {model.areas.map((r) => (
              <Row key={r.key} row={r} onOpen={setOpen} />
            ))}
          </div>
        </>
      )}

      {open && <ArchiveDetail key={open.key} row={open} onClose={() => setOpen(null)} />}
    </>
  );
}
