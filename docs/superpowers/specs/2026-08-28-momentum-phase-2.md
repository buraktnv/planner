# Momentum v2 — phase 2 gaps

Five things the Momentum v2 design shows that the app could not build without a data-contract decision. This spec makes those decisions. Every item follows the standing rules in `AGENTS.md`: all data access through `lib/core`, every mutation journals and git-commits in the data repo, additive and backward-compatible grammar, tests for every parser, fixtures with fake data only.

The data repo contract (`planner-data/CLAUDE.md`) must be updated to match; the canonical text for the new sections lives in `docs/data-contract-additions.md` in this repo so it can be copied across.

---

## 1. Task dependencies — `waits:`

**Design:** cards show `WAITS ON T-041` / `waits on the clinic`; branch edges to blocked nodes are dashed; blocked tasks are never the One Thing.

**Grammar:** new optional task field `waits:<value>` after the title, alongside `created:` / `est:` / `due:` / `lane:`.
- Value is either a task id in the **same file** (`waits:T-041`) or free text without ` | ` (`waits:the clinic`).
- `Task.waitsOn?: string`. Serialize after `lane`.
- Parser validates only the syntax; an id that does not exist in the file is allowed (it may be added later) but `isBlocked` treats it as free text.

**Derived semantics (`lib/core/lanes.ts` or a new `lib/core/deps.ts`):**
- `blockerOf(task, tasks)`: if `waitsOn` matches a task id in the same list, returns that task; else `null`.
- `isBlocked(task, tasks)`: `waitsOn` set AND (blocker is null → free text, blocked; or blocker exists and is not done). A done blocker unblocks automatically.
- `laneOf` is **not** forced to `wait` (the design keeps blocked cards in `some`); explicit lane wins as before.

**Where it shows:**
- `CardModel` gains `waitsOn?: string`, `blocked: boolean`, `blockedByTitle?: string`.
- Focus ranking (`lib/view/focus.ts`): blocked cards drop to the bottom of the ranked list and are excluded from the One Thing; `reasonFor` says "waits on …".
- Board card and card detail show a `WAITS ON …` mono chip (wait-ink colour `#a06f2c`). Card detail gets an editable "Waits on" text field (PATCH `waitsOn`; empty string clears).
- Branches view draws a dashed edge / dashed node border when `blocked`.
- Composer for `branch` gets an optional "Waits on" input.
- API: task POST/PATCH accept `waitsOn` (string; `""` clears). Store `addTask`/`updateTask` thread it.
- AI: `create_task` and `update_task` gain `waitsOn` (optional string).

**Tests:** grammar round-trip incl. free text with spaces; unknown-id tolerated; `isBlocked` truth table; focus excludes blocked from One Thing; store PATCH clears with `""`.

---

## 2. Project / area delete → archive

**Design:** `DELETE` in the project header, then back to the projects list.

**Decision:** never hard-delete. `archiveCharter(type, slug)` moves `projects/<slug>.md` and `projects/<slug>/` (or areas) to `archive/projects/<slug>.md` + `archive/projects/<slug>/` in the data repo, journals `charter archived`, commits `charter archived: <slug>`. Git history keeps everything anyway; the archive dir keeps the parser away from it. `listCharters` already ignores `archive/` because it only reads `projects/` and `areas/`.
- Name collision in `archive/`: suffix `-2`, `-3`, …
- `lib/core/paths.ts`: `archiveDir()`.
- API: `DELETE /api/charters/[type]/[slug]` → `{ ok: true }`.
- UI: `DELETE` mono button (hover wait-ink) in the project and area detail headers → shared `Dialog` confirm: "Archive <name>? Its tasks move to archive/ in the data repo and disappear from the app. Nothing is destroyed." Buttons: "Archive" (wait colour) / "Cancel". On success `router.push` to `/projects` or `/life` and `router.refresh()`.
- Chat rail: if the archived charter was the chat scope, scope resets to AUTO (context `charters` list re-renders from layout anyway).
- **No AI tool** for archive — destructive actions stay behind a human click.

**Tests:** store archive moves both files, tolerates a missing tasks dir, suffixes on collision, journal + commit called; `listCharters` no longer returns it.

---

## 3. Calendar events — `calendar.md`

