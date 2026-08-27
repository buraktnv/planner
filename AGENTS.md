# AGENTS.md — Planner

Local-first planner web app: tracks dev projects and life areas via markdown + git, surfaces "what to do next and why", and integrates AI (web chat with tool calls, MCP server for coding agents).

Spec: `docs/superpowers/specs/2026-08-27-planner-design.md`

## Two-repo layout

- This repo (`planner`): app code only. May become public/open source later — **never commit personal data here**.
- `planner-data` repo: all user data (markdown). Path configured via `PLANNER_DATA_DIR` env var (default `../planner-data`). Git auto-commits happen there, not here.

## Commands

```bash
npm run dev          # dev server on :3000
npm run build        # production build
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm test             # vitest run (all tests)
npx vitest run lib/core/schema.test.ts   # single test file
```

All of `lint`, `typecheck`, `test` must pass before considering any change done.

## Architecture rules (non-negotiable)

1. **All data access goes through `lib/core`.** No other code reads or writes the data directory. `app/` routes and components call `lib/core` functions. The future MCP server will wrap `lib/core` too — keep it the single gateway.
2. **AI tools call `lib/core` only.** Tool definitions live near the chat route but their implementations delegate to `lib/core`.
3. **Data root comes from `PLANNER_DATA_DIR`** (resolved in one place in `lib/core`). No hardcoded paths to the data repo.
4. **Secrets only in `.env.local`** (never committed, never written into data files). Provider profiles reference env var names via `apiKeyEnv`, not raw keys.
5. **Every data mutation** goes through `lib/core` write functions, which append a journal entry and git-commit in the data repo. Do not bypass.
6. Test fixtures use generic fake data, never real personal data.

## Data schema quick reference

- Charter files (`projects/<slug>.md`, `areas/<slug>.md`): YAML frontmatter (`id`, `name`, `type`, `status`, `priority`, `mvp`, `repo`, `created`, `updated`) + body sections `## Why`, `## MVP scope`, `## Parking lot`
- Task lines (fixed grammar, parsed by `lib/core/schema.ts`):
  `- [ ] T-007 | M | Title | created:2026-08-27`, subtasks indented with dotted ids (`T-007.1`), done: `- [x] ... | done:2026-08-27`; sections `## Backlog` / `## In progress` / `## Done`
- Journal: `journal/YYYY-MM-DD.md`, appended lines `- HH:mm [project] message`
- Full contract: `CLAUDE.md` in the `planner-data` repo

## Conventions

- Next.js 15 App Router; server components by default, `"use client"` only when needed
- TypeScript strict; no `any` without a reason
- Tailwind for all styling; no CSS files, no CSS-in-JS
- No code comments unless explicitly requested
- Before adding any dependency, check `package.json` and prefer what is already there
- Approved libraries: `ai` (Vercel AI SDK), `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`, `@anthropic-ai/claude-agent-sdk`, `recharts`, `gray-matter`, `simple-git`, `vitest`
- Components: small, one purpose per file; page-specific components colocated under `app/<route>/`

## Testing

- `lib/core` changes require tests in `lib/core/__tests__/` (vitest)
- Markdown round-trip is the highest-risk code: parse → serialize → parse must be identity
- Malformed task lines must throw clear errors, never silently corrupt

## Definition of done

`npm run lint && npm run typecheck && npm test` all green, rules above respected.
