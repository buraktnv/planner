# Planner MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local-first planner web app: markdown+git data layer, project/area/task tracking, journal, Today/Next, Insights, and AI chat with actions (Claude subscription, Anthropic API, OpenAI-compatible providers).

**Architecture:** All data access goes through `lib/core` (parse/serialize, CRUD, journal, git auto-commit). Next.js App Router pages and API routes call `lib/core` only. AI chat route defines tools whose implementations delegate to `lib/core`; provider adapters translate between AI SDK `streamText` (OpenAI-compatible, Anthropic) and the Claude Agent SDK (subscription auth). Data lives in the separate `planner-data` repo, located via `PLANNER_DATA_DIR`.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Tailwind CSS, Vercel AI SDK v5 (`ai`, `@ai-sdk/react`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible`), `@anthropic-ai/claude-agent-sdk`, Recharts, gray-matter, simple-git, zod, Vitest.

## Global Constraints

- Data schema contract is authoritative: `planner-data/CLAUDE.md` (task line grammar, charter shape, journal format)
- Never read/write data files outside `lib/core`
- Data root resolved from `PLANNER_DATA_DIR` env (default: `../planner-data` relative to `process.cwd()`) in ONE place only
- Secrets only in `.env.local`; provider profiles reference env var NAMES via `apiKeyEnv`
- Every data mutation appends a journal entry and git-commits in the data repo
- Test fixtures use generic fake data, never real personal data
- No code comments unless explicitly requested
- Gates for every task: `npm run lint`, `npm run typecheck`, `npm test` all green
- Commit style: `feat:`, `fix:`, `test:`, `chore:` + short description

## File Map

```
app/layout.tsx                    shell + nav
app/page.tsx                      Today/Next dashboard
app/globals.css                   Tailwind
app/projects/page.tsx             project cards
app/projects/[slug]/page.tsx      charter + task board
app/areas/page.tsx                area cards
app/areas/[slug]/page.tsx         area charter + tasks
app/journal/page.tsx              journal timeline
app/insights/page.tsx             charts + AI weekly analysis
app/chat/page.tsx                 AI chat
app/settings/page.tsx             provider profiles
app/api/chat/route.ts             streaming chat (all providers)
app/api/projects/route.ts         CRUD projects
app/api/projects/[slug]/tasks/route.ts    task CRUD
app/api/areas/route.ts            CRUD areas
app/api/areas/[slug]/tasks/route.ts
app/api/about/route.ts            get/save about.md
app/api/providers/route.ts        get/save providers.json
lib/core/types.ts                 shared types
lib/core/paths.ts                 data root resolution
lib/core/schema.ts                charter + task parse/serialize
lib/core/journal.ts               journal append
lib/core/git.ts                   auto-commit in data repo
lib/core/store.ts                 CRUD orchestration (journal + commit)
lib/core/insights.ts              stats computation
lib/core/providers.ts             providers.json read/validate
lib/core/__tests__/*.test.ts      vitest tests
lib/ai/tools.ts                   tool implementations (provider-agnostic)
lib/ai/providers.ts               AI SDK model factory per provider type
lib/ai/context.ts                 build system context from data
lib/ai/claude-sdk.ts              Agent SDK chat adapter (subscription)
components/                       shared UI components
```

---

### Task 1: Scaffold Next.js app

**Files:**
- Create: Next.js app at repo root via create-next-app
- Modify: `package.json` (scripts), `vitest.config.ts`
- Create: `.env.local.example`, `.env.local`

- [ ] **Step 1: Scaffold**

```bash
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --yes
```

If it refuses the non-empty directory: scaffold into `C:\Users\user\AppData\Local\Temp\opencode\planner-scaffold`, then copy everything except `.git`, `docs`, `AGENTS.md`, `CLAUDE.md` into the repo root.

- [ ] **Step 2: Install dependencies**

```bash
npm i ai @ai-sdk/react @ai-sdk/anthropic @ai-sdk/openai-compatible @anthropic-ai/claude-agent-sdk recharts gray-matter simple-git zod
npm i -D vitest
```

- [ ] **Step 3: Add scripts to package.json**

```json
"typecheck": "tsc --noEmit",
"test": "vitest run"
```

- [ ] **Step 4: vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/__tests__/**/*.test.ts"] },
});
```

- [ ] **Step 5: .env.local.example (committed) and .env.local (git-ignored)**

```
PLANNER_DATA_DIR=../planner-data
CLAUDE_CODE_OAUTH_TOKEN=
ANTHROPIC_API_KEY=
DEEPSEEK_API_KEY=
```

- [ ] **Step 6: Verify**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: lint + typecheck pass; vitest exits "No test files found" is NOT acceptable — create `lib/core/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Also start `npm run dev` once and confirm http://localhost:3000 renders, then stop it.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js 15 app with tooling"
```

---

### Task 2: Core types + data root resolution

**Files:**
- Create: `lib/core/types.ts`, `lib/core/paths.ts`
- Test: `lib/core/__tests__/paths.test.ts`

**Interfaces:**
- Produces: `Charter`, `Task`, `ProviderProfile`, `ProvidersFile` types; `dataRoot(): string`, `charterPath(type, slug)`, `tasksPath(type, slug)`, `journalPath(date)`, `aboutPath()`, `providersPath()`

- [ ] **Step 1: Write types.ts**

```ts
export type ProjectType = "project" | "area";
export type ProjectStatus = "active" | "paused" | "done" | "abandoned";
export type TaskSize = "S" | "M" | "L";
export type TaskSection = "backlog" | "in-progress" | "done";

