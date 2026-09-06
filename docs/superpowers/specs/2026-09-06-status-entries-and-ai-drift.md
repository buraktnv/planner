# Status entries, and a note that knows its AI section is behind

Two things that keep the written record honest while work is happening: a
note that can say its `## For the AI` section no longer matches its body, with
a one-click way to defer the fix; and a structured status entry in a task's log
that every agent is told to write when a decision lands, a follow-up task is
created, or another document turns out to be wrong.

## The gap

The `## For the AI` section (spec `2026-09-06-mentions-ai-section-modes.md`)
gave a note a second reading, but nothing notices when the body moves on and
the section does not. An agent that rewrites a body through `update_note` can
see the `forAi` field and is not told to use it. The owner cannot list the
notes whose AI text is behind, and has no cheap way to say "fix this later"
other than remembering.

The task log is append-only and the MCP instructions say to record wrong turns.
That is the only nudge, the web chat has none, and nothing says what an update
should contain. The case that matters is the one that happens mid-task: while
updating one document you find that another is wrong, or that a decision needs a
new task. Today that is either fixed silently, or not at all, and the next
reader cannot tell which.

## Decisions

### Drift is a hash, not a date

`ai_checked` is a new, optional frontmatter key holding sixteen hex characters
of a 64-bit FNV-1a hash of the **human** part of the body at the moment the AI
section was last confirmed against it — not a cryptographic hash, because it
only has to notice that the words changed and it has to run in the browser
bundle, where the doc page model lives. It is always written quoted, since
sixteen hex characters can be all digits and YAML would read a number. A note's
AI status is derived, never stored:

- `none` — no `## For the AI` section.
- `fresh` — the section exists and `ai_checked` equals the hash of the current
  human part.
- `unchecked` — the section exists and `ai_checked` is missing or differs.

A date would have been wrong twice: `updated` has day resolution, so a body
edited twice in one day could never be flagged, and an edit that changes
nothing (a re-save) would flag a note that is still true. A hash flags exactly
the edits that changed the words the section was written against.

The writer sets it: `updateNote({ forAi })` and `addNote({ forAi })` hash the
human part they just wrote; `forAi: ""` removes the key with the section; a
`body`-only update leaves the key alone, which is what makes the note
`unchecked` with no extra bookkeeping. A new `confirmAi: true` patch field
re-hashes without changing the section, for "I looked, it is still right". The
parser accepts the key and rejects nothing new: an older file simply has none.

### COMPARE confirms as well as corrects

When COMPARE finds the section adequate and only the summary wrong, its
`update_note` action carries `confirmAi: true` alongside the summary, so
accepting the card also clears the flag. When it finds nothing to change at
all, the note is confirmed directly — recording that a check happened is not a
change anyone needs to review. `confirmAi` is therefore a field on the
`update_note` schema and appears in the review modal as a checkbox.

### Revise later is a task, linked through `note:`

The AI tab gets a REVISE LATER button that creates a small task on the note's
first scoped charter — title `Revise K-nnn: body and For the AI section`,
`note:K-nnn` so it appears on the component map and counts toward the note's
progress, and a description that says to run COMPARE first. A scopeless note
gets the button disabled with the reason: a task has to belong to a charter.
No new route: it posts to the charter's existing task route.

### Where the flag shows

The knowledge page gets an UNCHECKED count and filter beside the existing ones;
the AI tab shows the state and a MARK CHECKED button; the per-scope knowledge
block in the chat context ends with one line naming up to five unchecked ids,
so the assistant knows which sections not to trust. Nothing is auto-loaded
beyond that line.

### A status entry is a log entry with a marker and three parts

The task log's stamp line has always tolerated a marker (`## 2026-09-06 14:22
· status`) so that kinds could be added without migrating a file. This adds the
first kind. The body is ordinary markdown with three bold labels —
**What happened**, **What changed elsewhere**, **Next** — so it reads correctly
in any markdown editor and an older build shows it as a plain entry.
`parseStatus` is total: an entry with the marker but without the labels renders
as a plain entry rather than failing.

The middle part is the one that matters and the one people skip. It names, by
id, every note updated or proposed, every task created, and every decision
reversed as a result of this work. The `post_status` tool takes the three parts
as separate fields so an agent cannot omit one; the task page gets a STATUS
toggle on the log composer with three boxes for the same reason; plain
`add_task_comment` and the free-text box stay for everything else.

### The feed

`lib/view/status-feed.ts` gathers every `status` entry across live charters,
newest first, capped, and the Focus page shows the latest few as a STATUS
strip: task, charter, time, the "what happened" line, and the ids from "what
changed elsewhere" as links. Decisions taken during the day are then visible
without opening each task. Reading every log file is acceptable for a personal
repo; the feed is built server-side on request and never cached.

### The rule, in both prompts

Web chat and MCP get the same paragraph, phrased for each:

- Changing a note's body? Pass `forAi` in the same call, or say in one line why
  the section still holds.
- While working a task, post a status entry when a decision lands, when work
  reveals a follow-up (create it with `note:` or `waits:`, name its id), or when
  another note proves wrong (update it or propose the update, name its id).
  Write it when you turn, not when you finish.

The MCP instructions file sits at its length cap; the paragraph is paid for by
tightening what is already there, the way the wrong-turns rule was.

## Rejected

- **A stale date.** See above; day resolution and re-saves make it lie both ways.
- **A separate status file.** The log is the record of the work; a second file
  is a second place to look and a second thing to keep append-only.
- **Auto-loading unchecked sections so the model can "fix them itself".** The
  fix needs the body, which is the thing the summary exists to keep out of the
  prompt. The one-line list of ids is enough for the assistant to say so and
  for COMPARE to be run.

## Verification

Hash round-trip and the three states; the writer's four transitions (section
written, body-only edit, `forAi: ""`, `confirmAi`); parse/serialize of the
`ai_checked` key; `compareToActions` carrying `confirmAi`; `parseStatus` total
and `renderStatus` round-trip; a `status` marker surviving `appendComment`;
the feed ordering and cap; the prompt paragraphs present with no mode; the MCP
instructions still under cap and every named tool exposed. Then the built app
on a throwaway data dir: edit a body alone and see UNCHECKED, confirm and see it
clear, REVISE LATER creates the linked task, post a status from the task page
and from `post_status` over `/api/mcp`, and see both on the Focus strip.
