import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import type { ProvidersFile } from "../types";

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-providers-"));
  process.env.PLANNER_DATA_DIR = tmp;
  const git = simpleGit(tmp);
  await git.init();
  await git.addConfig("user.name", "test");
  await git.addConfig("user.email", "test@example.com");
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

function validFile(): ProvidersFile {
  return {
    profiles: [
      { id: "claude-sub", type: "claude-subscription", model: "sonnet", label: "Claude" },
      {
        id: "deepseek",
        type: "openai-compatible",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        label: "DeepSeek",
      },
    ],
    default: "claude-sub",
  };
}

describe("providers", () => {
  it("getProviders returns a safe default when the file is missing", async () => {
    const { getProviders } = await import("../providers");
    const file = await getProviders();
    expect(file).toEqual({ profiles: [], default: "" });
  });

  it("saveProviders then getProviders round-trips valid data", async () => {
    const { getProviders, saveProviders } = await import("../providers");
    await saveProviders(validFile());
    const file = await getProviders();
    expect(file.profiles).toHaveLength(2);
    expect(file.default).toBe("claude-sub");
    const raw = await fs.readFile(path.join(tmp, "providers.json"), "utf8");
    expect(raw).toBe(JSON.stringify(validFile(), null, 2) + "\n");
  });

  it("saveProviders throws on duplicate ids", async () => {
    const { saveProviders } = await import("../providers");
    const dup = validFile();
    dup.profiles[1].id = "claude-sub";
    await expect(saveProviders(dup)).rejects.toThrow(/duplicate|unique/i);
  });

  it("saveProviders throws when openai-compatible lacks baseUrl", async () => {
    const { saveProviders } = await import("../providers");
    const bad = validFile();
    delete (bad.profiles[1] as unknown as Record<string, unknown>).baseUrl;
    await expect(saveProviders(bad)).rejects.toThrow(/baseUrl/i);
  });

  it("saveProviders throws when default is not an existing profile id", async () => {
    const { saveProviders } = await import("../providers");
    const bad = validFile();
    bad.default = "nonexistent";
    await expect(saveProviders(bad)).rejects.toThrow(/default/i);
  });

  it("saveProviders throws on unknown type", async () => {
    const { saveProviders } = await import("../providers");
    const bad = validFile();
    (bad.profiles[0] as unknown as Record<string, unknown>).type = "bogus";
    await expect(saveProviders(bad)).rejects.toThrow(/type/i);
  });

  it("saveProviders throws on unknown keys", async () => {
    const { saveProviders } = await import("../providers");
    const bad = validFile();
    (bad.profiles[0] as unknown as Record<string, unknown>).secret = "x";
    await expect(saveProviders(bad)).rejects.toThrow(/unknown|key/i);
  });

  it("saveProviders throws when default references empty but profiles exist", async () => {
    const { saveProviders } = await import("../providers");
    const bad = validFile();
    bad.default = "";
    await expect(saveProviders(bad)).rejects.toThrow(/default/i);
  });
  it("validates the openrouter and deepseek types with a derived id and effort", async () => {
    const { getProviders, saveProviders, favouriteId } = await import("../providers");
    const file: ProvidersFile = {
      profiles: [
        {
          id: favouriteId("openrouter", "acme/model-x.1"),
          type: "openrouter",
          model: "acme/model-x.1",
          label: "Acme Model X.1",
          effort: "medium",
        },
        {
          id: favouriteId("deepseek", "fake-chat"),
          type: "deepseek",
          model: "fake-chat",
          label: "Fake Chat",
          effort: "max",
        },
      ],
      default: "or-acme-model-x-1",
    };
    await saveProviders(file);
    const back = await getProviders();
    expect(back.profiles.map((p) => p.id)).toEqual(["or-acme-model-x-1", "ds-fake-chat"]);
    expect(back.profiles[1].effort).toBe("max");
  });

  it("derives favourite ids by slugifying the model id", async () => {
    const { favouriteId, slugifyModelId } = await import("../providers");
    expect(favouriteId("openrouter", "openai/GPT-5.6 Terra")).toBe("or-openai-gpt-5-6-terra");
    expect(favouriteId("deepseek", "deepseek-v4-pro")).toBe("ds-deepseek-v4-pro");
    expect(slugifyModelId("--Weird__Name!!")).toBe("weird-name");
  });

  it("rejects baseUrl on the fixed types", async () => {
    const { saveProviders } = await import("../providers");
    const bad: ProvidersFile = {
      profiles: [
        {
          id: "or-x",
          type: "openrouter",
          model: "acme/x",
          label: "X",
          baseUrl: "https://example.test/v1",
        },
      ],
      default: "or-x",
    };
    await expect(saveProviders(bad)).rejects.toThrow(/baseUrl/i);
  });

  it("rejects an effort outside the enum", async () => {
    const { saveProviders } = await import("../providers");
    const bad = validFile();
    (bad.profiles[0] as unknown as Record<string, unknown>).effort = "ludicrous";
    await expect(saveProviders(bad)).rejects.toThrow(/effort/i);
  });

  it("accepts every effort level", async () => {
    const { saveProviders } = await import("../providers");
    for (const effort of ["low", "medium", "high", "xhigh", "max"] as const) {
      const file = validFile();
      file.profiles[0].effort = effort;
      await expect(saveProviders(file)).resolves.toBeUndefined();
    }
  });

  it("PROVIDER_PRESETS is the single source of fixed base urls and env names", async () => {
    const { PROVIDER_PRESETS, presetFor, apiKeyEnvOf } = await import("../providers");
    expect(PROVIDER_PRESETS.openrouter.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(PROVIDER_PRESETS.deepseek.baseUrl).toBe("https://api.deepseek.com/v1");
    expect(presetFor("openai-compatible")).toBeNull();
    expect(apiKeyEnvOf({ type: "openrouter" })).toBe("OPENROUTER_API_KEY");
    expect(apiKeyEnvOf({ type: "deepseek" })).toBe("DEEPSEEK_API_KEY");
    expect(apiKeyEnvOf({ type: "anthropic-api" })).toBe("ANTHROPIC_API_KEY");
    expect(apiKeyEnvOf({ type: "anthropic-api", apiKeyEnv: "OTHER_KEY" })).toBe("OTHER_KEY");
    expect(apiKeyEnvOf({ type: "claude-subscription" })).toBeNull();
  });
});
