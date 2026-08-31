"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DoneModel } from "@/lib/view/done";
import type { ArchiveModel } from "@/lib/view/archive";
import type { CardModel } from "@/lib/view/workspace";
import { shortDate } from "@/lib/ui/momentum";
import { Empty, Mono, Rule, Tick } from "../primitives";
import { useMomentum } from "../context";

export default function DoneView({
  model,
  archive,
  archivedCount,
  includeArchived,
}: {
  model: DoneModel;
  archive: ArchiveModel;
  archivedCount: number;
  includeArchived: boolean;
}) {
  const { openCard } = useMomentum();
  const router = useRouter();
  const [slug, setSlug] = useState<string | null>(null);

  const toggleArchived = () => {
    router.push(includeArchived ? "/done" : "/done?archived=1");
  };

  const buckets = useMemo(
    () =>
      model.buckets
        .map((b) => ({ ...b, cards: slug ? b.cards.filter((c) => c.slug === slug) : b.cards }))
        .filter((b) => b.cards.length > 0),
    [model.buckets, slug],
  );

  const rowClass =
    "grid w-full grid-cols-[16px_1fr_auto] items-center gap-3 border-b border-edge2 py-3 text-left transition-colors hover:bg-soft";

  const rowBody = (card: CardModel) => (
    <>
      <Tick done color={card.color} size={15} />
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] text-dim">{card.title}</span>
        <Mono className="mt-1 flex items-center gap-1.5 text-[9.5px] tracking-[0.08em] text-faint">
          <span className="h-[6px] w-[6px] rounded-[2px]" style={{ background: card.color }} />
          {card.charterName.toUpperCase()}
          {card.archived ? " · ARCHIVED" : ""}
          {card.hasDetail ? " · DESCRIPTION" : ""}
          {card.subTotal > 0 ? ` · ${card.subDone}/${card.subTotal}` : ""}
        </Mono>
      </span>
      <Mono className="text-[9.5px] text-faint">
        {card.doneDate ? shortDate(card.doneDate) : "—"}
      </Mono>
    </>
  );

  /** An archived task has no live page — its slug names a charter in archive/. */
  const row = (card: CardModel) =>
    card.archived ? (
      <Link
        key={card.key}
        href={`/archive/${card.type}/${card.slug}`}
        className={rowClass}
      >
        {rowBody(card)}
      </Link>
    ) : (
      <button key={card.key} type="button" onClick={() => openCard(card)} className={rowClass}>
        {rowBody(card)}
      </button>
    );

  const archivedSection = archive.total === 0 ? null : (
    <div className="mt-10">
      <Rule label={`ARCHIVED · ${archive.total}`} />
      <div className="flex flex-col">
        {[...archive.projects, ...archive.areas].map((r) => (
          <Link
            key={r.key}
            href={`/archive/${r.type}/${r.archivedAs}`}
            className="grid grid-cols-[16px_1fr_auto] items-center gap-3 border-b border-edge2 py-3 transition-colors hover:bg-soft"
          >
            <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: r.color }} />
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] text-dim">{r.name}</span>
              <Mono className="mt-1 block text-[9.5px] tracking-[0.08em] text-faint">
                {r.type === "project" ? "PROJECT" : "AREA"}
                {r.total > 0 ? ` · ${r.done}/${r.total} DONE` : " · NO TASKS"}
              </Mono>
            </span>
            <Mono className="text-[9.5px] text-faint">{shortDate(r.archivedAt)}</Mono>
          </Link>
        ))}
      </div>
      <Mono className="mt-3 block text-[9.5px] tracking-[0.08em] text-faint">
        NOTHING HERE WAS DELETED — OPEN ONE TO RESTORE IT
      </Mono>
    </div>
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-[7px]">
        <button
          type="button"
          onClick={() => setSlug(null)}
          className={`rounded-lg border px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em] ${
            slug === null ? "border-ink text-ink" : "border-edge text-faint hover:text-dim"
          }`}
        >
          ALL {model.total}
        </button>
        {model.charters.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => setSlug(c.slug === slug ? null : c.slug)}
            className="rounded-lg border px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em]"
            style={{
              color: slug === c.slug ? "#ffffff" : "var(--color-dim)",
              background: slug === c.slug ? c.color : "transparent",
              borderColor: slug === c.slug ? c.color : "var(--color-edge)",
            }}
          >
            {c.name.toUpperCase()} {c.count}
          </button>
        ))}
        <div className="flex-1" />
        {archivedCount > 0 && (
          <button
            type="button"
            onClick={toggleArchived}
            className={`rounded-lg border px-2.5 py-[5px] font-mono text-[9px] tracking-[0.08em] ${
              includeArchived ? "border-ink text-ink" : "border-edge text-faint hover:text-dim"
            }`}
          >
            {includeArchived ? "✓ " : ""}ARCHIVED {archivedCount}
          </button>
        )}
      </div>

      {buckets.length === 0 ? (
        <Empty>
          Nothing finished here yet. Completed tasks collect on this page as you tick them off.
        </Empty>
      ) : (
        buckets.map((b) => (
          <div key={b.key} className="mb-8">
            <Rule label={`${b.label} · ${b.cards.length}`} />
            <div className="flex flex-col">{b.cards.map(row)}</div>
          </div>
        ))
      )}

      {archivedSection}
    </>
  );
}
