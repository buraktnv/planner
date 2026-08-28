import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { JSONValue, LanguageModel } from "ai";
import type { ProviderEffort, ProviderProfile } from "../core/types";
import { apiKeyEnvOf, presetFor } from "../core/providers";
import { clampEffort } from "../ui/providers";

export interface ResolvedModel {
  model: LanguageModel;
  providerOptions?: Record<string, Record<string, JSONValue>>;
}

const OPENROUTER_HEADERS = {
  "HTTP-Referer": "http://localhost:3000",
  "X-Title": "Planner",
};

export function effortOf(
  profile: ProviderProfile,
  override?: ProviderEffort,
): ProviderEffort | undefined {
  return override ?? profile.effort;
}

export function resolveModel(
  profile: ProviderProfile,
  effortOverride?: ProviderEffort,
): ResolvedModel {
  const effort = effortOf(profile, effortOverride);

  if (profile.type === "anthropic-api") {
    const envName = apiKeyEnvOf(profile) ?? "ANTHROPIC_API_KEY";
    const anthropic = createAnthropic({ apiKey: process.env[envName] });
    return {
      model: anthropic(profile.model),
      ...(effort ? { providerOptions: { anthropic: { effort } } } : {}),
    };
  }

  if (
    profile.type === "openai-compatible" ||
    profile.type === "openrouter" ||
    profile.type === "deepseek"
  ) {
    const preset = presetFor(profile.type);
    const baseURL = preset ? preset.baseUrl : profile.baseUrl;
    if (!baseURL) {
      throw new Error(`Profile ${profile.id} has no baseUrl`);
    }
    const envName = apiKeyEnvOf(profile);
    const key = envName ? process.env[envName] ?? "" : "ollama";
    const providerName = profile.type === "openai-compatible" ? profile.id : profile.type;
    const provider = createOpenAICompatible({
      name: providerName,
      baseURL,
      apiKey: key,
      ...(profile.type === "openrouter" ? { headers: OPENROUTER_HEADERS } : {}),
    });
    const model = provider(profile.model);
    if (!effort) return { model };
    return {
      model,
      providerOptions: {
        [providerName]: { reasoningEffort: clampEffort(profile.type, effort) },
      },
    };
  }

  throw new Error("claude-subscription handled separately");
}
