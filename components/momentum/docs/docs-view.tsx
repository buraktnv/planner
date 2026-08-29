"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Empty, Mono, PageTitle, Panel } from "../primitives";
import NoteDetail from "../knowledge/note-detail";
import NoteEditor, { type EditorValue } from "../knowledge/note-editor";
import { Chip, RowCard } from "../knowledge/note-row";
import type { DocsModel } from "@/lib/view/docs";
import type { KnowledgeHit, KnowledgeNote } from "@/lib/core/types";

const STARTERS = [
  ["architecture", "How it is put together — the pieces and how they talk."],
  ["protocol", "The interfaces: commands, events, payloads, ports."],
  ["decision", "A choice you made and why, so it is not re-argued."],
  ["runbook", "How to run, deploy, and recover it when it breaks."],
];

function editorFor(note: KnowledgeNote): EditorValue {
  return {
    id: note.id,
    title: note.title,
    summary: note.summary,
    body: note.body,
    scope: note.scope.join(", "),
    tags: note.tags.join(", "),
    source: note.source ?? "",
  };
}

export default function DocsView({ model, backHref }: { model: DocsModel; backHref: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [result, setResult] = useState<{ key: string; hits: KnowledgeHit[] } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorValue | null>(null);

  const trimmed = query.trim();
  const queryKey = useMemo(
    () => JSON.stringify([trimmed, model.scopeKey, [...tags].sort()]),
    [trimmed, model.scopeKey, tags],
  );

  useEffect(() => {
    if (!trimmed) return;
    let live = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed, limit: "40", scope: model.scopeKey });
      if (tags.length) params.set("tags", tags.join(","));
      fetch(`/api/knowledge?${params.toString()}`)
        .then(async (res) => (await res.json()) as { hits?: KnowledgeHit[] })
        .then((data) => {
          if (live) setResult({ key: queryKey, hits: data.hits ?? [] });
        })
        .catch(() => {
          if (live) setResult({ key: queryKey, hits: [] });
        });
    }, 220);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [trimmed, model.scopeKey, tags, queryKey]);

  const hits = trimmed && result?.key === queryKey ? result.hits : null;
  const searching = trimmed !== "";

  const groups = useMemo(() => {
    if (!tags.length) return model.groups;
    return model.groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => tags.every((t) => r.tags.includes(t))) }))
      .filter((g) => g.rows.length > 0);
  }, [model.groups, tags]);

  const shown = groups.reduce((n, g) => n + g.rows.length, 0);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const newDoc = () =>
    setEditor({ title: "", summary: "", body: "", scope: model.scopeKey, tags: "", source: "" });

  const afterSave = useCallback(() => {
    setEditor(null);
    setOpenId(null);
    setResult(null);
    setQuery("");
    router.refresh();
  }, [router]);

  return (
    <>
      <div className="mb-3.5 flex items-center gap-3">
        <Link
          href={backHref}
          className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          ← {model.charterName.toUpperCase()}
        </Link>
        <div className="flex-1" />
        <Link
          href={`/knowledge?scope=${encodeURIComponent(model.scopeKey)}`}
          className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          ALL KNOWLEDGE →
        </Link>
      </div>

      <PageTitle title={`${model.charterName} docs`} meta={`${model.total} DOCS`}>
        <button
          type="button"
          onClick={newDoc}
          className="flex items-center gap-[7px] rounded-[11px] border border-edge bg-surf px-[14px] py-[9px] text-[12.5px] font-medium transition-colors hover:border-ink"
        >
          <span className="font-mono text-[13px]">+</span>
          Doc
        </button>
      </PageTitle>

      {model.total > 0 ? (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${model.charterName} docs — titles, tags, summaries and bodies`}
          className="mb-3 w-full rounded-[12px] border border-edge bg-surf px-[14px] py-[11px] text-[13px] outline-none transition-colors focus:border-ink"
        />
      ) : null}

      {model.tags.length ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {model.tags.map((t) => (
            <Chip
              key={t.tag}
              label={t.tag}
              count={t.count}
              active={tags.includes(t.tag)}
              onClick={() => toggleTag(t.tag)}
            />
          ))}
          {tags.length ? (
            <button
              type="button"
              onClick={() => setTags([])}
              className="font-mono text-[9.5px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
            >
              CLEAR
            </button>
          ) : null}
        </div>
      ) : null}

      {model.total === 0 ? (
        <Panel dashed className="px-[18px] py-[20px]">
          <div className="mb-3.5 text-[13px] leading-[1.6] text-dim">
            Nothing written down yet. Four docs usually carry a project:
          </div>
          <div className="flex flex-col gap-2.5">
            {STARTERS.map(([tag, what]) => (
              <div key={tag} className="flex items-baseline gap-2.5">
                <Mono className="w-[86px] shrink-0 text-[9px] tracking-[0.1em] text-faint">
                  {tag.toUpperCase()}
                </Mono>
                <span className="text-[12.5px] leading-[1.5] text-dim">{what}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={newDoc}
            className="mt-4 rounded-[11px] bg-ink px-[15px] py-[9px] text-[12.5px] font-medium text-bg"
          >
            Write the first one
          </button>
        </Panel>
      ) : null}

      {searching ? (
        <>
          <div className="mb-2.5 flex items-center gap-2.5">
            <Mono className="text-[9.5px] tracking-[0.16em] text-faint">
              RANKED BY RELEVANCE · {hits?.length ?? 0}
            </Mono>
            <div className="h-px flex-1 bg-edge" />
          </div>
          <div className="flex flex-col gap-2">
            {!hits ? <Empty>Searching…</Empty> : null}
            {hits?.map((h) => (
              <RowCard
                key={h.id}
                id={h.id}
                title={h.title}
                summary={h.summary}
                snippet={h.snippet}
                scope={h.scope}
                tags={h.tags}
                updated={h.updated}
                onOpen={() => setOpenId(h.id)}
              />
            ))}
            {hits && hits.length === 0 ? (
              <Panel dashed className="px-[15px] py-[18px]">
                <Empty>Nothing in {model.charterName} matches “{trimmed}”.</Empty>
              </Panel>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.tag}>
              <div className="mb-2.5 flex items-center gap-2.5">
                <Mono className="text-[9.5px] tracking-[0.16em] text-faint">
                  {g.label.toUpperCase()} · {g.rows.length}
                </Mono>
                <div className="h-px flex-1 bg-edge" />
              </div>
              <div className="flex flex-col gap-2">
                {g.rows.map((r) => (
                  <RowCard
                    key={r.id}
                    id={r.id}
                    title={r.title}
                    summary={r.summary}
                    scope={r.scope.map((s) => s.key)}
                    tags={r.tags}
                    updated={r.updated}
                    onOpen={() => setOpenId(r.id)}
                  />
                ))}
              </div>
            </div>
          ))}
          {model.total > 0 && shown === 0 ? (
            <Panel dashed className="px-[15px] py-[18px]">
              <Empty>Nothing matches these tags.</Empty>
            </Panel>
          ) : null}
        </div>
      )}

      {openId && !editor ? (
        <NoteDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onEdit={(n) => setEditor(editorFor(n))}
          onOpen={(id) => setOpenId(id)}
        />
      ) : null}

      {editor ? (
        <NoteEditor
          initial={editor}
          lockedScope={model.scopeKey}
          onClose={() => setEditor(null)}
          onSaved={afterSave}
        />
      ) : null}
    </>
  );
}
