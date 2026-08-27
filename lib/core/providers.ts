import fs from "node:fs/promises";
import path from "node:path";
import { providersPath } from "./paths";
import type { ProvidersFile, ProviderType } from "./types";

const VALID_TYPES: ProviderType[] = [
  "claude-subscription",
  "anthropic-api",
  "openai-compatible",
];

const PROFILE_KEYS = new Set([
  "id",
  "type",
  "model",
  "label",
  "baseUrl",
  "apiKeyEnv",
]);

export function defaultProviders(): ProvidersFile {
  return { profiles: [], default: "" };
}

export async function getProviders(): Promise<ProvidersFile> {
  try {
    const raw = await fs.readFile(providersPath(), "utf8");
    return JSON.parse(raw) as ProvidersFile;
  } catch {
    return defaultProviders();
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): v is string {
  return typeof v === "string";
}

export function validateProviders(p: unknown): ProvidersFile {
  if (!isRecord(p)) {
    throw new Error("Providers file must be an object");
  }
  const keys = Object.keys(p);
  if (keys.length !== 2 || !("profiles" in p) || !("default" in p)) {
    throw new Error("Providers file has unknown or missing keys");
  }
  const profiles = p.profiles;
  const def = p.default;
  if (!Array.isArray(profiles)) {
    throw new Error("profiles must be an array");
  }
  if (!asString(def)) {
    throw new Error("default must be a string");
  }
  const seen = new Set<string>();
  for (const entry of profiles) {
    if (!isRecord(entry)) {
      throw new Error("Each profile must be an object");
    }
    const pkeys = Object.keys(entry);
    for (const k of pkeys) {
      if (!PROFILE_KEYS.has(k)) {
        throw new Error(`Unknown profile key: ${k}`);
      }
    }
    if (!asString(entry.id) || entry.id.trim() === "") {
      throw new Error("Each profile requires a non-empty id");
    }
    if (seen.has(entry.id)) {
      throw new Error(`Duplicate profile id: ${entry.id} (ids must be unique)`);
    }
    seen.add(entry.id);
    if (!asString(entry.type) || !VALID_TYPES.includes(entry.type as ProviderType)) {
      throw new Error(`Invalid profile type: ${String(entry.type)}`);
    }
    if (!asString(entry.model) || entry.model.trim() === "") {
      throw new Error(`Profile ${entry.id} requires a non-empty model`);
    }
    if (!asString(entry.label) || entry.label.trim() === "") {
      throw new Error(`Profile ${entry.id} requires a non-empty label`);
    }
    const type = entry.type as ProviderType;
    if (type === "openai-compatible") {
      if (!asString(entry.baseUrl) || entry.baseUrl.trim() === "") {
        throw new Error(`openai-compatible profile ${entry.id} requires a non-empty baseUrl`);
      }
    }
    if ("apiKeyEnv" in entry && !asString(entry.apiKeyEnv)) {
      throw new Error(`Profile ${entry.id} apiKeyEnv must be a string`);
    }
    if ("baseUrl" in entry && !asString(entry.baseUrl)) {
      throw new Error(`Profile ${entry.id} baseUrl must be a string`);
    }
  }
  if (def !== "" && !seen.has(def)) {
    throw new Error(`default references unknown profile id: ${def}`);
  }
  if (def === "" && profiles.length > 0) {
    throw new Error("default must reference a profile id when profiles exist");
  }
  return p as unknown as ProvidersFile;
}

export async function saveProviders(p: ProvidersFile): Promise<void> {
  const validated = validateProviders(p);
  await fs.mkdir(path.dirname(providersPath()), { recursive: true });
  await fs.writeFile(
    providersPath(),
    JSON.stringify(validated, null, 2) + "\n",
    "utf8",
  );
}
