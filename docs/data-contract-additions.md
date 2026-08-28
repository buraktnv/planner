# Data contract additions

Canonical text for new sections of `planner-data/CLAUDE.md`.

## Archive directory

Charters are never hard-deleted. `archiveCharter(type, slug)` moves them out of the parser's reach:

```
archive/projects/<slug>.md
archive/projects/<slug>/tasks.md
archive/areas/<slug>.md
archive/areas/<slug>/tasks.md
```

- `projects/<slug>.md` moves to `archive/projects/<slug>.md`; the task directory `projects/<slug>/` moves to `archive/projects/<slug>/`. Areas move under `archive/areas/` the same way. A charter with no task directory archives fine.
- If the target name already exists in `archive/`, a numeric suffix is appended: `<slug>-2`, `<slug>-3`, … Both the `.md` file and the directory use the same resolved name.
- Nothing in `archive/` is parsed or listed by the app: `listCharters()` reads only `projects/` and `areas/`. Git history keeps the full record either way.
- The move journals `charter archived` under the original slug and commits `charter archived: <slug>`.
- Archiving is a human action only — there is no AI tool for it.

## Task dependencies — `waits:`

A task line may carry one optional `waits:` field, alongside `created:` / `est:` / `due:` / `lane:`:

```
## Backlog
- [ ] T-042 | M | Send the signed forms | created:2026-08-28 | waits:T-041
- [ ] T-043 | S | Book the follow-up | created:2026-08-28 | lane:some | waits:the clinic
```

- **Value:** either a task id in the **same file** (`waits:T-041`, subtask ids allowed) or free text (`waits:the clinic`). The value may not be empty and may not contain ` | `.
- **Position:** anywhere in the optional-field list on read; written after `lane:` and before `done:`.
- **Parser:** validates syntax only. An id that does not exist in the file is accepted — it may be added later — and is then treated as free text.
- **Blocked:** a task is blocked when `waits:` is set and either the value is free text (or an unknown id), or it names a task in the file that is not done. Completing the blocker unblocks the waiter automatically; nothing rewrites the `waits:` field.
- **Lane:** `waits:` does not force `lane:wait`. An explicit `lane:` still wins, and blocked cards commonly sit in `some`.
- **Clearing:** write the field away — the API and store accept `waitsOn: ""` and drop the field from the line.
- Blocked tasks rank last in the Focus list and are never picked as the One Thing.

## Calendar events

One file at the data root, `calendar.md`. No sections, one event per line, kept sorted by date then time then id on every write:

```
- [ ] E-001 | 2026-09-01 | Passport appointment | time:09:40 | note:bring photos | scope:area:admin | action:photos not printed
- [x] E-002 | 2026-08-29 | Grocery run + prep | time:morning | scope:area:daily
```

- **Fixed order:** checkbox, id, ISO date, title, then the optional fields in the order `time:` / `note:` / `scope:` / `action:`.
- **Id:** `E-` followed by at least 3 digits, zero-padded to 3. Monotonic across the file, never reused — `nextEventId()` takes the highest existing number and adds one.
- **Date:** `YYYY-MM-DD`, required. There is no separate "done date"; a done event keeps its date and flips the checkbox.
- **`time:`** free text up to 12 characters — `09:40`, `morning`, `after lunch`. Sorting is lexicographic, so an empty time sorts first within a day.
- **`note:`** free text.
- **`scope:`** either a project slug (`widget-shop`) or `area:<slug>`. Optional: an event may belong to nothing. Slugs are lowercase letters, digits and dashes.
- **`action:`** free text = what still needs doing before the event. Its presence on an **open** event is the "needs action" flag the UI surfaces in wait-ink. A done event's `action:` is ignored.
- No field value may contain ` | `, and no value may be empty on disk. `CalendarParseError` carries the line number for every malformed line; blank lines and `#` headings are tolerated and dropped on write. Round-trip (parse → serialize → parse) is identity up to sort order.
- **Store** (`lib/core/calendar.ts`): `listEvents({ from?, to? })` (inclusive ISO range), `addEvent(input)`, `updateEvent(id, patch)` — any field including `done` and `date`. Passing an empty string for `time` / `note` / `scope` / `action` clears the field.
- **Journal scope** is the event's scope slug with any `area:` prefix stripped, or `calendar` when the event has no scope.
- **API:** `GET/POST /api/calendar`, `PATCH /api/calendar/[id]`.
- **Views:** `/calendar` merges events and task `due:` dates into one three-week grid (square dots in the scope colour for events, round dots for tasks), a "Needs action" panel, a "Behind" group for passed open events and overdue tasks, and an "Up next" agenda of the next 14 days with events before due tasks. The Focus page shows today's open events above the plan.
- **AI:** `list_events`, `create_event`, `update_event`; `buildSystemContext` includes `# Calendar (next 14 days)`.

## Daily — habits, rhythms, meals, groceries

A `daily/` directory at the data root. Four small mutable definition lists plus one append-only log, so counts and streaks stay honest.

```
daily/habits.md
- H-001 | Walk | goal:4 | unit:× 15 min
- H-002 | Water | goal:6

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
- 2026-08-28 21:00 | H-001 | reset
```

