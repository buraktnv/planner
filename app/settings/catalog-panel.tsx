"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogModel, ProviderProfile, ProvidersFile } from "@/lib/core/types";
import { Mono, Rule } from "@/components/momentum/primitives";
import { PROVIDER_PRESETS, favouriteId } from "@/lib/ui/providers";

type Source = "openrouter" | "deepseek";

type ChipKey = "gpt" | "claude" | "gemini" | "deepseek" | "free" | "reasoning";

const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "gpt", label: "GPT" },
  { key: "claude", label: "Claude" },
  { key: "gemini", label: "Gemini" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "free", label: "Free" },
  { key: "reasoning", label: "Reasoning" },
];

function isFree(m: CatalogModel): boolean {
  if (m.id.includes(":free")) return true;
  return m.promptPrice === 0 && m.completionPrice === 0;
}

function matchesChip(m: CatalogModel, chip: ChipKey): boolean {
  const id = m.id.toLowerCase();
  switch (chip) {
    case "gpt":
      return id.startsWith("openai/") || id.startsWith("gpt");
    case "claude":
      return id.startsWith("anthropic/") || id.includes("claude");
    case "gemini":
      return id.includes("gemini");
    case "deepseek":
      return id.includes("deepseek");
    case "free":
      return isFree(m);
    case "reasoning":
      return m.reasoning;
  }
}

function price(v: number | undefined): string {
  if (v == null) return "—";
  if (v === 0) return "0";
  if (v < 0.1) return v.toFixed(3);
  return v.toFixed(2);
}

export default function CatalogPanel({
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
  const [source, setSource] = useState<Source>("openrouter");
  const [loaded, setLoaded] = useState<
    Partial<Record<Source, { models: CatalogModel[]; error: string | null }>>
  >({});
  const [q, setQ] = useState("");
  const [chips, setChips] = useState<ChipKey[]>([]);

  useEffect(() => {
    let alive = true;
    if (loaded[source]) return;
    fetch(`/api/models?source=${source}`)
      .then((r) => r.json())
      .then((data: { models?: CatalogModel[]; error?: string }) => {
        if (!alive) return;
        setLoaded((prev) => ({
          ...prev,
          [source]: { models: data.models ?? [], error: data.error ?? null },
        }));
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoaded((prev) => ({
          ...prev,
          [source]: {
            models: [],
            error: e instanceof Error ? e.message : "Could not load models",
          },
        }));
      });
    return () => {
      alive = false;
    };
  }, [source, loaded]);

  const entry = loaded[source];
  const loading = entry === undefined;
  const error = entry?.error ?? null;

  const favIds = useMemo(
    () => new Set(providers.profiles.map((p) => p.id)),
    [providers.profiles],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (loaded[source]?.models ?? []).filter((m) => {
      if (needle && !m.id.toLowerCase().includes(needle) && !m.name.toLowerCase().includes(needle)) {
        return false;
      }
      return chips.every((c) => matchesChip(m, c));
    });
    return list.sort((a, b) => {
      const fa = favIds.has(favouriteId(source, a.id)) ? 0 : 1;
      const fb = favIds.has(favouriteId(source, b.id)) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return a.id.localeCompare(b.id);
    });
  }, [loaded, source, q, chips, favIds]);

  const toggle = (m: CatalogModel) => {
    const id = favouriteId(source, m.id);
    if (favIds.has(id)) {
      onRemove(id);
      return;
    }
    onUpsert({ id, type: source, model: m.id, label: m.name });
  };

  const keySet = envPresent[PROVIDER_PRESETS[source].apiKeyEnv] === true;

  return (
    <section>
      <Rule label="CATALOG" />

      <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
        <div className="flex gap-[5px]">
          {(["openrouter", "deepseek"] as const).map((s) => {
            const on = source === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={`rounded-[9px] px-3 py-[7px] text-[11.5px] font-medium transition-colors ${
                  on ? "bg-quick text-white" : "bg-soft text-dim hover:text-ink"
                }`}
              >
                {PROVIDER_PRESETS[s].label}
              </button>
            );
          })}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search models…"
          className="min-w-[160px] flex-1 rounded-[11px] border border-edge bg-bg px-3 py-2 text-[12.5px] outline-none placeholder:text-faint"
        />
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-[5px]">
        {CHIPS.map((c) => {
          const on = chips.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              onClick={() =>
                setChips((prev) =>
                  prev.includes(c.key) ? prev.filter((k) => k !== c.key) : [...prev, c.key],
                )
              }
              className={`rounded-[7px] px-[9px] py-[5px] font-mono text-[9.5px] tracking-[0.08em] transition-colors ${
                on ? "bg-quick-tint text-quick-ink" : "bg-soft text-faint hover:text-ink"
              }`}
            >
              {c.label.toUpperCase()}
            </button>
          );
        })}
        <div className="flex-1" />
        <Mono className="text-[9px] tracking-[0.08em] text-faint">
          {loading ? "LOADING…" : `${rows.length} MODELS`}
        </Mono>
      </div>

      {error && (
        <p className="m-0 mb-2.5 text-[12.5px] text-faint">
          {error}
          {!keySet && source === "deepseek"
            ? ` — add ${PROVIDER_PRESETS.deepseek.apiKeyEnv} to .env.local to list DeepSeek models.`
            : ""}
        </p>
      )}

      <div className="max-h-[420px] overflow-y-auto rounded-[18px] border border-edge bg-surf">
        {rows.length === 0 ? (
          <p className="m-0 px-[18px] py-[15px] text-[12.5px] text-faint">
            {loading ? "Loading the model list…" : "No models match."}
          </p>
        ) : (
          rows.map((m) => {
            const id = favouriteId(source, m.id);
            const fav = favIds.has(id);
            return (
              <div
                key={m.id}
                className="flex items-center gap-3 border-b border-edge2 px-[15px] py-[11px] last:border-b-0"
              >
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => toggle(m)}
                  aria-label={fav ? `Remove ${m.name} from favourites` : `Favourite ${m.name}`}
                  className={`shrink-0 text-[14px] leading-none transition-colors disabled:opacity-50 ${
                    fav ? "text-wait-ink" : "text-faint hover:text-ink"
                  }`}
                >
                  {fav ? "★" : "☆"}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] font-medium tracking-[-0.01em]">
                    {m.name}
                  </p>
                  <Mono className="block truncate text-[9.5px] text-faint">{m.id}</Mono>
                </div>
                <Mono className="hidden w-[52px] shrink-0 text-right text-[9.5px] text-dim sm:block">
                  {m.contextLength ? `${Math.round(m.contextLength / 1000)}k` : "—"}
                </Mono>
                <Mono className="hidden w-[104px] shrink-0 text-right text-[9.5px] text-dim sm:block">
                  {m.promptPrice == null && m.completionPrice == null
                    ? "—"
                    : `$${price(m.promptPrice)}/$${price(m.completionPrice)} per M`}
                </Mono>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  title={m.reasoning ? "supports reasoning" : "no reasoning"}
                  style={{
                    background: m.reasoning ? "var(--color-deep)" : "var(--color-edge)",
                  }}
                />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