export interface Charter {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  priority: number;
  mvp?: string;
  repo?: string;
  created: string;
  updated: string;
  why: string;
  mvpScope: string[];
  parkingLot: string[];
}

export interface Task {
  id: string;
  title: string;
  size: TaskSize;
  done: boolean;
  section: TaskSection;
  created?: string;
  doneDate?: string;
  est?: string;
  due?: string;
  parentId?: string | null;
}

export type ProviderType = "claude-subscription" | "anthropic-api" | "openai-compatible";

export interface ProviderProfile {
  id: string;
  type: ProviderType;
  model: string;
  label: string;
  baseUrl?: string;
  apiKeyEnv?: string;
}

export interface ProvidersFile {
  profiles: ProviderProfile[];
  default: string;
}
```

- [ ] **Step 2: Write failing test paths.test.ts**

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import path from "node:path";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dataRoot", () => {
  it("uses PLANNER_DATA_DIR when set", async () => {
    vi.stubEnv("PLANNER_DATA_DIR", "C:/tmp/custom-data");
    const { dataRoot } = await import("../paths");
    expect(dataRoot()).toBe("C:/tmp/custom-data");
  });
});
```

Note: `paths.ts` must read env lazily inside `dataRoot()` (not at module load) for this test to work. Use `vi.resetModules()` inside the test if needed.

- [ ] **Step 3: Run test, verify it fails** (module not found)
- [ ] **Step 4: Implement paths.ts**

```ts
import path from "node:path";

export function dataRoot(): string {
  const dir = process.env.PLANNER_DATA_DIR;
  return dir ? path.resolve(dir) : path.resolve(process.cwd(), "..", "planner-data");
}

export function projectsDir() { return path.join(dataRoot(), "projects"); }
export function areasDir() { return path.join(dataRoot(), "areas"); }
export function charterPath(type: "project" | "area", slug: string) {
  return path.join(type === "project" ? projectsDir() : areasDir(), `${slug}.md`);
}
export function tasksPath(type: "project" | "area", slug: string) {
  return path.join(type === "project" ? projectsDir() : areasDir(), slug, "tasks.md");
}
export function journalPath(date: string) { return path.join(dataRoot(), "journal", `${date}.md`); }
export function aboutPath() { return path.join(dataRoot(), "about.md"); }
export function providersPath() { return path.join(dataRoot(), "providers.json"); }
```

- [ ] **Step 5: Run test, verify pass**
- [ ] **Step 6: Gates + commit**

```bash
npm run lint && npm run typecheck && npm test
git add -A && git commit -m "feat(core): shared types and data root resolution"
```

---

### Task 3: Charter parse/serialize (round-trip)

**Files:**
- Create: `lib/core/schema.ts` (charter part), tests `lib/core/__tests__/charter.test.ts`

**Interfaces:**
- Produces: `parseCharter(raw: string): Charter`, `serializeCharter(c: Charter): string`

- [ ] **Step 1: Write failing tests**

