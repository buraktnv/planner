"use client";

import type { ReactNode } from "react";
import type { CardModel } from "@/lib/view/workspace";
import { useMomentum } from "./context";

export default function CardOpener({
  card,
  className = "",
  children,
}: {
  card: CardModel;
  className?: string;
  children: ReactNode;
}) {
  const { openCard } = useMomentum();
  return (
    <button type="button" onClick={() => openCard(card)} className={`text-left ${className}`}>
      {children}
    </button>
  );
}
