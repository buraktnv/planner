"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANES, LANE_KEYS } from "@/lib/ui/momentum";
import type { TaskLane, TaskSize } from "@/lib/core/types";
import type { ComposerKind, ComposerPrefill, NavCharter } from "./context";
import { Mono } from "./primitives";

const SIZES: TaskSize[] = ["S", "M", "L"];

const HEADINGS: Record<ComposerKind, string> = {
  project: "New project",
  area: "New area",
  branch: "New task",
  target: "New target",
  event: "New dated task",
};

const PLACEHOLDERS: Record<ComposerKind, string> = {
  project: "Project name",
  area: "Area name",
  branch: "What needs doing",
  target: "Ship the first clinic",
  event: "Passport appointment",
};

function FieldLabel({ children }: { children: string }) {
  return (
    <Mono className="mb-2.5 block text-[9px] tracking-[0.12em] text-faint">{children}</Mono>
  );
}

export default function Composer({
  kind,
  prefill,
  charters,
  onClose,
}: {
  kind: ComposerKind;
  prefill?: ComposerPrefill;
  charters: NavCharter[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [mvp, setMvp] = useState("");
  const [lane, setLane] = useState<TaskLane>(prefill?.lane ?? "quick");
  const [size, setSize] = useState<TaskSize>("M");
  const [due, setDue] = useState("");
  const [steps, setSteps] = useState("");
  const [scopeKey, setScopeKey] = useState<string>(
    prefill?.scopeKey ?? charters[0]?.key ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsScope = kind === "branch" || kind === "target" || kind === "event";

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "project" || kind === "area") {
        const res = await fetch(kind === "project" ? "/api/projects" : "/api/areas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: title.trim(),
            why: why.trim() || `Created from the composer on ${new Date().toDateString()}.`,
            ...(kind === "project" ? { mvp: mvp.trim() || title.trim() } : {}),
          }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Failed");
        const charter = (await res.json()) as { id: string };
        onClose();
        router.push(kind === "project" ? `/projects/${charter.id}` : `/areas/${charter.id}`);
        router.refresh();
        return;
      }

      const [type, slug] = scopeKey.split("/");
      if (!type || !slug) throw new Error("Pick a project or area first");

      if (kind === "target") {
        const current = await fetch(`/api/charters/${type}/${slug}`);
        if (!current.ok) throw new Error("Could not read the charter");
        const charter = (await current.json()) as { mvpScope: string[] };
        const line = due.trim() ? `${title.trim()} — by ${due.trim()}` : title.trim();
        const res = await fetch(`/api/charters/${type}/${slug}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mvpScope: [...charter.mvpScope, `- [ ] ${line}`] }),
        });
        if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Failed");
        onClose();
        router.refresh();
        return;
      }

      const base = type === "project" ? "/api/projects" : "/api/areas";
      const res = await fetch(`${base}/${slug}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          size,
          lane,
          ...(due ? { due } : {}),
        }),
      });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Failed");
      const task = (await res.json()) as { id: string };

      const lines = steps
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const step of lines) {
        await fetch(`${base}/${slug}/tasks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: step, size: "S", parentId: task.id }),
        });
      }
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(46,42,38,.28)] px-6 py-16"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-pop w-full max-w-[480px] rounded-[22px] border border-edge bg-surf px-[26px] py-6 shadow-[0_20px_50px_rgba(46,42,38,.14)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={HEADINGS[kind]}
      >
        <div className="mb-5 flex items-center gap-2.5">
          <span className="text-[17px] font-semibold tracking-[-0.02em]">{HEADINGS[kind]}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-lg leading-none text-faint transition-colors hover:text-ink"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={PLACEHOLDERS[kind]}
          autoFocus
          className="mb-[18px] w-full rounded-[13px] border border-edge bg-bg px-[15px] py-[13px] text-[15px] outline-none placeholder:text-faint"
        />

        {(kind === "project" || kind === "area") && (
          <>
            <FieldLabel>WHY IT EXISTS</FieldLabel>
            <textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              rows={3}
              placeholder="The reason this is on the list at all."
              className="mb-[18px] w-full resize-y rounded-[13px] border border-edge bg-bg px-3.5 py-3 text-[13px] leading-[1.6] outline-none placeholder:text-faint"
            />
            {kind === "project" && (
              <>
                <FieldLabel>MVP — ONE LINE</FieldLabel>
                <input
                  value={mvp}
                  onChange={(e) => setMvp(e.target.value)}
                  placeholder="What done looks like"
                  className="mb-[18px] w-full rounded-[13px] border border-edge bg-bg px-3.5 py-[11px] text-[13.5px] outline-none placeholder:text-faint"
                />
              </>
            )}
          </>
        )}

        {needsScope && (
          <>
            <FieldLabel>BELONGS TO</FieldLabel>
            <div className="mb-[18px] flex flex-wrap gap-[7px]">
              {charters.map((c) => {
                const on = scopeKey === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setScopeKey(c.key)}
                    className={`inline-flex items-center gap-[7px] rounded-[10px] border px-[11px] py-1.5 text-[12px] ${
                      on ? "border-faint bg-soft text-ink" : "border-edge text-dim"
                    }`}
                  >
                    <span
                      className="h-[7px] w-[7px] rounded-[2px]"
                      style={{ background: c.color }}
                    />
                    {c.name}
                  </button>
                );
              })}
              {charters.length === 0 && (
                <span className="text-[12.5px] text-faint">
                  Create a project or an area first.
                </span>
              )}
            </div>
          </>
        )}

        {(kind === "branch" || kind === "event") && (
          <>
            <FieldLabel>LANE</FieldLabel>
            <div className="mb-[18px] flex flex-wrap gap-[7px]">
              {LANE_KEYS.map((k) => {
                const meta = LANES[k];
                const on = lane === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLane(k)}
                    className="rounded-[10px] px-3 py-[7px] text-[12px] font-medium"
                    style={{
                      color: on ? "#ffffff" : meta.ink,
                      background: on ? meta.color : meta.tint,
                    }}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <FieldLabel>SIZE</FieldLabel>
            <div className="mb-[18px] flex flex-wrap gap-[7px]">
              {SIZES.map((s) => {
                const on = size === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    className={`rounded-[10px] border px-[11px] py-1.5 font-mono text-[11px] ${
                      on ? "border-faint bg-soft text-ink" : "border-edge text-dim"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {(kind === "event" || kind === "branch") && (
          <>
            <FieldLabel>{kind === "event" ? "DATE" : "DUE — OPTIONAL"}</FieldLabel>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="mb-[18px] w-full rounded-[13px] border border-edge bg-bg px-3.5 py-[11px] font-mono text-[12.5px] outline-none"
            />
          </>
        )}

        {kind === "target" && (
          <>
            <FieldLabel>BY WHEN — OPTIONAL</FieldLabel>
            <input
              value={due}
              onChange={(e) => setDue(e.target.value)}
              placeholder="30 SEP"
              className="mb-[18px] w-full rounded-[13px] border border-edge bg-bg px-3.5 py-[11px] font-mono text-[12.5px] outline-none placeholder:text-faint"
            />
            <Mono className="mb-2 block text-[9px] leading-[1.6] tracking-[0.06em] text-faint">
              TARGETS ARE STORED AS MVP SCOPE LINES ON THE CHARTER
            </Mono>
          </>
        )}

        {kind === "branch" && (
          <>
            <FieldLabel>STEPS — ONE PER LINE, EACH BECOMES A SUBTASK</FieldLabel>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={3}
              placeholder={"Build the index\nHandle the empty case"}
              className="w-full resize-y rounded-[13px] border border-edge bg-bg px-3.5 py-3 text-[13px] leading-[1.6] outline-none placeholder:text-faint"
            />
          </>
        )}

        {error && (
          <div className="mt-3.5 rounded-[11px] bg-clay-tint px-3.5 py-2.5 text-[12.5px] text-clay-ink">
            {error}
          </div>
        )}

        <div className="mt-[22px] flex gap-2.5 border-t border-edge2 pt-[18px]">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !title.trim() || (needsScope && !scopeKey)}
            className="rounded-[11px] bg-quick px-5 py-[11px] text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Create"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[11px] border border-edge px-4 py-[11px] text-[13.5px] text-dim transition-colors hover:text-ink"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