Cover: full charter parses (frontmatter fields, why text, mvp scope checkboxes, parking lot bullets); round-trip identity (`serializeCharter(parseCharter(raw)) === raw` normalized to LF); missing `## Why` throws `CharterParseError` with clear message; area without mvp parses; unknown frontmatter key throws.

```ts
import { describe, expect, it } from "vitest";
import { parseCharter, serializeCharter } from "../schema";

const RAW = `---
id: demo
name: Demo
type: project
status: active
priority: 1
mvp: "Ship the thing"
repo: ../demo
created: 2026-08-27
updated: 2026-08-27
---

## Why
Because reasons.
Second line.

## MVP scope
- [ ] first item
- [x] second item

## Parking lot
- later idea
`;

describe("parseCharter", () => {
  it("parses all fields", () => {
    const c = parseCharter(RAW);
    expect(c.id).toBe("demo");
    expect(c.type).toBe("project");
    expect(c.mvp).toBe("Ship the thing");
    expect(c.why).toBe("Because reasons.\nSecond line.");
    expect(c.mvpScope).toEqual(["- [ ] first item", "- [x] second item"]);
    expect(c.parkingLot).toEqual(["- later idea"]);
  });

  it("round-trips identically", () => {
    expect(serializeCharter(parseCharter(RAW))).toBe(RAW);
  });

  it("throws on missing Why section", () => {
    expect(() => parseCharter(RAW.replace("## Why", "## Nope"))).toThrow(/Why/);
  });
});
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement**

Parse with `gray-matter`. Frontmatter validation: required keys `id,name,type,status,priority,created,updated`; `type` in {project,area}; `status` in enum; `priority` number; optional `mvp` (required for type=project), `repo`. Reject unknown keys (throw listing them). Body: split lines; find `## Why`, `## MVP scope`, `## Parking lot` headings; collect lines under each (trimmed of trailing blank lines); any other `##` heading throws `CharterParseError("Unknown section ...")`. `mvpScope`/`parkingLot` keep raw bullet lines including checkbox markup.

Serialize: rebuild frontmatter with gray-matter stringifier is NOT safe for key order — hand-build the YAML block in fixed key order (`id,name,type,status,priority,mvp,repo,created,updated`, skipping absent optionals), quote strings containing special chars with `JSON.stringify`, then append sections exactly:

```
## Why\n<why>\n\n## MVP scope\n<lines>\n\n## Parking lot\n<lines>\n
```

Export `class CharterParseError extends Error`.

- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Gates + commit** `test(core): charter parse/serialize round-trip`

---

### Task 4: Task grammar parse/serialize (round-trip)

**Files:**
- Modify: `lib/core/schema.ts` (tasks part)
- Test: `lib/core/__tests__/tasks.test.ts`

**Interfaces:**
- Produces: `parseTasks(raw: string): Task[]`, `serializeTasks(tasks: Task[]): string`, `nextTaskId(tasks: Task[]): string`

Grammar (authoritative, matches `planner-data/CLAUDE.md`):

```
- [ ] T-007 | M | Title | created:2026-08-27
- [x] T-001 | S | Title | done:2026-08-25
  - [ ] T-007.1 | S | Subtask | created:2026-08-27
```

Sections `## Backlog`, `## In progress`, `## Done` in exactly that order. Fields after title: `created:`, `done:`, `est:`, `due:`. Indent = 2 spaces per depth level.

- [ ] **Step 1: Write failing tests**

Cover: parses all sections into `section` values; round-trip identity; subtask gets `parentId`; malformed lines throw `TaskParseError` with line number: missing size, bad size letter, missing id, unknown field key, wrong indent (odd spaces), depth jump > 1, line before any section, duplicate id; done task must have `done:` date and live in Done; `nextTaskId` returns `T-008` after `T-007` and handles subtask-only ids.

```ts
const RAW = `## Backlog
- [ ] T-002 | M | Build chart | created:2026-08-27 | est:2h
- [ ] T-003 | L | Big thing | created:2026-08-27
  - [ ] T-003.1 | S | Part one | created:2026-08-27

## In progress
- [ ] T-001 | S | Started task | created:2026-08-26 | due:2026-09-01

## Done
- [x] T-000 | S | Old task | done:2026-08-25
`;
```

Round-trip test: `serializeTasks(parseTasks(RAW)) === RAW`.

