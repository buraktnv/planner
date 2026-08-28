"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProvidersFile, ProviderProfile } from "@/lib/core/types";
import SourcesPanel from "./sources-panel";
import CatalogPanel from "./catalog-panel";
import FavouritesPanel from "./favourites-panel";

export default function ProvidersManager({
  initial,
  envPresent,
}: {
  initial: ProvidersFile;
  envPresent: Record<string, boolean>;
}) {
  const router = useRouter();
  const [providers, setProviders] = useState<ProvidersFile>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (next: ProvidersFile) => {
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
        router.refresh();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [router],
  );

  const upsert = useCallback(
    (profile: ProviderProfile) => {
      const exists = providers.profiles.some((p) => p.id === profile.id);
      const next: ProvidersFile = {
        profiles: exists
          ? providers.profiles.map((p) => (p.id === profile.id ? profile : p))
          : [...providers.profiles, profile],
        default: providers.default || profile.id,
      };
      void save(next);
    },
    [providers, save],
  );

  const remove = useCallback(
    (id: string) => {
      const profiles = providers.profiles.filter((p) => p.id !== id);
      const next: ProvidersFile = {
        profiles,
        default:
          providers.default === id ? (profiles[0]?.id ?? "") : providers.default,
      };
      void save(next);
    },
    [providers, save],
  );

  const setDefault = useCallback(
    (id: string) => {
      void save({ ...providers, default: id });
    },
    [providers, save],
  );

  return (
    <div className="flex flex-col gap-[30px]">
      {error && (
        <p className="m-0 rounded-[11px] border border-edge bg-surf px-3.5 py-2.5 text-[12.5px] text-clay-ink">
          {error}
        </p>
      )}
      <SourcesPanel
        providers={providers}
        envPresent={envPresent}
        saving={saving}
        onUpsert={upsert}
        onRemove={remove}
      />
      <CatalogPanel
        providers={providers}
        envPresent={envPresent}
        saving={saving}
        onUpsert={upsert}
        onRemove={remove}
      />
      <FavouritesPanel
        providers={providers}
        saving={saving}
        onUpsert={upsert}
        onRemove={remove}
        onSetDefault={setDefault}
      />
    </div>
  );
}
