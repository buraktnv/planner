import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { clearCatalogCache, fetchCatalog, isCatalogSource } from "../catalog";

const OPENROUTER_PAYLOAD = {
  data: [
    {
      id: "acme/model-b",
      name: "Acme: Model B",
      context_length: 128000,
      pricing: { prompt: "0.000001", completion: "0.000004" },
      supported_parameters: ["tools", "reasoning", "temperature"],
    },
    {
      id: "acme/model-a:free",
      name: "Acme: Model A (free)",
      context_length: 32768,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools"],
    },
    { name: "no id here" },
  ],
};

const DEEPSEEK_PAYLOAD = {
  object: "list",
  data: [{ id: "fake-chat", object: "model" }, { id: "fake-reasoner", object: "model" }],
};

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearCatalogCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  delete process.env.DEEPSEEK_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCatalogCache();
  delete process.env.DEEPSEEK_API_KEY;
});

describe("fetchCatalog — openrouter", () => {
  it("maps ids, names, context, prices per million and the reasoning flag", async () => {
    fetchMock.mockResolvedValue(jsonResponse(OPENROUTER_PAYLOAD));
    const result = await fetchCatalog("openrouter");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.anything(),
    );
    expect(result.error).toBeUndefined();
    expect(result.models).toHaveLength(2);
    const b = result.models[0];
    expect(b).toMatchObject({
      id: "acme/model-b",
      name: "Acme: Model B",
      source: "openrouter",
      contextLength: 128000,
      reasoning: true,
    });
    expect(b.promptPrice).toBeCloseTo(1, 6);
    expect(b.completionPrice).toBeCloseTo(4, 6);
    expect(result.models[1]).toMatchObject({ promptPrice: 0, reasoning: false });
  });

  it("caches per source and honours refresh", async () => {
    fetchMock.mockResolvedValue(jsonResponse(OPENROUTER_PAYLOAD));
    await fetchCatalog("openrouter");
    await fetchCatalog("openrouter");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await fetchCatalog("openrouter", { refresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a non-ok response as an error instead of throwing", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false, 502));
    const result = await fetchCatalog("openrouter");
    expect(result.models).toEqual([]);
    expect(result.error).toMatch(/502/);
  });

  it("turns a network failure into an error result", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const result = await fetchCatalog("openrouter");
    expect(result.models).toEqual([]);
    expect(result.error).toBe("offline");
  });
});

describe("fetchCatalog — deepseek", () => {
  it("returns an error and no models when the key is missing", async () => {
    const result = await fetchCatalog("deepseek");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.models).toEqual([]);
    expect(result.error).toBe("DEEPSEEK_API_KEY not set");
  });

  it("treats an empty key as missing", async () => {
    process.env.DEEPSEEK_API_KEY = "";
    const result = await fetchCatalog("deepseek");
    expect(result.error).toBe("DEEPSEEK_API_KEY not set");
  });

  it("maps the model list and sends a bearer header when the key is set", async () => {
    process.env.DEEPSEEK_API_KEY = "fake-key";
    fetchMock.mockResolvedValue(jsonResponse(DEEPSEEK_PAYLOAD));
    const result = await fetchCatalog("deepseek");
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://api.deepseek.com/models");
    expect(init.headers.authorization).toBe("Bearer fake-key");
    expect(result.models).toEqual([
      { id: "fake-chat", name: "fake-chat", source: "deepseek", reasoning: false },
      { id: "fake-reasoner", name: "fake-reasoner", source: "deepseek", reasoning: true },
    ]);
  });

  it("does not cache an error result", async () => {
    const first = await fetchCatalog("deepseek");
    expect(first.error).toBeTruthy();
    process.env.DEEPSEEK_API_KEY = "fake-key";
    fetchMock.mockResolvedValue(jsonResponse(DEEPSEEK_PAYLOAD));
    const second = await fetchCatalog("deepseek");
    expect(second.error).toBeUndefined();
    expect(second.models).toHaveLength(2);
  });
});

describe("isCatalogSource", () => {
  it("accepts only the two known sources", () => {
    expect(isCatalogSource("openrouter")).toBe(true);
    expect(isCatalogSource("deepseek")).toBe(true);
    expect(isCatalogSource("anthropic")).toBe(false);
  });
});
