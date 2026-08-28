"use client";

import type { ReactNode } from "react";
import { useMomentum, type ComposerKind, type ComposerPrefill } from "./context";

export default function NewButton({
  kind,
  prefill,
  variant = "button",
  children,
}: {
  kind: ComposerKind;
  prefill?: ComposerPrefill;
  variant?: "button" | "mono";
  children: ReactNode;
}) {
  const { openComposer } = useMomentum();

  if (variant === "mono") {
    return (
      <button
        type="button"
        onClick={() => openComposer(kind, prefill)}
        className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openComposer(kind, prefill)}
      className="flex items-center gap-[7px] rounded-[11px] border border-edge bg-surf px-[14px] py-[9px] text-[12.5px] font-medium transition-colors hover:border-ink"
    >
      <span className="font-mono text-[13px]">+</span>
      {children}
    </button>
  );
}
