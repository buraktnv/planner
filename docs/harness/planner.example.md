# Sample harness — the planner itself

Copy this to your data repo as `harness/planner.md`, then run:

    npx tsx scripts/harness.ts planner

Every answer below is stated in `AGENTS.md` or in the planner's own notes. A
FAIL means the knowledge is missing or unclear, not that the question is
unfair — see `docs/harness.md`.

## Questions

- Which file holds a project's open and done task lines? | tasks.md
- What are the three sections of a tasks file? | Backlog, In progress, Done
- Why is a task title carrying the field delimiter refused at the writer? | cleanTitle, parseTasks
- What are the four lanes a task can carry? | quick, deep, wait, some
- What does the `waits:` field mean, and what happens when the blocker is done? | dependency, unblock
- What does the `note:` field on a task point at? | knowledge note, component
- What does `target:` link a task to, and where does that target live? | charter, MVP scope
- What is the id shape for a knowledge note, a task and a calendar event? | K-, T-, E-
- Why does every `lib/core` write take a lock? | separate process, id, overwrite
- Is `withDataLock` re-entrant, and what happens if a locked function calls another? | not re-entrant, deadlock
- Why are SVG images refused in the assets directory? | script, XSS
- What is used for diagrams instead of an image? | mermaid
- Who may create a project charter over the MCP server? | nobody, propose, owner
- Where does a task's description live on disk? | details, task id
- Why is a wrong turn recorded in the log rather than the description? | append-only, overwritten
- What three parts does a status entry carry? | What happened, changed elsewhere, Next
- Which two provider paths does the chat have, and how does each return a proposal? | AI SDK, claude-subscription, object, string
- What are the three canvas surfaces? | knowledge, system, tasks
- What does a leading dot do in an `@.` mention? | focus, everywhere
- Which language does the assistant reply in, and which language goes into the files? | user, English