- **Ids:** `H-` / `R-` / `M-` / `G-` plus at least 3 digits, zero-padded to 3, monotonic per file, never reused.
- **Fixed order per line.** Habits: id, name, `goal:` (positive integer), optional `unit:` (free text label). Rhythms: id, name, `per:` (positive integer, times per week). Meals: id, name, `servings:` (0 or more, the live remaining count). Groceries: checkbox, id, name, `cat:` (free text category).
- **Log lines:** `- <ISO date> <HH:mm> | <id> | <delta>` where delta is `+n`, `-n` or `reset`. Chronological, append-only, never rewritten. Any id kind may appear.
- No value may contain ` | `. `DailyParseError` carries the line number for every malformed line; blank lines and `#` headings are tolerated and dropped on write. Round-trip (parse -> serialize -> parse) is identity.
- **Derived counts:** a habit's count for a day is the sum of that habit's deltas on that date, restarting at 0 after each `reset` line; a rhythm's count is the same sum over Monday-Sunday of the current ISO week. A habit streak is the run of consecutive calendar days meeting `goal`, counted back from today (or from yesterday when today is not met yet).
- **Wrap-around:** tapping a habit or rhythm that already meets its goal appends `reset` instead of `+1`, so the row starts over.
- **Meals:** `servings` on disk is the live remaining count. "Eat" decrements it in place **and** appends a `-1` log line, so the weekly summary can count servings eaten.
- **Store** (`lib/core/daily.ts`): `getDaily()`, `logHabit(id)`, `logRhythm(id)`, `logDaily(id)`, `eatMeal(id)`, `setMealServings(id, n)`, `toggleGrocery(id, got?)`, `addGrocery(name, cat)`, `clearBoughtGroceries()`, `addHabit(name, goal, unit?)`, `addRhythm(name, per)`, `addMeal(name, servings)`. Every mutation journals under scope `daily` and commits.
- **API:** `GET /api/daily`, `POST /api/daily/log { id }`, `POST /api/daily/groceries { name, cat? }`, `DELETE /api/daily/groceries` (clear bought), `PATCH /api/daily/groceries/[id] { got? }`, `POST /api/daily/meals/[id]/eat`, `PATCH /api/daily/meals/[id] { servings }`, `POST /api/daily/{habits|rhythms|meals}`.
- **Views:** `/daily` shows habits today (rings, tap to count), rhythms this week (9px square pips, rows behind by 2+ in wait-ink), then meal prep (8px round pips) and groceries by category side by side. The Focus plan card mentions `n habits left today`; the Dashboard header carries a "rhythms met" chip.
- **AI:** `get_daily`, `log_daily { id }`, `add_grocery`, `set_grocery { id, got }`; `weekly_summary` gains a `daily` block (habit days met, rhythms met, servings eaten) and `buildSystemContext` includes a short `# Daily` block.

## `providers.json`

Lives at the data root. Additive over the original three-type shape — old files validate unchanged.

```json
{
  "profiles": [
    { "id": "claude-sub", "type": "claude-subscription", "model": "opus", "label": "Claude Opus 5", "effort": "medium" },
    { "id": "or-openai-gpt-5-6-terra", "type": "openrouter", "model": "openai/gpt-5.6-terra", "label": "GPT-5.6 Terra", "effort": "medium" },
    { "id": "ds-deepseek-v4-pro", "type": "deepseek", "model": "deepseek-v4-pro", "label": "DeepSeek V4 Pro", "effort": "high" },
    { "id": "ollama", "type": "openai-compatible", "baseUrl": "http://localhost:11434/v1", "model": "llama3", "label": "Ollama" }
  ],
  "default": "claude-sub"
}
```

- **Types:** `claude-subscription` | `anthropic-api` | `openai-compatible` | `openrouter` | `deepseek`.
- `openrouter` and `deepseek` are OpenAI-compatible with a **fixed** base URL (`https://openrouter.ai/api/v1`, `https://api.deepseek.com/v1`) and a default `apiKeyEnv` (`OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`) a profile may override. `baseUrl` on either type is a validation error. `openai-compatible` still requires `baseUrl`.
- `anthropic-api` honours `apiKeyEnv` and falls back to `ANTHROPIC_API_KEY`.
- **`effort`** (optional, any type): `low` | `medium` | `high` | `xhigh` | `max`. Anything else is a validation error. Absent means no effort parameter is sent. Claude types take all five; OpenAI-style APIs receive `reasoningEffort` with `xhigh`/`max` clamped to `high`. The chat request may override a profile's effort for one message.
- **Favourite ids** are derived, not typed: `or-` / `ds-` plus the model id lowercased with every run of non-alphanumeric characters collapsed to `-` (`openai/GPT-5.6 Terra` → `or-openai-gpt-5-6-terra`). `label` defaults to the catalog's display name.
- Keys allowed on a profile: `id`, `type`, `model`, `label`, `baseUrl`, `apiKeyEnv`, `effort`. Any other key is rejected. Ids must be unique and `default` must name an existing profile whenever profiles exist.
- No secret ever appears in this file — only env var **names**.
