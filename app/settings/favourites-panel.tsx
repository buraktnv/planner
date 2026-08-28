"use client";

import type { ProviderEffort, ProviderProfile, ProvidersFile } from "@/lib/core/types";
import { Mono, Rule } from "@/components/momentum/primitives";
import { effortsFor } from "@/lib/ui/providers";

const TYPE_LABEL: Record<string, string> = {
  "claude-subscription": "claude subscription",
  "anthropic-api": "anthropic api",
  "openai-compatible": "openai-compatible",
  openrouter: "openrouter",
  deepseek: "deepseek",
};

export default function FavouritesPanel({
  providers,
  saving,
  onUpsert,
  onRemove,
  onSetDefault,
}: {
  providers: ProvidersFile;
  saving: boolean;
  onUpsert: (p: ProviderProfile) => void;
  onRemove: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  return (
    <section>
      <Rule label="FAVOURITES" />

      {providers.profiles.length === 0 ? (
        <p className="m-0 text-[13.5px] text-faint">
          Nothing favourited yet. Star a model in the catalog to use it in chat.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-[11px] sm:grid-cols-2">
          {providers.profiles.map((p) => (
            <div key={p.id} className="min-w-0 rounded-[18px] border border-edge bg-surf p-[17px]">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 truncate text-[15px] font-semibold tracking-[-0.02em]">
                    {p.label}
                  </p>
                  <Mono className="block truncate text-[9.5px] text-faint">{p.model}</Mono>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-dim">
                  <input
                    type="radio"
                    name="default-provider"
                    checked={providers.default === p.id}
                    onChange={() => onSetDefault(p.id)}
                  />
                  default
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Mono className="rounded-[7px] bg-soft px-[9px] py-[5px] text-[9.5px] text-dim">
                  {TYPE_LABEL[p.type] ?? p.type}
                </Mono>
                <select
                  value={p.effort ?? ""}
                  disabled={saving}
                  onChange={(e) => {
                    const value = e.target.value;
                    const next = { ...p };
                    if (value === "") delete next.effort;
                    else next.effort = value as ProviderEffort;
                    onUpsert(next);
                  }}
                  className="rounded-[9px] border border-edge bg-bg px-2.5 py-1.5 font-mono text-[10px] text-dim outline-none disabled:opacity-50"
                >
                  <option value="">effort: default</option>
                  {effortsFor(p.type).map((e) => (
                    <option key={e} value={e}>
                      effort: {e}
                    </option>
                  ))}
                </select>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  className="font-mono text-[10px] text-faint transition-colors hover:text-wait-ink"
                >
                  DELETE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
