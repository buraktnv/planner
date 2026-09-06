"use client";

import type { MentionItem } from "@/lib/view/mentions";
import { Mono } from "../primitives";

const KIND_LABEL: Record<MentionItem["kind"], string> = {
  note: "NOTE",
  task: "TASK",
  charter: "CHARTER",
  command: "COMMAND",
};

/**
 * The list that opens over the composer while an `@word` or `/word` is being
 * typed. Presentational: the rail owns the query, the selection and what
 * happens on pick, so the keyboard handling lives beside the input it applies
 * to rather than being split across two files.
 */
export default function MentionPicker({
  items,
  selected,
  onPick,
  onHover,
}: {
  items: MentionItem[];
  selected: number;
  onPick: (item: MentionItem) => void;
  onHover: (index: number) => void;
}) {
  if (!items.length) return null;
  return (
    <div
      role="listbox"
      className="animate-pop absolute inset-x-0 bottom-full z-30 mb-1.5 max-h-[260px] overflow-y-auto rounded-[14px] border border-edge bg-surf p-1.5 shadow-[0_14px_34px_rgba(46,42,38,.14)]"
    >
      {items.map((item, i) => (
        <button
          key={item.token}
          type="button"
          role="option"
          aria-selected={i === selected}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            // Before the input loses focus, or the caret position is gone.
            e.preventDefault();
            onPick(item);
          }}
          className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-left transition-colors ${
            i === selected ? "bg-soft" : "hover:bg-soft"
          }`}
        >
          <Mono className="w-[54px] shrink-0 text-[7.5px] tracking-[0.12em] text-faint">
            {KIND_LABEL[item.kind]}
          </Mono>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{item.label}</span>
          <Mono className="shrink-0 truncate text-[8.5px] text-faint">{item.hint}</Mono>
        </button>
      ))}
    </div>
  );
}