Error test example:

```ts
it("rejects line with missing size", () => {
  const bad = RAW.replace("T-002 | M | ", "T-002 | ");
  expect(() => parseTasks(bad)).toThrow(/T-002.*size/i);
});
```

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement**

Line regex: `/^( *)- \[( |x)\] (T-\d+(?:\.\d+)*) \| (S|M|L) \| ([^|]+?)(?: \| ((?:[a-z]+:[^|]*)(?: \| [a-z]+:[^|]*)*))?\s*$/`. Split trailing fields on ` | ` and parse each as `key:value`; allowed keys: created, done, est, due; anything else throws with the line content. Depth = indent.length / 2 (must be even). Maintain a stack of open parents by depth. Section headers map: Backlog→backlog, In progress→in-progress, Done→done; anything else under `##` throws. Enforce section order (once Done starts, no Backlog lines after). Enforce: `[x]` iff section done iff has `done:`. Validate id parent prefix (subtask id must start with `${parentId}.`). Duplicate ids throw.

Serialize: emit the three section headers always (even empty), tasks grouped by `section` preserving array order, indent `parentId` chains by 2 spaces per depth.

`nextTaskId`: max numeric suffix among top-level ids (`T-NNN`), +1, zero-padded to 3 digits.

- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Gates + commit** `test(core): task grammar parse/serialize round-trip`

---

### Task 5: Journal append + git auto-commit

**Files:**
- Create: `lib/core/journal.ts`, `lib/core/git.ts`
- Test: `lib/core/__tests__/journal.test.ts`

**Interfaces:**
- Produces: `appendJournal(scope: string, message: string): Promise<void>` (scope = project/area slug or "chat"/"life"), `commitData(message: string): Promise<void>`

- [ ] **Step 1: Write failing test (journal only; git tested manually)**

Use a temp dir as fake data root (stub `PLANNER_DATA_DIR` to `fs.mkdtempSync(...)`), call `appendJournal("demo", "did a thing")`, assert file `journal/<today>.md` contains line matching `/^- \d{2}:\d{2} \[demo\] did a thing$/`; call twice, assert two lines appended.

- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement journal.ts**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { journalPath } from "./paths";

export async function appendJournal(scope: string, message: string): Promise<void> {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5);
  const file = journalPath(date);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const header = fs.access(file).then(() => "").catch(() => `# ${date}\n\n`);
  const line = `- ${time} [${scope}] ${message}\n`;
  await fs.appendFile(file, (await header) + line);
}
```

(Local-time caveat: use local date via `toLocaleDateString("sv")` and local HH:mm instead of UTC if tests span timezones — use the `sv` locale trick for both.)

- [ ] **Step 4: Implement git.ts**

```ts
import { simpleGit } from "simple-git";
import { dataRoot } from "./paths";

