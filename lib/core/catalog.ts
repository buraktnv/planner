import type { CatalogModel } from "./types";
import { PROVIDER_PRESETS } from "../ui/providers";

export type CatalogSource = "openrouter" | "deepseek";

export interface CatalogResult {
  models: CatalogModel[];
  error?: string;
  fetchedAt: number;
}

const TTL_MS = 60 * 60 * 1000;

const cache = new Map<CatalogSource, CatalogResult>();

export function clearCatalogCache(): void {
  cache.clear();
}

function perMillion(price: unknown): number | undefined {
  if (typeof price !== "string" && typeof price !== "number") return undefined;
  const n = typeof price === "number" ? price : Number.parseFloat(price);
  if (!Number.isFinite(n)) return undefined;
  return n * 1_000_000;
}

interface OpenRouterModel {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
  supported_parameters?: unknown;
}

function mapOpenRouter(payload: unknown): CatalogModel[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const models: CatalogModel[] = [];
  for (const raw of data as OpenRouterModel[]) {
    if (typeof raw?.id !== "string") continue;
    const params = Array.isArray(raw.supported_parameters)
      ? (raw.supported_parameters as unknown[])
      : [];
    models.push({
      id: raw.id,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name : raw.id,
      source: "openrouter",
      contextLength: typeof raw.context_length === "number" ? raw.context_length : undefined,
      promptPrice: perMillion(raw.pricing?.prompt),
      completionPrice: perMillion(raw.pricing?.completion),
      reasoning: params.includes("reasoning"),
    });
  }
  return models;
}

function mapDeepSeek(payload: unknown): CatalogModel[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const models: CatalogModel[] = [];
  for (const raw of data as { id?: unknown }[]) {
    if (typeof raw?.id !== "string") continue;
    models.push({
      id: raw.id,
      name: raw.id,
      source: "deepseek",
      reasoning: /reason|r1|think/i.test(raw.id),
    });
  }
  return models;
}

async function loadOpenRouter(): Promise<CatalogResult> {
  const res = await fetch(`${PROVIDER_PRESETS.openrouter.baseUrl}/models`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    return { models: [], error: `OpenRouter returned ${res.status}`, fetchedAt: Date.now() };
  }
  const payload = (await res.json()) as unknown;
  return { models: mapOpenRouter(payload), fetchedAt: Date.now() };
}

async function loadDeepSeek(): Promise<CatalogResult> {
  const key = process.env[PROVIDER_PRESETS.deepseek.apiKeyEnv];
  if (!key) {
    return {
      models: [],
      error: `${PROVIDER_PRESETS.deepseek.apiKeyEnv} not set`,
      fetchedAt: Date.now(),
    };
  }
  const res = await fetch("https://api.deepseek.com/models", {
    headers: { accept: "application/json", authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    return { models: [], error: `DeepSeek returned ${res.status}`, fetchedAt: Date.now() };
  }
  const payload = (await res.json()) as unknown;
  return { models: mapDeepSeek(payload), fetchedAt: Date.now() };
}

export async function fetchCatalog(
  source: CatalogSource,
  opts: { refresh?: boolean } = {},
): Promise<CatalogResult> {
  const cached = cache.get(source);
  if (!opts.refresh && cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached;
  }
  let result: CatalogResult;
  try {
    result = source === "openrouter" ? await loadOpenRouter() : await loadDeepSeek();
  } catch (e) {
    return {
      models: [],
      error: e instanceof Error ? e.message : "Could not reach the catalog",
      fetchedAt: Date.now(),
    };
  }
  if (!result.error) cache.set(source, result);
  return result;
}

export function isCatalogSource(v: unknown): v is CatalogSource {
  return v === "openrouter" || v === "deepseek";
}
