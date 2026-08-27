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
  await fs.rm(tmp, { recursive: true, force: true });
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
});
