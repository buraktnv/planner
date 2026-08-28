"use client";

import { useState } from "react";
import type { ProviderProfile, ProviderType } from "@/lib/core/types";

const TYPES: ProviderType[] = [
  "claude-subscription",
  "anthropic-api",
  "openai-compatible",
];

const FIELD_CLASS =
  "rounded-[11px] border border-edge bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-faint disabled:opacity-50";

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
      className="flex flex-col gap-2.5 rounded-[18px] border border-edge bg-surf p-[17px]"
    >
      <div className="grid grid-cols-2 gap-2.5">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          disabled={!!profile}
          placeholder="id"
          className={FIELD_CLASS}
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ProviderType)}
          className={FIELD_CLASS}
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
          className={FIELD_CLASS}
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="model"
          className={FIELD_CLASS}
        />
      </div>
      {type === "openai-compatible" && (
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="baseUrl"
          className={`w-full ${FIELD_CLASS}`}
        />
      )}
      <input
        value={apiKeyEnv}
        onChange={(e) => setApiKeyEnv(e.target.value)}
        placeholder="apiKeyEnv (env var name)"
        className={`w-full ${FIELD_CLASS}`}
      />
      {error && <p className="m-0 text-[12.5px] text-clay-ink">{error}</p>}
      <div className="flex gap-2.5">
        <button
          type="submit"
          disabled={saving}
          className="rounded-[11px] bg-quick px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-[11px] border border-edge px-3.5 py-2 text-[13px] text-dim transition-colors hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