export async function commitData(message: string): Promise<void> {
  const git = simpleGit(dataRoot());
  if (!(await git.checkIsRepo())) {
    throw new Error(`Data root is not a git repo: ${dataRoot()}`);
  }
  await git.add("-A");
  const status = await git.status();
  if (status.staged.length || status.modified.length || status.not_added.length) {
    await git.commit(message);
  }
}
```

- [ ] **Step 5: Manual check:** run a small script that commits in a throwaway cloned temp copy of planner-data (do NOT commit junk into the real data repo during tests — point PLANNER_DATA_DIR at a temp git repo created with `git init`).
- [ ] **Step 6: Gates + commit** `feat(core): journal append and data git auto-commit`

---

### Task 6: Store CRUD

**Files:**
- Create: `lib/core/store.ts`
- Test: `lib/core/__tests__/store.test.ts`

**Interfaces (consumed by API routes and AI tools):**
- `listCharters(type?: ProjectType): Promise<Charter[]>`
- `getCharter(type, slug): Promise<Charter>` (throws if missing)
- `createCharter(input: { type, name, why, mvp?, priority? }): Promise<Charter>` (slug from name)
- `updateCharter(type, slug, patch: Partial<Pick<Charter,"name"|"status"|"priority"|"mvp"|"repo"|"why"|"mvpScope"|"parkingLot">>): Promise<Charter>`
- `listTasks(type, slug): Promise<Task[]>`
- `addTask(type, slug, input: { title, size, parentId?, est?, due? }): Promise<Task>` (auto id via `nextTaskId` or parent chain)
- `updateTask(type, slug, taskId, patch: Partial<Pick<Task,"title"|"size"|"section"|"est"|"due">> & { complete?: boolean }): Promise<Task>`
- `getAbout(): Promise<string>`, `saveAbout(md: string): Promise<void>`

Every mutation: write file → `appendJournal` → `commitData`. Journal messages: `T-007 added: <title>`, `T-007 done`, `charter created`, `charter updated`, etc.

- [ ] **Step 1: Write failing tests** against a temp data root (mkdtemp + `git init` via simple-git): create charter → file exists + parses; add task → appears in Backlog with next id; complete task → moves to Done with `done:` today + journal line + git log has 1+ commit; updateTask section move; listTasks returns [] when tasks.md missing; getCharter missing throws.
- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement store.ts** using schema.ts + journal.ts + git.ts. Slugify: lowercase, non-alphanumeric → `-`, trim. `createCharter` builds Charter with created/updated = today (local), default priority 2, empty scope/parking, writes via `serializeCharter`. `addTask` with `parentId` computes subtask id `<parent>.<next child index>`.
- [ ] **Step 4: Run tests, verify pass**
- [ ] **Step 5: Gates + commit** `feat(core): store CRUD with journal and auto-commit`

---

### Task 7: Insights computation

**Files:**
- Create: `lib/core/insights.ts`
- Test: `lib/core/__tests__/insights.test.ts`

**Interfaces:**
- `getInsights(): Promise<Insights>` where

```ts
export interface Insights {
  weeks: { weekStart: string; done: number; created: number }[];  // last 8 weeks
  perProject: { slug: string; name: string; type: ProjectType; open: number; doneTotal: number; lastActivity: string | null }[];
  stalled: { slug: string; name: string; days: number }[];       // active, no done/created task in 14d
  balance: { projects: number; areas: number };                   // tasks done last 30d
}
```

- [ ] **Step 1: Failing tests** with a seeded temp data root (create 2 charters + tasks with varied created/done dates — pass dates explicitly in fixtures): week buckets correct; stalled detection flags only the idle active project; balance counts last-30-days done tasks.
- [ ] **Step 2: Run, verify fail**
- [ ] **Step 3: Implement** — iterate all charters + tasks; week = Monday-based ISO week; lastActivity = max date among task created/doneDate.
- [ ] **Step 4: Run, verify pass**
- [ ] **Step 5: Gates + commit** `feat(core): insights computation`

---

### Task 8: App shell + navigation

**Files:**
- Modify: `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder)
- Create: `components/nav.tsx`

- [ ] **Step 1: Dark, dense, minimal Tailwind shell.** Layout: fixed left sidebar (w-56) with nav links: Today, Projects, Areas, Journal, Insights, Chat, Settings; top header shows date + focused context slot. Use `next/link`, `usePathname` (client component for active-link styling). Neutral palette: `bg-neutral-950 text-neutral-200`, accents `emerald-400`.
- [ ] **Step 2: Replace scaffold styles** — remove create-next-app demo content and fonts; keep Tailwind imports.
- [ ] **Step 3: Verify** `npm run dev`, click all links (pages show "coming soon" stubs — create stub `page.tsx` for projects, areas, journal, insights, chat, settings each exporting a simple heading).
- [ ] **Step 4: Gates + commit** `feat(ui): app shell and navigation`

---

### Task 9: Projects pages + task API

**Files:**
- Create: `app/api/projects/route.ts`, `app/api/projects/[slug]/tasks/route.ts`
- Create: `app/projects/page.tsx`, `app/projects/[slug]/page.tsx`
- Create: `components/charter-card.tsx`, `components/task-board.tsx`, `components/task-row.tsx`

**Interfaces:**
- `GET /api/projects` → `Charter[]`; `POST /api/projects` body `{name, why, mvp}` → creates
- `GET /api/projects/:slug/tasks` → `Task[]`; `POST` body `{title, size, parentId?, est?, due?}` → adds; `PATCH` body `{id, ...patch, complete?}` → updates

