import { describe, it, expect } from "vitest";
import { resolveModel } from "../providers";
import type { ProviderProfile } from "../../core/types";

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
});
