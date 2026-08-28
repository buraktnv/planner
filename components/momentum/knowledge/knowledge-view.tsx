"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Empty, Mono, PageTitle, Panel } from "../primitives";
import NoteDetail from "./note-detail";
import NoteEditor, { type EditorValue } from "./note-editor";
import type { KnowledgeModel, KnowledgeRow } from "@/lib/view/knowledge";
import type { KnowledgeHit, KnowledgeNote } from "@/lib/core/types";
import { scopeChip } from "@/lib/view/knowledge";

const EMPTY_EDITOR: EditorValue = {
  title: "",
  summary: "",
  body: "",
  scope: "",
  tags: "",
  source: "",
};

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

function Chip({
  label,
  count,
  active,
  color,
  tint,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color?: string;
  tint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-[8px] border px-[9px] py-[5px] text-[11.5px] transition-colors ${
        active ? "border-ink" : "border-edge hover:border-dim"
      }`}
      style={active && tint ? { background: tint } : undefined}
    >
      {color ? (
        <span className="h-[6px] w-[6px] shrink-0 rounded-full" style={{ background: color }} />
      ) : null}
      <span className={active ? "text-ink" : "text-dim"}>{label}</span>
      <Mono className="text-[9px] tracking-[0.08em] text-faint">{count}</Mono>
    </button>
  );
}

function RowCard({
  id,
  title,
  summary,
  snippet,
  scope,
  tags,
  updated,
  onOpen,
}: {
  id: string;
  title: string;
  summary: string;
  snippet?: string;
  scope: string[];
  tags: string[];
  updated: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[14px] border border-edge bg-surf px-[15px] py-[13px] text-left transition-colors hover:border-ink"
    >
      <div className="flex items-baseline gap-2.5">
        <Mono className="text-[9.5px] tracking-[0.1em] text-faint">{id}</Mono>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-[-0.01em]">
          {title}
        </span>
        <Mono className="shrink-0 text-[9px] tracking-[0.1em] text-faint">{updated}</Mono>
      </div>
      <p className="mt-1.5 mb-0 text-[12.5px] leading-[1.5] text-dim">{summary}</p>
      {snippet && snippet !== summary ? (
        <p className="mt-1.5 mb-0 border-l-2 border-edge pl-2.5 text-[12px] leading-[1.5] text-faint">
          {snippet}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {scope.map((key) => {
          const chip = scopeChip(key);
          return (
            <Mono
              key={key}
              className="rounded-[5px] px-[6px] py-[2px] text-[8px] tracking-[0.08em]"
              style={{ color: chip.color, background: chip.tint }}
            >
              {chip.label.toUpperCase()}
            </Mono>
          );
        })}
        {tags.map((tag) => (
          <Mono
            key={tag}
            className="rounded-[5px] bg-soft px-[6px] py-[2px] text-[8px] tracking-[0.08em] text-dim"
          >
            {tag}
          </Mono>
        ))}
      </div>
    </button>
  );
}

export default function KnowledgeView({ model }: { model: KnowledgeModel }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [result, setResult] = useState<{ key: string; hits: KnowledgeHit[] } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorValue | null>(null);

  const trimmed = query.trim();
  const queryKey = useMemo(
    () => JSON.stringify([trimmed, scope, [...tags].sort()]),
    [trimmed, scope, tags],
  );

  useEffect(() => {
    if (!trimmed) return;
    let live = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: trimmed, limit: "40" });
      if (scope) params.set("scope", scope);
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
  }, [trimmed, scope, tags, queryKey]);

  const hits = trimmed && result?.key === queryKey ? result.hits : null;
  const searching = trimmed !== "" && hits === null;

  const browsed = useMemo(() => {
    return model.rows.filter((r: KnowledgeRow) => {
      if (scope && !r.scope.some((s) => s.key === scope)) return false;
      if (tags.length && !tags.every((t) => r.tags.includes(t))) return false;
      return true;
    });
  }, [model.rows, scope, tags]);

  const toggleTag = (tag: string) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  const afterSave = useCallback(() => {
    setEditor(null);
    setOpenId(null);
    setResult(null);
    setQuery("");
    router.refresh();
  }, [router]);

  const searching_ = trimmed !== "";
  const count = searching_ ? (hits?.length ?? 0) : browsed.length;

  return (
    <>
      <PageTitle title="Knowledge" meta={`${model.total} NOTES`}>
        <button
          type="button"
          onClick={() => setEditor(EMPTY_EDITOR)}
          className="flex items-center gap-[7px] rounded-[11px] border border-edge bg-surf px-[14px] py-[9px] text-[12.5px] font-medium transition-colors hover:border-ink"
        >
          <span className="font-mono text-[13px]">+</span>
          Note
        </button>
      </PageTitle>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search everything — titles, tags, summaries and bodies"
        className="mb-3 w-full rounded-[12px] border border-edge bg-surf px-[14px] py-[11px] text-[13px] outline-none transition-colors focus:border-ink"
      />

      {model.scopes.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {model.scopes.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              count={s.count}
              color={s.color}
              tint={s.tint}
              active={scope === s.key}
              onClick={() => setScope(scope === s.key ? null : s.key)}
            />
          ))}
        </div>
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
        </div>
      ) : null}

      <div className="mb-2.5 flex items-center gap-2.5">
        <Mono className="text-[9.5px] tracking-[0.16em] text-faint">
          {searching_ ? "RANKED BY RELEVANCE" : "NEWEST FIRST"} · {count}
        </Mono>
        <div className="h-px flex-1 bg-edge" />
        {scope !== null || tags.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setScope(null);
              setTags([]);
            }}
            className="font-mono text-[9.5px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
          >
            CLEAR FILTERS
          </button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {searching_ && searching && !hits ? <Empty>Searching…</Empty> : null}

        {searching_ && hits
          ? hits.map((h) => (
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
            ))
          : null}

        {!searching_
          ? browsed.map((r) => (
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
            ))
          : null}

        {count === 0 && !(searching_ && searching) ? (
          <Panel dashed className="px-[15px] py-[18px]">
            <Empty>
              {model.total === 0
                ? "No notes yet. File the first one — a conclusion you do not want to re-derive."
                : searching_
                  ? `Nothing matches “${trimmed}”.`
                  : "Nothing matches these filters."}
            </Empty>
          </Panel>
        ) : null}
      </div>

      {openId && !editor ? (
        <NoteDetail
          id={openId}
          onClose={() => setOpenId(null)}
          onEdit={(n) => setEditor(editorFor(n))}
          onOpen={(id) => setOpenId(id)}
        />
      ) : null}

      {editor ? (
        <NoteEditor initial={editor} onClose={() => setEditor(null)} onSaved={afterSave} />
      ) : null}
    </>
  );
}