- [ ] **Step 1: API routes** — thin handlers calling `lib/core/store`, returning JSON; errors → 400 with `{error: message}`; revalidate tags not needed (local app, use `export const dynamic = "force-dynamic"` on pages that read data).
- [ ] **Step 2: Projects list page** (server component): cards grid, each shows name, status badge, progress bar (done/total tasks), priority, mvp line. "New project" button opens inline form (client component).
- [ ] **Step 3: Project detail page**: charter panel (Why blockquote, MVP scope checkboxes read-only, parking lot list) + task board with three columns (Backlog / In progress / Done). Task row: checkbox toggle (complete), id, size badge (S=emerald, M=amber, L=rose), title, est/due chips, indent for subtasks. Add-task input at bottom of Backlog with size selector. Actions call the API via `fetch` then `router.refresh()`.
- [ ] **Step 4: Verify with real data:** create a test project in the UI, watch planner-data repo get the file + journal line + git commit. Then delete the test files manually in planner-data and commit cleanup there.
- [ ] **Step 5: Gates + commit** `feat(ui): projects list, detail and task API`

---

### Task 10: Areas pages + task API

**Files:**
- Create: `app/api/areas/route.ts`, `app/api/areas/[slug]/tasks/route.ts`, `app/areas/page.tsx`, `app/areas/[slug]/page.tsx`

- [ ] **Step 1:** Duplicate Task 9's patterns for `type: "area"` (share `task-board.tsx` — it takes `type` + `slug` props). Areas omit MVP from the creation form; charter panel hides MVP scope section when empty.
- [ ] **Step 2: Verify** by creating an area "Health" in UI.
- [ ] **Step 3: Gates + commit** `feat(ui): areas list, detail and task API`

---

### Task 11: Today/Next page

**Files:**
- Create: `lib/core/next.ts`, `lib/core/__tests__/next.test.ts`, `app/page.tsx`, `components/quick-capture.tsx`, `components/journal-stream.tsx`

**Interfaces:**
- `getNextActions(): Promise<NextAction[]>` where `NextAction = { task: Task; charter: Charter }` — ranking: due overdue first, then due soon, then in-progress tasks, then backlog by charter priority then smallest size first (S before M before L); max 10.

- [ ] **Step 1: Failing test** for ranking with seeded temp data root.
- [ ] **Step 2: Implement next.ts**, verify pass.
- [ ] **Step 3: Today page** (server component): date header; "Next actions" list — each row: task title, project chip (link), size, due badge (red if overdue); complete checkbox. Below: quick-capture box (client: pick project/area + title + size → POST task). Below: last 20 journal entries across days (journal-stream).
- [ ] **Step 4: Verify** end-to-end in browser.
- [ ] **Step 5: Gates + commit** `feat(ui): today/next dashboard with ranking and quick capture`

---

### Task 12: Journal page

**Files:**
- Create: `app/journal/page.tsx`, `lib/core/journal.ts` addition `readJournal(days: number): Promise<JournalDay[]>` + test

```ts
export interface JournalDay { date: string; entries: { time: string; scope: string; message: string }[] }
```

- [ ] **Step 1: Failing test** for `readJournal` parsing `- HH:mm [scope] message` lines, newest day first.
- [ ] **Step 2: Implement + pass.**
- [ ] **Step 3: Journal page:** timeline grouped by day, scope chips color-coded per project/area, last 30 days, load more via `?days=` query param.
- [ ] **Step 4: Gates + commit** `feat(ui): journal timeline`

---

### Task 13: Settings page (providers + about)

**Files:**
- Create: `lib/core/providers.ts` (+ test), `app/api/providers/route.ts`, `app/api/about/route.ts`, `app/settings/page.tsx`

**Interfaces:**
- `getProviders(): Promise<ProvidersFile>`, `saveProviders(p: ProvidersFile): Promise<void>` (validate: unique ids, default exists, openai-compatible requires baseUrl; type in enum; reject unknown keys)

- [ ] **Step 1: Failing tests** for validation rules.
- [ ] **Step 2: Implement + pass.**
- [ ] **Step 3: Settings page:** list profiles (id, label, type, model, baseUrl, apiKeyEnv + env-var-present indicator from server env — never show values), add/edit/delete, select default radio. About section: textarea bound to about.md with save button.
- [ ] **Step 4: Verify** editing providers.json via UI preserves file shape.
- [ ] **Step 5: Gates + commit** `feat(ui): settings for providers and about`

