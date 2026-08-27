"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProvidersFile, ProviderProfile } from "@/lib/core/types";
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
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-neutral-100">Providers</h2>
        <button
          onClick={() => setAdding(true)}
          className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-600/20"
        >
          + Add provider
        </button>
      </div>

      {providers.profiles.length === 0 ? (
        <p className="text-sm text-neutral-400">No providers configured.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {providers.profiles.map((p) => (
            <div
              key={p.id}
              className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium text-neutral-100">{p.label}</p>
                  <p className="text-xs text-neutral-500">{p.id}</p>
                </div>
                <label className="flex items-center gap-1 text-xs text-neutral-400">
                  <input
                    type="radio"
                    name="default-provider"
                    checked={providers.default === p.id}
                    onChange={() => setDefault(p.id)}
                  />
                  default
                </label>
              </div>
              <dl className="space-y-1 text-xs text-neutral-400">
                <div className="flex justify-between">
                  <dt>type</dt>
                  <dd className="text-neutral-200">{p.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>model</dt>
                  <dd className="text-neutral-200">{p.model}</dd>
                </div>
                {p.baseUrl && (
                  <div className="flex justify-between gap-2">
                    <dt>baseUrl</dt>
                    <dd className="truncate text-neutral-200">{p.baseUrl}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>apiKeyEnv</dt>
                  <dd className="text-neutral-200">{p.apiKeyEnv || "—"}</dd>
                </div>
              </dl>
              <div className="flex items-center justify-between pt-1">
                <span
                  className={`inline-flex items-center gap-1 text-xs ${
                    envPresent[p.id] ? "text-emerald-400" : "text-neutral-500"
                  }`}
                  title={envPresent[p.id] ? "Env var is set" : "Env var not set"}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      envPresent[p.id] ? "bg-emerald-400" : "bg-neutral-600"
                    }`}
                  />
                  {envPresent[p.id] ? "key set" : "no key"}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(p)}
                    className="text-xs text-sky-400 hover:text-sky-300"
                  >
                    edit
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {adding && (
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
      )}

      {editing && (
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
      )}
    </section>
  );
}
