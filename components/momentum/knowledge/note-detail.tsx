"use client";

import { useEffect, useState } from "react";
import Dialog from "../dialog";
import { Empty, Mono } from "../primitives";
import Markdown from "../markdown";
import { scopeChip } from "@/lib/view/knowledge";
import type { KnowledgeNote } from "@/lib/core/types";

interface NotePayload {
  note: KnowledgeNote;
  links: string[];
  backlinks: string[];
}

function LinkRow({ ids, label, onOpen }: { ids: string[]; label: string; onOpen: (id: string) => void }) {
  if (!ids.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Mono className="text-[9px] tracking-[0.14em] text-faint">{label}</Mono>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onOpen(id)}
          className="rounded-[6px] bg-soft px-[7px] py-[3px] font-mono text-[10px] tracking-[0.08em] text-dim transition-colors hover:text-ink"
        >
          {id}
        </button>
      ))}
    </div>
  );
}

export default function NoteDetail({
  id,
  onClose,
  onEdit,
  onOpen,
}: {
  id: string;
  onClose: () => void;
  onEdit: (note: KnowledgeNote) => void;
  onOpen: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ for: string; payload?: NotePayload; error?: string } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    fetch(`/api/knowledge/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("not found");
        return (await res.json()) as NotePayload;
      })
      .then((payload) => {
        if (live) setLoaded({ for: id, payload });
      })
      .catch(() => {
        if (live) setLoaded({ for: id, error: `Could not load ${id}.` });
      });
    return () => {
      live = false;
    };
  }, [id]);

  const current = loaded?.for === id ? loaded : null;
  const data = current?.payload ?? null;
  const error = current?.error ?? null;

  return (
    <Dialog label={`Note ${id}`} onClose={onClose} maxWidth={620}>
      {error ? <Empty>{error}</Empty> : null}
      {!data && !error ? <Empty>Loading {id}…</Empty> : null}

      {data ? (
        <>
          <div className="mb-1 flex items-center gap-2.5">
            <Mono className="text-[10px] tracking-[0.1em] text-faint">{data.note.id}</Mono>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => onEdit(data.note)}
              className="rounded-[10px] border border-edge bg-surf px-[12px] py-[7px] text-[12px] font-medium transition-colors hover:border-ink"
            >
              Edit
            </button>
          </div>

          <h2 className="m-0 text-[19px] font-semibold leading-[1.3] tracking-[-0.02em]">
            {data.note.title}
          </h2>

          <p className="mt-2 mb-0 text-[13.5px] leading-[1.55] text-dim">{data.note.summary}</p>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {data.note.scope.map((key) => {
              const chip = scopeChip(key);
              return (
                <Mono
                  key={key}
                  className="rounded-[5px] px-[7px] py-[3px] text-[8.5px] tracking-[0.08em]"
                  style={{ color: chip.color, background: chip.tint }}
                >
                  {chip.label.toUpperCase()}
                </Mono>
              );
            })}
            {data.note.tags.map((tag) => (
              <Mono
                key={tag}
                className="rounded-[5px] bg-soft px-[7px] py-[3px] text-[8.5px] tracking-[0.08em] text-dim"
              >
                {tag}
              </Mono>
            ))}
          </div>

          {data.note.body ? (
            <div className="mt-4 border-t border-edge pt-4">
              <Markdown>{data.note.body}</Markdown>
            </div>
          ) : (
            <div className="mt-4 border-t border-edge pt-4">
              <Empty>No body yet — the summary is all there is.</Empty>
            </div>
          )}

          <LinkRow ids={data.links} label="LINKS TO" onOpen={onOpen} />
          <LinkRow ids={data.backlinks} label="LINKED FROM" onOpen={onOpen} />

          <div className="mt-4 flex flex-wrap gap-3 border-t border-edge pt-3">
            <Mono className="text-[9px] tracking-[0.12em] text-faint">
              CREATED {data.note.created}
            </Mono>
            <Mono className="text-[9px] tracking-[0.12em] text-faint">
              UPDATED {data.note.updated}
            </Mono>
            {data.note.source ? (
              <Mono className="text-[9px] tracking-[0.12em] text-faint">
                SOURCE {data.note.source}
              </Mono>
            ) : null}
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
