"use client";

import { useState } from "react";
import type { ProviderProfile, ProviderType } from "@/lib/core/types";

const TYPES: ProviderType[] = [
  "claude-subscription",
  "anthropic-api",
  "openai-compatible",
];

export default function ProfileForm({
  profile,
  saving,
  onSave,
  onCancel,
}: {
  profile?: ProviderProfile;
  saving: boolean;
  onSave: (p: ProviderProfile) => void;
  onCancel: () => void;
}) {
  const [id, setId] = useState(profile?.id ?? "");
  const [type, setType] = useState<ProviderType>(profile?.type ?? "claude-subscription");
  const [label, setLabel] = useState(profile?.label ?? "");
  const [model, setModel] = useState(profile?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(profile?.baseUrl ?? "");
  const [apiKeyEnv, setApiKeyEnv] = useState(profile?.apiKeyEnv ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!id.trim()) return setError("id is required");
    if (!label.trim()) return setError("label is required");
    if (!model.trim()) return setError("model is required");
    if (type === "openai-compatible" && !baseUrl.trim()) {
      return setError("openai-compatible requires a baseUrl");
    }
    onSave({
      id: id.trim(),
      type,
      label: label.trim(),
      model: model.trim(),
      ...(type === "openai-compatible" ? { baseUrl: baseUrl.trim() } : {}),
      ...(apiKeyEnv.trim() ? { apiKeyEnv: apiKeyEnv.trim() } : {}),
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4"
    >
      <div className="grid grid-cols-2 gap-2">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          disabled={!!profile}
          placeholder="id"
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none disabled:opacity-50"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ProviderType)}
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="label"
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="model"
          className="rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
        />
      </div>
      {type === "openai-compatible" && (
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="baseUrl"
          className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
        />
      )}
      <input
        value={apiKeyEnv}
        onChange={(e) => setApiKeyEnv(e.target.value)}
        placeholder="apiKeyEnv (env var name)"
        className="w-full rounded bg-neutral-800 px-2 py-1.5 text-sm text-neutral-100 outline-none"
      />
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-emerald-600/20 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