**Design:** dated events with time, note, an "action needed" state, and a link to an area/project; the composer creates events; the calendar mixes events and task due dates.

**Grammar:** one file at the data root, `calendar.md`, no sections, one event per line, kept sorted by date then time on write:

```
- [ ] E-001 | 2026-09-01 | Passport appointment | time:09:40 | note:bring photos | scope:area:admin | action:photos not printed
- [x] E-002 | 2026-08-29 | Grocery run + prep | time:morning | scope:area:daily
```

- Fixed order: checkbox, id (`E-` + 3+ digits, monotonic, never reused), ISO date, title, then optional `time:` (free, ≤ 12 chars), `note:`, `scope:` (`<project-slug>` or `area:<slug>`), `action:` (free text = what still needs doing; its presence is the design's `act` flag).
- No field value may contain ` | `; parser throws `CalendarParseError` with line numbers on any malformed line; round-trip must be identity.
- Types: `CalendarEvent { id, date, title, done, time?, note?, scope?, action? }`.
- Store (`lib/core/calendar.ts`): `listEvents()`, `addEvent(input)`, `updateEvent(id, patch)` (any field incl. `done`, `date`, `action: ""` clears). Journal scope is the event's scope slug or `calendar`.
- Paths: `calendarPath()`.
- API: `GET/POST /api/calendar`, `PATCH /api/calendar/[id]`.
- View: `lib/view/calendar.ts` builds `CalendarDay[]` merging events and card due dates for the 3-week grid plus an "Up next" list (next 14 days) and "Needs action" list (open events with `action`). Event dots use the scope charter colour (`hueOf`), tasks keep their current dots.
- UI: `/calendar` shows the grid, an agenda per day with events first, then due tasks; tick to mark an event done; "action" text shown in wait-ink. Composer `event` kind creates a real event (date, optional time, note, scope optional — scope is no longer required for events) instead of a due-dated task. Focus view "Today" strip lists today's open events above the plan.
- AI: `list_events` (`from?`, `to?` ISO), `create_event`, `update_event`. `buildSystemContext` adds `# Calendar (next 14 days)`.

**Tests:** parser round-trip, sorting on write, id allocation, malformed lines throw, view merge with tasks, action list.

---

## 4. Daily — habits, rhythms, meals, groceries

**Design:** the Life "Daily" screen: habits with a per-day goal and pips, rhythms with a per-week count, meal prep with servings left, groceries by category; every row is one tap.

**Data:** a `daily/` directory in the data repo. Definitions are small mutable lists; habit and rhythm activity is an append-only log so streaks and weekly counts stay honest.

```
daily/habits.md
- H-001 | Walk | goal:4 | unit:× 15 min
- H-002 | Water | goal:6 | unit:× glass

daily/rhythms.md
- R-001 | Laundry | per:3
- R-002 | Kitchen reset | per:5

daily/meals.md
- M-001 | Lentil soup | servings:2
- M-002 | Roast vegetables | servings:0

daily/groceries.md
- [ ] G-001 | Red lentils | cat:Staples
- [x] G-003 | Olive oil | cat:Staples

daily/log.md               (append-only)
- 2026-08-28 09:12 | H-001 | +1
- 2026-08-28 19:40 | R-002 | +1
- 2026-08-28 20:05 | M-001 | -1
```

- Ids per file: `H-`, `R-`, `M-`, `G-` + 3 digits, monotonic. `goal` and `per` are positive integers; `servings` ≥ 0; `cat` free text without ` | `.
- Types: `Habit { id, name, goal, unit? }`, `Rhythm { id, name, per }`, `Meal { id, name, servings }`, `Grocery { id, name, cat, got }`, `DailyLogEntry { date, time, id, delta }`.
- Derived: habit `today` count = today's `+1` lines for that id; rhythm `week` count = lines Mon–Sun of the current ISO week; habit streak = consecutive days meeting `goal` (reuse the calendar-day streak approach from `lib/view/focus.ts`). Meals: `servings` is the live remaining count, decremented in place on "eat" (and a `-1` log line is written for the weekly summary).
- Store (`lib/core/daily.ts`): `getDaily()` → `{ habits, rhythms, meals, groceries, log }`; `logHabit(id)`, `logRhythm(id)` (append `+1`; if the count already meets the goal, the tap resets the day/week by appending `reset` — mirror the design's wrap-around), `eatMeal(id)`, `setMealServings(id, n)`, `toggleGrocery(id)`, `addGrocery(name, cat)`, `addHabit/addRhythm/addMeal`, `clearBoughtGroceries()`. Each journals under scope `daily` and commits.
- Paths: `dailyDir()` + one helper per file.
- API: `GET /api/daily`, `POST /api/daily/log { id }`, `POST /api/daily/groceries`, `PATCH /api/daily/groceries/[id]`, `POST /api/daily/meals/[id]/eat`, `POST /api/daily/{habits|rhythms|meals}`.
- View: `lib/view/daily.ts` builds the screen model: per-habit `{ today, goal, pips, streak }`, per-rhythm `{ week, per, pips, label }`, `mealsLeftTotal`, groceries grouped by category with `groceryLeft`, plus `rhythmsMet` for the dashboard.
- UI: new route `/daily` (sidebar link under Life, above Calendar, with the design's heart-ish icon), sections Habits today → Rhythms this week → Meal prep + Groceries side by side. Tapping a row optimistically bumps and POSTs. "+ ADD" mono buttons open a small inline form per section (no new composer kind needed). Empty state explains the four files.
- Focus view: the plan card mentions `n habits left today` when any habit is under goal. Insights: "rhythms met this week" stat chip.
- AI: `get_daily`, `log_daily { id }` (habit or rhythm), `add_grocery`, `set_grocery { id, got }`. `weekly_summary` gains a `daily` block (habit days met, rhythms met, servings eaten).

**Tests:** all four parsers round-trip; malformed lines throw; log parse; counts for today / this week across week boundaries; wrap-around reset; streak; grouping.

---

## 5. Chat proposal card — propose then apply

**Design:** the assistant answers with a card (title, rows of `id · title · lane`) and **Accept / Discard**. Nothing is written until Accept.

**Decision:** a new AI tool `propose_changes` that writes nothing:

```ts
propose_changes: {
  title: string,              // "Split T-041 into three rounds"
  summary?: string,
  actions: Array<
    | { kind: "create_task"; project; title; size; lane?; due?; waitsOn? }
    | { kind: "update_task"; project; id; ...same optional fields as update_task }
    | { kind: "decompose_task"; project; id; subtasks }
    | { kind: "move_to_parking_lot"; project; idea }
    | { kind: "create_event"; ... }        // if #3 has landed
  >
}
```

- The tool's implementation returns `{ proposalId, title, summary, actions, preview }` where `preview` is one row per action (`id` or `NEW`, `title`, `lane`) computed without writing. The zod schema is the discriminated union of the existing mutating tool shapes, so nothing is duplicated by hand: build it from `toolShapes`.
- Apply path: `POST /api/proposals/apply { actions }` runs the actions sequentially through `toolImplMap` (so every write still goes through `lib/core`, journals and commits) and returns per-action results. Any failure stops the run and reports which action failed; the card shows the partial result honestly.
- Chat rail: render a `propose_changes` tool part as the design's card — colour dot from the first action's charter, rows with lane pills, **Accept** (quick colour) / **Discard** (edge border). Accepted / discarded state is kept per `toolCallId` in the in-browser session; after Accept the card turns into "✓ Applied n changes" and `router.refresh()` runs; after Discard it greys out. The card is disabled while the request is in flight.
- System prompt: in **Plan** mode the instruction says to use `propose_changes` for any set of writes and to keep direct writing tools for single, explicitly requested changes; the other modes are unchanged. `toolSummary` in the rail names it "proposed n changes".
- The Claude subscription path gets the tool automatically through `toolNames`.

**Tests:** schema accepts each action kind and rejects an unknown kind; preview rows; apply runs actions in order and stops on the first failure (mock `toolImplMap`).

---

## Sequencing

1. **Wave 1 (parallel, low overlap):** #1 dependencies, #2 archive.
2. **Wave 2 (parallel, shared files: `paths.ts`, `sidebar.tsx`, `schemas.ts`, `tools.ts`, `tool-map.ts`, `context.ts`):** #3 calendar, #4 daily.
3. **Wave 3:** #5 proposals (needs the final tool list).

Each wave ends with `npm run lint && npm run typecheck && npm test` green and one commit per item on `worktree-momentum-v2`.
