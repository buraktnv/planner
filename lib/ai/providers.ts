import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ProviderProfile } from "../core/types";

export function resolveModel(profile: ProviderProfile) {
  if (profile.type === "openai-compatible") {
    const key = profile.apiKeyEnv ? process.env[profile.apiKeyEnv] ?? "" : "ollama";
    const provider = createOpenAICompatible({
      name: profile.id,
      baseURL: profile.baseUrl!,
      apiKey: key,
    });
    return provider(profile.model);
  }
  if (profile.type === "anthropic-api") {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(profile.model);
  }
  throw new Error("claude-subscription handled separately");
}
