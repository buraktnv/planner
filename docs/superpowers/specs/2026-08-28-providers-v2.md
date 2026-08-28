# Providers v2 — model catalog, favourites, effort

Decisions from the owner: Claude Opus 5 at medium effort via the subscription; OpenRouter as the main pay-per-use source with the **full** model list (GPT models included); DeepSeek's direct API as a second source (prepaid balance); models are **favourited** from a catalog rather than typed by hand; effort is chosen per favourite and can be flipped in the chat rail. `anthropic-api` stays supported but gets no new UI.

All rules in `AGENTS.md` apply: secrets only in `.env.local` (profiles reference env var *names*), every write through `lib/core`, tests for the parser/validator, fake data in fixtures.

## Data: `providers.json` (in the data repo)

Additive, backward-compatible. A favourite **is** a profile — nothing else needs to learn a new concept.

```json
{
  "profiles": [
    { "id": "claude-sub", "type": "claude-subscription", "model": "opus", "label": "Claude Opus 5", "effort": "medium" },
    { "id": "or-gpt-5-6-terra", "type": "openrouter", "model": "openai/gpt-5.6-terra", "label": "GPT-5.6 Terra", "effort": "medium" },
    { "id": "ds-v4-pro", "type": "deepseek", "model": "deepseek-v4-pro", "label": "DeepSeek V4 Pro", "effort": "high" },
    { "id": "deepseek", "type": "openai-compatible", "baseUrl": "https://api.deepseek.com/v1", "model": "deepseek-chat", "apiKeyEnv": "DEEPSEEK_API_KEY", "label": "DeepSeek" }
  ],
  "default": "claude-sub"
}
```

- New `ProviderType` values: `openrouter`, `deepseek`. Both are OpenAI-compatible under the hood with a **fixed** base URL (`https://openrouter.ai/api/v1`, `https://api.deepseek.com/v1`) and a default `apiKeyEnv` (`OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`) that a profile may override. `baseUrl` is rejected on these types.
- New optional profile key `effort`: `"low" | "medium" | "high" | "xhigh" | "max"`. Absent = provider default (no effort parameter sent). Validation rejects anything else.
- `id` for favourites is derived: `or-` / `ds-` + slugified model id; `label` defaults to the catalog's display name. Existing `openai-compatible` and `anthropic-api` profiles keep working unchanged.
- `lib/core/types.ts` gains `ProviderEffort`; `lib/core/providers.ts` validates the new keys; add `PROVIDER_PRESETS` (baseUrl + apiKeyEnv per fixed type) in `lib/core/providers.ts` so it is the single source of truth.
- Fix: `anthropic-api` must honour `apiKeyEnv` (fall back to `ANTHROPIC_API_KEY`).

## Effort passthrough (`lib/ai/providers.ts`, `lib/ai/claude-sdk.ts`, `app/api/chat/route.ts`)

- Request body gains optional `effort` (validated) that overrides the profile's `effort` for that message.
- Claude subscription: pass `effort` into the Agent SDK `query()` options (`Options.effort`, verified in `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`).
- `anthropic-api`: `providerOptions: { anthropic: { effort } }`.
- `openrouter` / `deepseek` / `openai-compatible`: `providerOptions: { [providerName]: { reasoningEffort: effort } }` — `reasoningEffort` exists on `@ai-sdk/openai-compatible`. Map `xhigh`/`max` → `high` for these, since OpenAI-style APIs only know low/medium/high. OpenRouter also wants `HTTP-Referer` and `X-Title` headers — set them via `createOpenAICompatible({ headers })` (`X-Title: Planner`, referer `http://localhost:3000`).
- `resolveModel` returns `{ model, providerOptions }` so the route stays dumb.

## Catalog (`lib/core/catalog.ts`, `app/api/models/route.ts`)

- `fetchCatalog(source: "openrouter" | "deepseek")` → `CatalogModel[] = { id, name, source, contextLength?, promptPrice?, completionPrice?, reasoning: boolean }`.
  - OpenRouter: public `GET https://openrouter.ai/api/v1/models` (no key needed); `reasoning` = `supported_parameters` includes `"reasoning"`; prices are per-token strings → convert to $/M.
  - DeepSeek: `GET https://api.deepseek.com/models` with `Authorization: Bearer ${process.env.DEEPSEEK_API_KEY}`; no prices; if the key is missing, return `{ models: [], error: "DEEPSEEK_API_KEY not set" }` rather than throwing.
  - Cache in memory for 1 hour per source (module-level map); `?refresh=1` bypasses. This is a read of an external API, not of the data dir, so it may live in `lib/core` without a journal entry.
- `GET /api/models?source=openrouter|deepseek[&q=…]` → `{ models, error?, fetchedAt }`. Filtering by `q` (substring on id and name) is done server-side so the client never holds 400 models... actually do hold them: 400 rows is small — return the full list and filter on the client so search is instant.

## Settings UI (`app/settings/*`)

Replace the "one form per profile" flow with three panels, in the existing Momentum styling (`components/momentum/primitives.tsx`):

1. **Sources** — one row per source (Claude subscription, OpenRouter, DeepSeek, plus any existing custom `openai-compatible` / `anthropic-api` profiles): connected pill when the env var is set (`process.env[apiKeyEnv] !== undefined`, evaluated server-side, never the value), the env var name to set, and for the subscription a model pick between `opus` / `sonnet` / `haiku` + effort.
2. **Catalog** — tabs OpenRouter / DeepSeek, a search input, and a virtual-less list (400 rows is fine) showing `name`, mono `id`, context (k), `$in/$out per M`, a `reasoning` dot; a ★ toggle per row that creates/removes the favourite profile. Sorting: favourites first, then by id. Filter chips: **GPT** (`openai/`), **Claude** (`anthropic/`), **Gemini**, **DeepSeek**, **Free** (`:free` or 0 price), **Reasoning**.
3. **Favourites** — the profiles list as it is today (label, type, model, effort select, default radio, delete). Effort select writes through `saveProviders`.

All writes go through the existing `/api/providers` route (extend PATCH/POST as needed); the route stays the only writer and calls `saveProviders`.

## Chat rail (`components/momentum/chat-rail.tsx`)

- The provider picker in Inspect-context lists favourites with a small effort pill; the pill cycles low → medium → high (→ xhigh → max only for Claude types) and sends `effort` with the next request. The chosen profile + effort persist in `localStorage` (per-viewer convenience only).
- Reasoning parts: if a stream part of type `reasoning` arrives, render it collapsed as a mono "thought" line (expand on click); never crash or drop it. Check the `ai` v7 UI message part types before implementing.

## Agents page

Sources with their connection state replace the profile-per-card list; keep the "no MCP server yet" line for now (a separate spec covers MCP).

## Migration

On first load with the new code, nothing changes on disk: old files validate as-is. The owner switches the default to Opus 5 medium from Settings. Update `README.md` provider section and `docs/data-contract-additions.md` (append a "providers.json" section: new types, `effort`).

## Tests

`lib/core/__tests__/providers.test.ts`: new types validate, `baseUrl` rejected on fixed types, `effort` enum, favourites id derivation. New `lib/core/__tests__/catalog.test.ts`: OpenRouter/DeepSeek response mapping with `fetch` mocked, missing-key path, cache + refresh. `lib/ai/__tests__/providers.test.ts`: `resolveModel` produces the right providerOptions per type and clamps effort for OpenAI-style APIs.
