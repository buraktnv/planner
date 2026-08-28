import type { ProviderEffort, ProviderType } from "@/lib/core/types";

export const EFFORT_LEVELS: ProviderEffort[] = ["low", "medium", "high", "xhigh", "max"];

export const OPENAI_STYLE_EFFORTS: ProviderEffort[] = ["low", "medium", "high"];

export interface ProviderPreset {
  baseUrl: string;
  apiKeyEnv: string;
  label: string;
  idPrefix: string;
}

export const PROVIDER_PRESETS: Record<"openrouter" | "deepseek", ProviderPreset> = {
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    apiKeyEnv: "OPENROUTER_API_KEY",
    label: "OpenRouter",
    idPrefix: "or-",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    label: "DeepSeek",
    idPrefix: "ds-",
  },
};

export const FIXED_PROVIDER_TYPES: ProviderType[] = ["openrouter", "deepseek"];

export function isFixedProviderType(t: ProviderType): t is "openrouter" | "deepseek" {
  return t === "openrouter" || t === "deepseek";
}

export function isClaudeType(t: ProviderType): boolean {
  return t === "claude-subscription" || t === "anthropic-api";
}

export function slugifyModelId(model: string): string {
  return model
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function favouriteId(source: "openrouter" | "deepseek", model: string): string {
  return `${PROVIDER_PRESETS[source].idPrefix}${slugifyModelId(model)}`;
}

export function effortsFor(type: ProviderType): ProviderEffort[] {
  return isClaudeType(type) ? EFFORT_LEVELS : OPENAI_STYLE_EFFORTS;
}

export function clampEffort(type: ProviderType, effort: ProviderEffort): ProviderEffort {
  if (isClaudeType(type)) return effort;
  return effort === "xhigh" || effort === "max" ? "high" : effort;
}

export function nextEffort(
  type: ProviderType,
  current: ProviderEffort | undefined,
): ProviderEffort {
  const levels = effortsFor(type);
  if (!current) return levels[0];
  const i = levels.indexOf(current);
  return levels[(i + 1) % levels.length];
}

export function isProviderEffort(v: unknown): v is ProviderEffort {
  return typeof v === "string" && (EFFORT_LEVELS as string[]).includes(v);
}
