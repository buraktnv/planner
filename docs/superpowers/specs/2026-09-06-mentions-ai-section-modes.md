# Chat that reads what you point at

`@` mentions in the chat, a `## For the AI` section in every knowledge note with
a COMPARE button beside it, and the mode buttons replaced by one `/checkin`
command. One PR, because the three share a picker and a prompt.

## The gap

The split between "what I read" and "what the AI reads" already exists, but it
is lopsided. A note's `summary` is the AI's view and is one line; the body is
the human's. One line cannot hold structure, so the assistant reads the body
anyway, and the body is written for a person. There was no place to write the
version meant for the model, and no way to check that the summary was still a
true claim about a body that had since been edited.

Pointing the assistant at a specific note or task was indirect: `recallQuery`
feeds the latest user message to keyword search, and whether the right note
surfaced depended on phrasing. A task's description and log could only reach
the model if it chose to call `read_task_detail`.

Five mode buttons sat above every conversation. Four of them (Plan, Straight,
Reflect, Target) were tones a person can say in words. The fifth, Check-in, is a
procedure — questions, then notes filed with an explicit area scope and a journal
line — and is the only one that earns a control. Plan mode also carried the one
rule that is not a tone: batch writes through `propose_changes`. A rule that only
applies when a button is pressed is a rule that is mostly off.

## Decisions

### The AI section is a heading in the body, not a frontmatter key

`## For the AI`, running to the next `## ` heading at column 0 outside a fence,
or to the end. On disk nothing changes shape: `KnowledgeNote.body` stays the full
markdown, so parse/serialize round-trip is untouched, search scoring and
`[[K-nnn]]` backlinks keep seeing the whole note, and `read_note` over MCP is
backward compatible. `splitAiSection` and `withAiSection` in
`lib/core/knowledge.ts` are the only code that knows the heading; a write
through `forAi` re-emits the section last, a read never moves it.

Rejected: a frontmatter key. `parseNote` throws on unknown keys, so an old
checkout would refuse every note carrying it, and multi-line YAML is fragile
under hand editing.

### What loads where

The summary is still the only thing auto-loaded. The AI section reaches the
model on demand: through `read_note`, and through an `@` mention, which injects
summary plus AI section and falls back to the body only when no section exists.
Auto-loading every scoped note's AI section would make the prompt grow with
every note written.

### COMPARE proposes, never writes

A structured-output call over title, summary, human body and AI section returns
a verdict and, where warranted, a rewritten summary and AI section. The result
is an `update_note` action filed through `propose_changes`, so it lands on
`/proposals` as well as on the note page and survives the page being closed.
It reuses `pickDistillProfile`, so on the Claude subscription path the button
says plainly that it needs an API profile.

### Mentions travel in the request body

The text carries a short token — `@K-009`, `@T-007`, `@acme-bot` — and the
request body carries the structured list, exactly as `revise` and `digest` do.
The subscription path re-sends the transcript as text every turn, so a note body
pasted into a message would be re-sent for ever; `recallQuery` would search the
notes for it. Only the message being sent carries mentions; earlier ones were
already seen. The list is derived from the text at send time, so deleting a
token drops the mention.

`parseMentions` is lenient like `parseDigest`: a bad entry is dropped, the turn
goes through. A missing id renders as "not found" so the model does not invent
one.

### One command replaces five buttons

`ChatMode` keeps only `checkin`, triggered by typing `/checkin`. The mode persists
for the session because the procedure spans turns, and a new conversation
resets it. Old stored sessions carrying `mode: "plan"` read back as `null`
through the existing `isChatMode` guard.

The batching rule moves out of the Plan instruction into an always-on block
beside the capture instruction, on both provider paths.

## Verification

Round-trip and update tests on the split; descriptor-drift test accepts
`forAi`; mention parse/resolve/render tests including caps and "not found";
picker tests at the caret; compare-to-actions returns null on no change;
context tests for the batching rule with no mode. Then the dev server against a
throwaway data dir: write an AI section and read it back over `/api/mcp`;
COMPARE a note with a stale summary and accept the card; mention a note and a
task and see the answer quote the task description; run `/checkin` across turns;
ask for three tasks with no mode and get a proposal card.
