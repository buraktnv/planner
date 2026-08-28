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
