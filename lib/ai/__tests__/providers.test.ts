import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveModel } from "../providers";
import type { ProviderProfile } from "../../core/types";

const KEYS = ["OPENROUTER_API_KEY", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "CUSTOM_KEY"];

beforeEach(() => {
  for (const k of KEYS) process.env[k] = "fake-key";
});

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("resolveModel", () => {
  it("throws for claude-subscription (handled separately by the route)", () => {
    const profile: ProviderProfile = {
      id: "claude-sub",
      type: "claude-subscription",
      model: "claude-sonnet-4",
      label: "Claude subscription",
    };
    expect(() => resolveModel(profile)).toThrow(/claude-subscription/);
  });

  it("sends no providerOptions when no effort is set anywhere", () => {
    const profile: ProviderProfile = {
      id: "or-acme-x",
      type: "openrouter",
      model: "acme/x",
      label: "Acme X",
    };
    expect(resolveModel(profile).providerOptions).toBeUndefined();
  });

  it("maps effort to anthropic providerOptions for anthropic-api", () => {
    const profile: ProviderProfile = {
      id: "anthropic",
      type: "anthropic-api",
      model: "claude-x",
      label: "Anthropic",
      effort: "xhigh",
    };
    expect(resolveModel(profile).providerOptions).toEqual({
      anthropic: { effort: "xhigh" },
    });
  });

  it("maps effort to reasoningEffort under the openrouter provider name", () => {
    const profile: ProviderProfile = {
      id: "or-acme-x",
      type: "openrouter",
      model: "acme/x",
      label: "Acme X",
      effort: "medium",
    };
    expect(resolveModel(profile).providerOptions).toEqual({
      openrouter: { reasoningEffort: "medium" },
    });
  });

  it("maps effort to reasoningEffort under the deepseek provider name", () => {
    const profile: ProviderProfile = {
      id: "ds-fake-chat",
      type: "deepseek",
      model: "fake-chat",
      label: "Fake Chat",
      effort: "low",
    };
    expect(resolveModel(profile).providerOptions).toEqual({
      deepseek: { reasoningEffort: "low" },
    });
  });

  it("uses the profile id as the provider name for openai-compatible", () => {
    const profile: ProviderProfile = {
      id: "ollama",
      type: "openai-compatible",
      baseUrl: "http://localhost:11434/v1",
      model: "llama-fake",
      label: "Ollama",
      effort: "high",
    };
    expect(resolveModel(profile).providerOptions).toEqual({
      ollama: { reasoningEffort: "high" },
    });
  });

  it("clamps xhigh and max to high for OpenAI-style APIs", () => {
    const base: ProviderProfile = {
      id: "or-acme-x",
      type: "openrouter",
      model: "acme/x",
      label: "Acme X",
    };
    expect(resolveModel({ ...base, effort: "xhigh" }).providerOptions).toEqual({
      openrouter: { reasoningEffort: "high" },
    });
    expect(resolveModel({ ...base, effort: "max" }).providerOptions).toEqual({
      openrouter: { reasoningEffort: "high" },
    });
  });

  it("lets a request-level effort override the profile effort", () => {
    const profile: ProviderProfile = {
      id: "or-acme-x",
      type: "openrouter",
      model: "acme/x",
      label: "Acme X",
      effort: "low",
    };
    expect(resolveModel(profile, "high").providerOptions).toEqual({
      openrouter: { reasoningEffort: "high" },
    });
  });

  it("throws when an openai-compatible profile has no baseUrl", () => {
    const profile = {
      id: "broken",
      type: "openai-compatible",
      model: "x",
      label: "Broken",
    } as ProviderProfile;
    expect(() => resolveModel(profile)).toThrow(/baseUrl/i);
  });
});
