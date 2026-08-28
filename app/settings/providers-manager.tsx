"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProvidersFile, ProviderProfile } from "@/lib/core/types";
import { Mono, Rule } from "@/components/momentum/primitives";
import ProfileForm from "./profile-form";

export default function ProvidersManager({
  initial,
  envPresent,
}: {
  initial: ProvidersFile;
  envPresent: Record<string, boolean>;
}) {
  const router = useRouter();
  const [providers, setProviders] = useState<ProvidersFile>(initial);
  const [editing, setEditing] = useState<ProviderProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(next: ProvidersFile) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/providers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save providers");
      }
      setProviders(next);
      setEditing(null);
      setAdding(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  function remove(id: string) {
    const next: ProvidersFile = {
      profiles: providers.profiles.filter((p) => p.id !== id),
      default: providers.default === id ? "" : providers.default,
    };
    void save(next);
  }

  function setDefault(id: string) {
    void save({ ...providers, default: id });
  }

  return (
    <section>
      <Rule
        label="PROVIDERS"
        action={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="font-mono text-[10px] text-faint transition-colors hover:text-ink"
          >
            + ADD
          </button>
        }
      />

      {providers.profiles.length === 0 ? (
        <p className="m-0 text-[13.5px] text-faint">
          No providers configured. Add one to start chatting.
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
                  <Mono className="text-[9.5px] text-faint">{p.id}</Mono>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-dim">
                  <input
                    type="radio"
                    name="default-provider"
                    checked={providers.default === p.id}
                    onChange={() => setDefault(p.id)}
                  />
                  default
                </label>
              </div>
              <dl className="m-0 flex flex-col gap-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-[11px] text-faint">type</dt>
                  <dd className="m-0 truncate font-mono text-[10.5px] text-dim">{p.type}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[11px] text-faint">model</dt>
                  <dd className="m-0 truncate font-mono text-[10.5px] text-dim">{p.model}</dd>
                </div>
                {p.baseUrl && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-[11px] text-faint">baseUrl</dt>
                    <dd className="m-0 truncate font-mono text-[10.5px] text-dim">{p.baseUrl}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-2">
                  <dt className="text-[11px] text-faint">apiKeyEnv</dt>
                  <dd className="m-0 truncate font-mono text-[10.5px] text-dim">
                    {p.apiKeyEnv || "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex items-center justify-between border-t border-edge2 pt-3">
                <Mono
                  className="flex items-center gap-1.5 text-[9px] tracking-[0.08em]"
                  style={{
                    color: envPresent[p.id] ? "var(--color-quick-ink)" : "var(--color-faint)",
                  }}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: envPresent[p.id]
                        ? "var(--color-quick)"
                        : "var(--color-edge)",
                    }}
                  />
                  {envPresent[p.id] ? "KEY SET" : "NO KEY"}
                </Mono>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="font-mono text-[10px] text-faint transition-colors hover:text-ink"
                  >
                    EDIT
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="font-mono text-[10px] text-faint transition-colors hover:text-wait-ink"
                  >
                    DELETE
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-[12.5px] text-clay-ink">{error}</p>}

      {adding && (
        <div className="mt-[11px]">
          <ProfileForm
            saving={saving}
            onCancel={() => setAdding(false)}
            onSave={(profile) => {
              if (providers.profiles.some((p) => p.id === profile.id)) {
                setError("A profile with this id already exists");
                return;
              }
              void save({
                profiles: [...providers.profiles, profile],
                default: providers.default || profile.id,
              });
            }}
          />
        </div>
      )}

      {editing && (
        <div className="mt-[11px]">
          <ProfileForm
            saving={saving}
            profile={editing}
            onCancel={() => setEditing(null)}
            onSave={(profile) => {
              void save({
                profiles: providers.profiles.map((p) =>
                  p.id === editing.id ? profile : p,
                ),
                default: providers.default === editing.id ? profile.id : providers.default,
              });
            }}
          />
        </div>
      )}
    </section>
  );
}
