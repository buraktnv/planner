"use client";

import { useState } from "react";
import type { ProviderEffort, ProviderProfile, ProvidersFile } from "@/lib/core/types";
import { Mono, Rule } from "@/components/momentum/primitives";
import { EFFORT_LEVELS, PROVIDER_PRESETS, effortsFor } from "@/lib/ui/providers";
import ProfileForm from "./profile-form";

const CLAUDE_MODELS = ["opus", "sonnet", "haiku"];

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ background: on ? "var(--color-quick)" : "var(--color-edge)" }}
    />
  );
}

function StatePill({ on, label }: { on: boolean; label: string }) {
  return (
    <Mono
      className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-[3px] text-[9px] tracking-[0.1em]"
      style={{
        color: on ? "var(--color-quick-ink)" : "var(--color-dim)",
        background: on ? "var(--color-quick-tint)" : "var(--color-soft)",
      }}
    >
      <Dot on={on} />
      {label}
    </Mono>
  );
}

function Row({
  title,
  meta,
  right,
  children,
}: {
  title: string;
  meta: string;
  right: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-edge bg-surf px-[17px] py-[15px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[14.5px] font-semibold tracking-[-0.02em]">{title}</span>
        <Mono className="text-[9.5px] text-faint">{meta}</Mono>
        <div className="flex-1" />
        {right}
      </div>
      {children}
    </div>
  );
}

const SELECT_CLASS =
  "rounded-[9px] border border-edge bg-bg px-2.5 py-1.5 font-mono text-[10.5px] text-dim outline-none disabled:opacity-50";

export default function SourcesPanel({
  providers,
  envPresent,
  saving,
  onUpsert,
  onRemove,
}: {
  providers: ProvidersFile;
  envPresent: Record<string, boolean>;
  saving: boolean;
  onUpsert: (p: ProviderProfile) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProviderProfile | null>(null);

  const sub =
    providers.profiles.find((p) => p.type === "claude-subscription") ?? null;
  const custom = providers.profiles.filter(
    (p) => p.type === "openai-compatible" || p.type === "anthropic-api",
  );

  const countFor = (type: "openrouter" | "deepseek") =>
    providers.profiles.filter((p) => p.type === type).length;

  return (
    <section>
      <Rule
        label="SOURCES"
        action={
          <button
            type="button"
            onClick={() => {
              setAdding((v) => !v);
              setEditing(null);
            }}
            className="font-mono text-[10px] text-faint transition-colors hover:text-ink"
          >
            + CUSTOM
          </button>
        }
      />

      <div className="flex flex-col gap-[11px]">
        <Row
          title="Claude subscription"
          meta="AGENT SDK · NO API KEY"
          right={<StatePill on label="SIGNED IN VIA CLAUDE LOGIN" />}
        >
          <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-edge2 pt-3">
            {sub ? (
              <>
                <Mono className="text-[9px] tracking-[0.1em] text-faint">MODEL</Mono>
                <select
                  value={sub.model}
                  disabled={saving}
                  onChange={(e) => onUpsert({ ...sub, model: e.target.value })}
                  className={SELECT_CLASS}
                >
                  {(CLAUDE_MODELS.includes(sub.model)
                    ? CLAUDE_MODELS
                    : [sub.model, ...CLAUDE_MODELS]
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <Mono className="text-[9px] tracking-[0.1em] text-faint">EFFORT</Mono>
                <select
                  value={sub.effort ?? ""}
                  disabled={saving}
                  onChange={(e) => {
                    const value = e.target.value;
                    const next = { ...sub };
                    if (value === "") delete next.effort;
                    else next.effort = value as ProviderEffort;
                    onUpsert(next);
                  }}
                  className={SELECT_CLASS}
                >
                  <option value="">provider default</option>
                  {EFFORT_LEVELS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  onUpsert({
                    id: "claude-sub",
                    type: "claude-subscription",
                    model: "opus",
                    label: "Claude Opus",
                    effort: "medium",
                  })
                }
                className="rounded-[9px] border border-edge px-3 py-1.5 text-[11.5px] text-dim transition-colors hover:border-ink hover:text-ink disabled:opacity-50"
              >
                Add subscription profile
              </button>
            )}
          </div>
        </Row>

        {(["openrouter", "deepseek"] as const).map((source) => {
          const preset = PROVIDER_PRESETS[source];
          const on = envPresent[preset.apiKeyEnv] === true;
          return (
            <Row
              key={source}
              title={preset.label}
              meta={preset.baseUrl.toUpperCase()}
              right={<StatePill on={on} label={on ? "CONNECTED" : "NO KEY"} />}
            >
              <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-edge2 pt-3">
                <Mono className="rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] text-dim">
                  {preset.apiKeyEnv}
                </Mono>
                <Mono className="text-[9.5px] text-faint">
                  {on
                    ? `${countFor(source)} FAVOURITE${countFor(source) === 1 ? "" : "S"}`
                    : `SET ${preset.apiKeyEnv} IN .env.local`}
                </Mono>
              </div>
            </Row>
          );
        })}

        {custom.map((p) => {
          const envName = p.apiKeyEnv ?? (p.type === "anthropic-api" ? "ANTHROPIC_API_KEY" : "");
          const on = envName ? envPresent[envName] === true : true;
          return (
            <Row
              key={p.id}
              title={p.label}
              meta={`${p.type.toUpperCase()} · ${p.model.toUpperCase()}`}
              right={
                <StatePill on={on} label={on ? "CONNECTED" : "NO KEY"} />
              }
            >
              <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-edge2 pt-3">
                <Mono className="rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] text-dim">
                  {envName || "no key needed"}
                </Mono>
                {p.baseUrl && (
                  <Mono className="rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] text-dim">
                    {p.baseUrl}
                  </Mono>
                )}
                <Mono className="text-[9.5px] text-faint">
                  EFFORT {p.effort ?? "—"} · {effortsFor(p.type).join("/")}
                </Mono>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    setEditing(p);
                    setAdding(false);
                  }}
                  className="font-mono text-[10px] text-faint transition-colors hover:text-ink"
                >
                  EDIT
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  className="font-mono text-[10px] text-faint transition-colors hover:text-wait-ink"
                >
                  DELETE
                </button>
              </div>
            </Row>
          );
        })}
      </div>

      {(adding || editing) && (
        <div className="mt-[11px]">
          <ProfileForm
            saving={saving}
            profile={editing ?? undefined}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
            }}
            onSave={(profile) => {
              onUpsert(profile);
              setAdding(false);
              setEditing(null);
            }}
          />
        </div>
      )}
    </section>
  );
}
