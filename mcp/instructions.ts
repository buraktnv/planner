/**
 * What every agent connecting to this server is told, before it does anything.
 *
 * This is the always-on half of the contract, and it is deliberately short:
 * an MCP client keeps these instructions in context for the whole session, so
 * anything that is merely useful belongs in the `planner-sync` skill instead.
 * What lives here is only what an agent gets *wrong by default* — filing a
 * duplicate note, re-deciding something already settled, starting work that was
 * never written down, leaving a note's AI text behind its body, fixing another
 * document silently, or trying to write a charter it cannot write.
 */
export const SERVER_INSTRUCTIONS = `This server is a local-first planner: markdown files in a git repo, where every
write takes a lock, appends a journal line and makes a commit. There is no
transaction. A batch of writes applies one at a time and can stop halfway.

READ BEFORE YOU WRITE. Before proposing anything about a project:
- search_knowledge for its slug and each topic you will touch, then read_note
  the hits. A summary is not enough to know whether a decision is already made.
- If a note already covers the thing, update_note it. Never add_note a second
  version — near-duplicates are merged, so it is a silent no-op at best.
- If a recorded decision contradicts your plan, stop and say so, citing the note
  id. Never quietly re-decide something already settled.
- list_components and list_targets show what is already mapped and claimed.

WHAT IS ALREADY HERE IS THE BASELINE, NOT A DRAFT. Extend what is thin, correct
what is wrong, and file nothing that exists already under a new id.

WRITE IT DOWN BEFORE YOU DO IT. An idea that reached you in conversation exists
nowhere else: add_note it even when nobody schedules it. Work becomes a task,
and create_task takes a description — what this is and why — written before the
work. Every task carries target: or note:, or it cannot be prioritised later.
decompose_task anything larger than one sitting, with a reason.

RECORD THE WRONG TURNS AS THEY HAPPEN. add_task_comment appends to a task's log
and nothing overwrites it. Log what you tried before trying the next thing, and
read_task_comments first, so you do not re-run a dead end someone already hit.

POST A STATUS WHEN YOU TURN, NOT WHEN YOU FINISH. post_status the moment a
decision lands, work reveals a follow-up (create_task it with note: or waits:,
then name its id) or another note proves wrong (update_note or propose it, then
name its id). Never fix a second document silently.

A NOTE HAS TWO READINGS. summary is one line, auto-loaded, a claim not a topic.
forAi is the terse text for an assistant, read on mention; the body is for the
person. Changing a body? Pass forAi in the same call, or confirmAi: true once you
have checked it still holds — otherwise the note is marked unchecked. First tag
groups the docs page: architecture, protocol, decision, runbook, reference.

WHAT YOU CANNOT DO HERE. You cannot write a charter, only propose one through
propose_changes as create_project or create_area; nothing edits one afterwards,
so get the Why and MVP scope right, and hand back exact text for a human to
paste when an existing one must change.

BATCH MULTI-STEP WRITES through propose_changes so the set lands as one
Accept/Discard card. A proposal is filed the moment you make it and waits at
/proposals; say so, with its id, rather than claiming the work is done.`;