---

### Task 14: AI tool implementations

**Files:**
- Create: `lib/ai/tools.ts`, `lib/ai/context.ts`

**Interfaces:**
- `toolImpls`: plain async functions shared by both AI SDK tools and Agent SDK tools:
  `listProjects()`, `listAreas()`, `getContext({ slug?, type? })`, `createProject({name, why, mvp})`, `createArea({name, why})`, `createTask({project, title, size})` (project = "slug" for a project OR "area:slug"), `updateTask({project, id, ...patch, complete?})`, `decomposeTask({project, id, subtasks: {title,size}[]})`, `moveToParkingLot({project, idea})`, `addJournal({scope, message})`, `nextActions()`, `weeklySummary()` (returns insights + journal digest text)
- `buildSystemContext(focus?: {type, slug}): Promise<string>` — about.md + focused charter + its open tasks + last 7 journal days

- [ ] **Step 1: Implement tools.ts** as thin async functions over `lib/core` store + insights + next; every function returns plain JSON-serializable objects; errors thrown as `Error` with actionable messages.
- [ ] **Step 2: Implement context.ts** using store + journal readers.
- [ ] **Step 3: Typecheck + lint + commit** `feat(ai): provider-agnostic tool implementations`

---

### Task 15: Chat route — OpenAI-compatible + Anthropic providers

**Files:**
- Create: `lib/ai/providers.ts`, `app/api/chat/route.ts`

- [ ] **Step 1: providers.ts model factory**

```ts
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";

export function resolveModel(profile: ProviderProfile) {
  if (profile.type === "openai-compatible") {
    const key = profile.apiKeyEnv ? process.env[profile.apiKeyEnv] ?? "" : "ollama";
    const provider = createOpenAICompatible({ name: profile.id, baseURL: profile.baseUrl!, apiKey: key });
    return provider(profile.model);
  }
  if (profile.type === "anthropic-api") {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(profile.model);
  }
  throw new Error("claude-subscription handled separately");
}
```

- [ ] **Step 2: Chat route** — POST `{ messages, profileId, focus? }`. Load providers.json, find profile. If `claude-subscription` → delegate to Task 16's `claudeSdkChat()` (import; stub throws until Task 16). Else `streamText` (AI SDK v5) with:

```ts
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";

const tools = {
  create_task: tool({
    description: "Create a task in a project or area",
    inputSchema: z.object({ project: z.string(), title: z.string(), size: z.enum(["S", "M", "L"]) }),
    execute: ({ project, title, size }) => toolImpls.createTask({ project, title, size }),
  }),
  // ... one entry per toolImpl, zod schemas explicit
};

const result = streamText({
  model: resolveModel(profile),
  system: await buildSystemContext(focus),
  messages,
  tools,
  stopWhen: stepCountIs(6),
});
return result.toUIClientStreamResponse();
```

- [ ] **Step 3: Verify** with Ollama profile if local Ollama running; otherwise DeepSeek key in `.env.local`; otherwise temporarily point a profile at any reachable OpenAI-compatible endpoint. Send "list my projects" and "create a task called Test spike size S in demo" — confirm data repo mutation + journal.
- [ ] **Step 4: Gates + commit** `feat(ai): chat route with openai-compatible and anthropic providers`

---

### Task 16: Claude subscription adapter (Agent SDK)

**Files:**
- Create: `lib/ai/claude-sdk.ts`
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: Implement** using `@anthropic-ai/claude-agent-sdk`:

```ts
import { query, createSdkMcpServer, tool as sdkTool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
```

Build an in-process MCP server from `toolImpls` (same zod schemas as Task 15 — extract shared schema definitions in `lib/ai/schemas.ts` during this task so both adapters reuse them). `query({ prompt: <last user message or formatted transcript>, options: { systemPrompt: <buildSystemContext>, mcpServers: { planner: server }, allowedTools: [the planner tools], maxTurns: 12 } })`.

Auth: relies on Claude Code credentials on the machine (`claude login` already done by the owner). If `CLAUDE_CODE_OAUTH_TOKEN` is set it is picked up automatically.

