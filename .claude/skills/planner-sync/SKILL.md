---
name: planner-sync
description: Bring a project into the Planner app, or bring an existing one up to date — charter, knowledge notes and tasks — reading the knowledge base before deciding anything. Use when asked to add a project to the planner, fill in a project's docs or knowledge, turn work or a braindump into tasks, or audit what a project is missing.
---

# Sync a project into Planner

Planner is a local-first planner over markdown in a git repo. Its MCP server
(`planner`) already tells you the standing rules on connect; this skill is the
procedure. If the server's tools are not available, stop and say so rather than
editing the data repo by hand — every write there has to take a lock, journal
and commit, and doing it directly corrupts that.

## Pick a mode first, and say which you are in

- **Audit** — read everything, write nothing, report the gaps. *Default when the
  project already has content, or when the ask is vague.*
- **Sync** — propose the additions, for the human to accept.

Never start in Sync on a project you have not audited in the same run.

## Step 1 — Inventory

`list_projects`, `list_areas`, then `get_context` on each project in scope.

Decide per project:

- **Absent** → it needs creating. Over MCP you *cannot*: `create_project` and
  `create_area` are owner-only and not in your tools. Hand back the exact
  `name` / `why` / `mvp` instead. Only the app's own chat can create charters.
- **Present** → work inside it. One project has one charter: "bot",
  "responsive bot" and "Responsive-Bot" are the same thing. Never create a
  second charter because the name you were given differs.

If the ask was "all my projects", enumerate them and handle each; do not stop at
the first.

## Step 2 — Read the knowledge base before deciding anything

This is the step that makes the difference, and it comes before writing.

1. `search_knowledge` for the project slug, then again for each topic you are
   about to touch.
2. `read_note` on every plausible hit. **The summary is not enough** — a
   decision lives in the body.
3. `list_components` — the parts of the system already on its map.
4. `list_targets` — outcomes already claimed.
5. `next_actions` — what the app already thinks is next.

Then apply these, in order of importance:

- A filed decision that contradicts your plan **stops the plan**. Say so, cite
  the note id, and let the human decide. Re-deciding something settled is the
  worst failure mode here.
- A note that already covers your topic gets `update_note`, never `add_note`.
- A task that already exists gets extended or decomposed, never twinned.
- Every recommendation you make must trace to a note you read, the charter, or
  code you opened. Say which. "Seems like" is not a source.

## Step 3 — The charter

`create_project` takes exactly `name`, `why`, `mvp`:

- **`why`** — why this exists and why it is worth the time. Two or three
  concrete sentences. Not a description of the software.
- **`mvp`** — the smallest thing that proves the idea works. One step. Anything
  that is not that step goes in the parking lot.

**No tool edits a charter.** For a project that exists, its Why, MVP scope,
targets and parking lot are beyond your reach. When one needs changing, put the
replacement text in your report for the human to paste into the `EDIT` control
on the project page. Do not file a note that contradicts the charter instead.

Targets live in the charter too, so hand them back as lines:

```
### M1 — name of the milestone
- [ ] Title of the outcome — by 30 SEP
```

## Step 4 — Knowledge

The durable half, and usually the real gap: a project with no scoped notes has
an empty docs page and an empty system map, because **a project's docs are its
scoped notes**.

- One note per idea. `scope` is the project slug exactly (`area:slug` for areas).
- `summary` is a **single line** and the only text later auto-loaded into a
  context window. Make it a claim — "recovery plans match on error signature,
  so an unmatched failure escalates instead of retrying" — not a topic.
- First tag groups it on the docs page. Prefer `architecture`, `protocol`,
  `decision`, `runbook`, `reference`.
- A note describing a part of the system becomes a card on the system map.
  Nothing else marks it as a component.
- `[[K-nnn]]` links render as arrows on the canvas. Link where the relationship
  is real; no decorative "see also" footers. One per note is usually plenty.
- Architecture goes in a ` ```mermaid ` fence, not prose describing a diagram.
- Never write canvas positions or edges. The map lays itself out.
- Where you are inferring rather than confirming, say so in one clause. A
  confidently wrong architecture note is worse than no note at all.

## Step 5 — Tasks

- `create_task` takes `project`, `title`, `size` (S/M/L), and optionally
  `target:` / `note:` / `waitsOn:`.
- **Attach every task**: to the target it advances, or the component it changes.
  A task with neither cannot be prioritised later.
- `decompose_task` for anything larger than one sitting. Subtasks are steps,
  not themes.
- `write_task_detail` only where the *how* is not obvious. Free markdown, no
  parser — this is where reasoning goes. Most tasks need none.
- Size honestly: S is under an hour, L is a day or more.
- **Nothing in a parking lot becomes a task unless asked.** Parked items are
  deliberately out of scope; promoting them silently re-scopes the project.

## Step 6 — Land it, then report

Put the whole set through `propose_changes` so it arrives as one
Accept/Discard card. Nothing should apply that the human did not accept.

Report in this order:

1. Projects created / extended / **left alone, with why** for each left alone.
2. Notes added or updated, with ids.
3. Tasks added, and what each is attached to.
4. **Text for the human to paste** — Why, MVP, target lines. The part no tool
   can write.
5. What you chose *not* to do, and the note id or fact that stopped you.

That last item is not filler. On a project with existing content, the most
valuable output is usually the list of things that already had an answer.
