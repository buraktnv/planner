/**
 * What every agent connecting to this server is told, before it does anything.
 *
 * This is the always-on half of the contract, and it is deliberately short:
 * an MCP client keeps these instructions in context for the whole session, so
 * anything that is merely useful belongs in the `planner-sync` skill instead.
 * What lives here is only what an agent gets *wrong by default* — filing a
 * duplicate note, re-deciding something already settled, starting work that was
 * never written down, or trying to write a charter it cannot write.
 */
export const SERVER_INSTRUCTIONS = `This server is a local-first planner: markdown files in a git repo, where every
write takes a lock, appends a journal line and makes a commit. There is no
transaction. A batch of writes applies one at a time and can stop halfway.

READ BEFORE YOU WRITE. Before proposing anything about a project:
- search_knowledge for its slug and for each topic you are about to touch, then
  read_note on the hits. A summary is not enough to know whether a decision is
  already made.
- If a note already covers the thing, call update_note. Do not add_note a second
  version — near-duplicates are merged, so it is a silent no-op at best.
- If a recorded decision contradicts what you were about to propose, stop and
  say so, citing the note id. Never quietly re-decide something already settled.
- list_components and list_targets show what is already mapped and claimed.

WHAT IS ALREADY HERE IS THE BASELINE, NOT A DRAFT. Charters, tasks and notes
were written deliberately. Extend what is thin, correct what is wrong, and file
nothing that exists already under a new id.

WRITE IT DOWN BEFORE YOU DO IT. An idea that reached you in conversation exists
nowhere else: add_note it even when nobody schedules it. Work being done becomes
a task, and create_task takes a description — what this is and why — written
before the work, not after. Every task carries target: (the outcome it advances)
or note: (the component it changes), or it cannot be prioritised later.
decompose_task anything larger than one sitting, with a reason: what makes these
the pieces.

RECORD THE WRONG TURNS AS THEY HAPPEN. add_task_comment appends to a task’s log
and nothing overwrites it, so that is where a dead end survives. Log what you
tried and why before trying the next thing, and read_task_comments first, so you
do not re-run one someone already hit.

A NOTE’S summary IS ONE LINE and is the only text later auto-loaded into a
context window. Make it a claim, not a topic. The first tag groups it on the
project’s docs page: prefer architecture, protocol, decision, runbook, reference.
[[K-nnn]] links become canvas arrows: link where the relationship is real.

WHAT YOU CANNOT DO HERE. You cannot write a charter, only propose one: a new
project or area goes through propose_changes as a create_project or create_area
action and waits for the owner. Nothing edits a charter afterwards, so get the
Why and the MVP scope right there, and when an existing one needs changing, hand
back the exact text for a human to paste.

BATCH MULTI-STEP WRITES through propose_changes, so the set lands as one
Accept/Discard card, not a trail of half-applied commits. A proposal is
filed the moment you make it and waits at /proposals in the planner app; say so,
with its id, rather than claiming the work is done. Nothing is written until it
is accepted there.`;
