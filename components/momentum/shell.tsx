"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { CardModel } from "@/lib/view/workspace";
import { taskHref } from "@/lib/view/task";
import ChatRail from "./chat-rail";
import Composer from "./composer";
import Sidebar from "./sidebar";
import { useMediaQuery } from "./use-media-query";
import {
  MomentumContext,
  type ComposerKind,
  type ComposerPrefill,
  type NavCharter,
} from "./context";

export default function Shell({
  charters,
  children,
}: {
  charters: NavCharter[];
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const compact = useMediaQuery("(max-width: 1023px)");
  const railOverlay = useMediaQuery("(max-width: 1279px)");
  const [chatScope, setChatScope] = useState<string | null>(null);
  const [composer, setComposer] = useState<{
    kind: ComposerKind;
    prefill?: ComposerPrefill;
  } | null>(null);
  const router = useRouter();

  const openComposer = useCallback((kind: ComposerKind, prefill?: ComposerPrefill) => {
    setComposer({ kind, prefill });
  }, []);

  const openCard = useCallback(
    (next: CardModel) => {
      const from = `${window.location.pathname}${window.location.search}`;
      router.push(
        `${taskHref(next.type, next.slug, next.id)}?from=${encodeURIComponent(from)}`,
      );
    },
    [router],
  );

  const api = useMemo(
    () => ({ openComposer, openCard, charters, chatScope, setChatScope }),
    [openComposer, openCard, charters, chatScope],
  );

  return (
    <MomentumContext.Provider value={api}>
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar
          collapsed={collapsed || compact}
          lockCollapsed={compact}
          onToggle={() => setCollapsed((v) => !v)}
          charters={charters}
        />
        <main
          className="min-w-0 flex-1 overflow-y-auto"
          style={{ scrollbarGutter: "stable" }}
        >
          {children}
        </main>
        <ChatRail
          overlay={railOverlay}
          open={chatOpen}
          onToggle={() => setChatOpen((v) => !v)}
          charters={charters}
          scope={chatScope}
          onScopeChange={setChatScope}
        />
        {composer && (
          <Composer
            kind={composer.kind}
            prefill={composer.prefill}
            charters={charters}
            onClose={() => setComposer(null)}
          />
        )}
      </div>
    </MomentumContext.Provider>
  );
}
