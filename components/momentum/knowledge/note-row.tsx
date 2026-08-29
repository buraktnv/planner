"use client";

import Link from "next/link";
import { Mono } from "../primitives";
import { scopeChip } from "@/lib/view/knowledge";

export function Chip({
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

export function RowCard({
  id,
  title,
  summary,
  snippet,
  scope,
  tags,
  updated,
  href,
  hideScope,
  hideTag,
}: {
  id: string;
  title: string;
  summary: string;
  snippet?: string;
  scope: string[];
  tags: string[];
  updated: string;
  href: string;
  /** Scope keys already implied by the page, so repeating them is noise. */
  hideScope?: string[];
  /** A tag already stated by the group heading above this row. */
  hideTag?: string;
}) {
  const shownScope = hideScope ? scope.filter((s) => !hideScope.includes(s)) : scope;
  const shownTags = hideTag ? tags.filter((t) => t !== hideTag) : tags;
  const meta = shownScope.length > 0 || shownTags.length > 0;
  return (
    <Link
      href={href}
      className="block w-full rounded-[14px] border border-edge bg-surf px-[15px] py-[11px] text-left transition-colors hover:border-ink"
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
      {meta ? (
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {shownScope.map((key) => {
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
        {shownTags.map((tag) => (
          <Mono
            key={tag}
            className="rounded-[5px] bg-soft px-[6px] py-[2px] text-[8px] tracking-[0.08em] text-dim"
          >
            {tag}
          </Mono>
        ))}
      </div>
      ) : null}
    </Link>
  );
}