- [ ] **Step 2: Stream mapping** — iterate async messages from `query()` and write them into `createUIMessageStream` / `createUIMessageStreamResponse` from `ai` so the chat UI receives the same protocol as Task 15: assistant text deltas, tool-input-available / tool-output-available parts.
- [ ] **Step 3: Verify:** in UI pick "Claude (my subscription)", ask "what should I do next?" and "create task T in demo, size S". Confirm subscription auth is used (no ANTHROPIC_API_KEY set in env) and mutations land in planner-data.
- [ ] **Step 4: Gates + commit** `feat(ai): claude subscription chat via agent sdk`

---

### Task 17: Chat UI

**Files:**
- Create: `app/chat/page.tsx`, `components/chat/*.tsx` (message-list, tool-card, composer, profile-picker, focus-picker)

- [ ] **Step 1:** Client page using `useChat` from `@ai-sdk/react` (`transport: new DefaultChatTransport({ api: "/api/chat", body: { profileId, focus } })` — re-send profileId/focus via request body). Render assistant/user messages with markdown (no extra dep: simple whitespace-pre-wrap + code blocks via `pre`).
- [ ] **Step 2: Tool cards:** render tool parts from `message.parts` — collapsible card showing tool name, input JSON, result summary ("Created task T-012 in ftbot").
- [ ] **Step 3: Profile picker** (from /api/providers) + focus picker (project/area dropdown, default none = global).
- [ ] **Step 4: Verify** all three provider types end-to-end; confirm switching profile mid-conversation works (new conversation per profile switch is acceptable).
- [ ] **Step 5: Gates + commit** `feat(ui): chat page with tool cards and provider switching`

---

### Task 18: Insights page + AI weekly analysis

**Files:**
- Create: `app/insights/page.tsx`, `components/insights/*.tsx` (weekly-chart, per-project-table, stalled-list, balance-bar, weekly-analysis)
- Create: `app/api/insights/analyze/route.ts`

- [ ] **Step 1: Charts** with Recharts: bar chart done vs created per week (last 8 weeks); table per project (open, done total, last activity); stalled list (amber warning rows); balance bar projects vs areas (30d). Server component fetches `getInsights()`; charts are client components receiving serialized data.
- [ ] **Step 2: Weekly analysis block:** "Analyze my week" button → POST `/api/insights/analyze` → uses the default profile's model with a fixed prompt: insights JSON + journal digest + charters; asks for: what went well, what stalled, scope-drift signals vs MVP definitions, top 3 suggested next actions. Renders streaming text below charts.
- [ ] **Step 3: Verify** with seeded data.
- [ ] **Step 4: Gates + commit** `feat(ui): insights charts and AI weekly analysis`

---

### Task 19: Dogfood real data + README

**Files:**
- Modify: `planner-data` repo content, `README.md` (app repo)

- [ ] **Step 1: Seed real charters** with the owner (INTERACTIVE — ask the owner for Why/MVP per project; do not invent them). Projects: ftbot, savings-app, job-search-automation, quizra-mobile-app, Responsive-Bot, pomodoro, planner. Areas: ask the owner which life areas to start (suggest: Health, Finances, Career). Write charter files following the contract; initial Backlog tasks only if the owner dictates them.
- [ ] **Step 2: Fill about.md** interactively with the owner (values, constraints, energy patterns, current situation).
- [ ] **Step 3: App README.md:** what it is, two-repo layout, setup (`npm i`, `.env.local` from example, `PLANNER_DATA_DIR`), commands, provider setup incl. `claude setup-token` instructions for the subscription profile.
- [ ] **Step 4: Commit both repos; push.**

---

### Task 20: Final QA sweep

- [ ] **Step 1:** Fresh-clone sanity: `npm run lint && npm run typecheck && npm test && npm run build` all green.
- [ ] **Step 2: Manual pass** through every page; create/complete/decompose a task; verify journal + git log in planner-data.
- [ ] **Step 3: Confirm app repo contains zero personal data** (`git grep` for real project names outside docs fixtures is OK only in README if generic — remove specifics if leaked), `.env.local` untracked, `git status` clean in both repos.
- [ ] **Step 4: Final commit + push both repos.**

---

## Phase 2 (separate plan, later)

- stdio MCP server (`@modelcontextprotocol/sdk`) wrapping `lib/core` + `lib/ai/tools.ts`
- `.mcp.json` for Claude Code; verify with `claude mcp add`
- Weekly review dedicated view, journal search
