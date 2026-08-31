/**
 * What every agent connecting to this server is told, before it does anything.
 *
 * This is the always-on half of the contract, and it is deliberately short:
 * an MCP client keeps these instructions in context for the whole session, so
 * anything that is merely useful belongs in the `planner-sync` skill instead.
 * What lives here is only what an agent gets *wrong by default* — filing a
 * duplicate note, re-deciding something already settled, creating a task
 * attached to nothing, or trying to write a charter it cannot write.
 */
export const SERVER_INSTRUCTIONS = `This server is a local-first planner: markdown files in a git repo, where every
write takes a lock, appends a journal line and makes a commit. There is no
transaction. A batch of writes applies one at a time and can stop halfway.

READ BEFORE YOU WRITE. Before proposing anything about a project:
- search_knowledge for its slug and for each topic you are about to touch, then
  read_note on the hits. A summary is not enough to know whether a decision has
  already been made.
- If a note already covers the thing, call update_note. Do not add_note a second
  version — near-duplicates are merged, so it is a silent no-op at best.
- If a recorded decision contradicts what you were about to propose, stop and
  say so, citing the note id. Never quietly re-decide something already settled.
- list_components shows the parts of a system already mapped; list_targets shows
  outcomes already claimed.

WHAT IS ALREADY HERE IS THE BASELINE, NOT A DRAFT. Charters, tasks and notes
were written deliberately. Extend what is thin, correct what is wrong, and file
nothing that already exists under a new id.

TASKS ATTACH TO SOMETHING. Every task should carry target: (the outcome it
advances) or note: (the component it changes). A task with neither cannot be
prioritised later. Use decompose_task for anything larger than one sitting.

A NOTE'S summary IS ONE LINE and is the only text later auto-loaded into a
context window. Make it a claim, not a topic. The first tag groups it on the
project's docs page: prefer architecture, protocol, decision, runbook, reference.
[[K-nnn]] links become arrows on a canvas, so link where the relationship is
real, not decoratively.

WHAT YOU CANNOT DO HERE. You cannot write a charter, only propose one: there is
no charter tool in your list, so a new project or area goes through
propose_changes as a create_project or create_area action and waits for the
owner to accept it. Get the Why and the MVP scope right in that proposal —
nothing edits a charter afterwards, so the review card is the last chance to
change them. Archiving is owner-only and absent entirely. When an existing
charter needs changing, hand back the exact text for a human to paste, and never
work around it by filing a note that contradicts the charter.

BATCH MULTI-STEP WRITES through propose_changes, so the whole set lands as one
Accept/Discard card rather than a trail of half-applied commits.`;
