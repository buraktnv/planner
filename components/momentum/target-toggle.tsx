"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProjectType } from "@/lib/core/types";
import { toggledScope } from "@/lib/view/targets";
import { Tick } from "./primitives";

export default function TargetToggle({
  type,
  slug,
  scope,
  index,
  done,
  color,
  size = 15,
}: {
  type: ProjectType;
  slug: string;
  scope: string[];
  index: number;
  done: boolean;
  color: string;
  size?: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(done);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      const res = await fetch(`/api/charters/${type}/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mvpScope: toggledScope(scope, index, next) }),
      });
      if (!res.ok) {
        setOn(!next);
        return;
      }
      router.refresh();
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? "Mark target as not done" : "Mark target as done"}
      className="shrink-0 disabled:opacity-60"
    >
      <Tick done={on} color={color} size={size} />
    </button>
  );
}
