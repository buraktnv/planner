"use client";

import { createContext, useContext } from "react";
import type { CardModel } from "@/lib/view/workspace";
import type { TaskLane } from "@/lib/core/types";

export type ComposerKind = "project" | "area" | "branch" | "target" | "event";

export interface ComposerPrefill {
  scopeKey?: string;
  lane?: TaskLane;
}

export interface NavCharter {
  key: string;
  type: "project" | "area";
  slug: string;
  name: string;
  color: string;
  open: number;
}

export interface MomentumApi {
  openComposer: (kind: ComposerKind, prefill?: ComposerPrefill) => void;
  openCard: (card: CardModel) => void;
  charters: NavCharter[];
  chatScope: string | null;
  setChatScope: (key: string | null) => void;
}

const noop = () => {};

export const MomentumContext = createContext<MomentumApi>({
  openComposer: noop,
  openCard: noop,
  charters: [],
  chatScope: null,
  setChatScope: noop,
});

export function useMomentum(): MomentumApi {
  return useContext(MomentumContext);
}
