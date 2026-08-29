"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import NoteEditor, { type EditorValue } from "../knowledge/note-editor";
import type { KnowledgeNote } from "@/lib/core/types";

export default function DocEditButton({
  note,
  lockedScope,
}: {
  note: KnowledgeNote;
  lockedScope?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const initial: EditorValue = {
    id: note.id,
    title: note.title,
    summary: note.summary,
    body: note.body,
    scope: note.scope.join(", "),
    tags: note.tags.join(", "),
    source: note.source ?? "",
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-[10px] border border-edge bg-surf px-[12px] py-[7px] text-[12px] font-medium transition-colors hover:border-ink"
      >
        Edit
      </button>
      {open ? (
        <NoteEditor
          initial={initial}
          lockedScope={lockedScope}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
