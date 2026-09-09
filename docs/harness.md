# The knowledge harness

A repeatable number for one question: **does the assistant know this project
from that project's own knowledge?** Twenty questions, one score. A wrong
answer points at a missing or unclear note, so the harness doubles as the
backlog for the knowledge base.

## The question file

It lives in the **data repo**, not this one: `harness/<slug>.md`, where `<slug>`
is a charter slug. One question per line under a `## Questions` heading:

```
## Questions

- Which file holds a project's task lines? | tasks.md
- Why is a title with the delimiter refused? | cleanTitle, parseTasks
- Who may create a charter over MCP? | nobody, propose, owner
```

The grammar is `- <question> | <keyword>[, <keyword>...]`. A question **passes
when every keyword appears in the reply**, case-insensitive, anywhere, matched
as plain substrings. That is the whole grader. Grading with a model is
deliberately out of scope: the score would then depend on the same thing it is
measuring, and would move on its own between runs.

Keywords are the **last** field on the line, so a question may itself quote a
` | ` — but a keyword may not contain one, and a keyword may not contain a
comma either, since commas separate them.

The parser (`lib/core/harness.ts`) is **total: it never throws.** This file is
written by hand, so a half-finished line is the normal case, and a line it does
not understand is skipped while the rest of the file still runs. That is the
opposite of `parseTasks`, where a mis-parse must stop the world — nothing here
is data anyone would lose.

## Running it

```bash
npx tsx scripts/harness.ts <slug> [--profile <id>]
```

For each question the runner builds the **same system context the chat would**
for that focused charter — the same notes, the same charter, the same ranked
tasks — asks the model with **no tools**, and checks the keywords. Without
`--profile` it uses the default provider profile. A `claude-subscription`
profile is refused: it is chat-only, exactly as distillation and COMPARE are.

Output is one line per question, then `N/M passed`. The exit code is 1 when
anything failed, so it can be scripted later.

It is run **by hand**. There is no MCP tool, no route and no button: a run costs
twenty model calls, and a number nobody looked at is not a measurement.

The runner **reads the data repo and writes nothing to it** — no journal line,
no commit, no note. A measurement that changed the thing it measures would be
worthless.

## What a FAIL means

**Fix the note, not the question.** A failing question is the harness working:
it says the answer is not reachable from what the assistant is given. In order
of likelihood:

1. The fact is written nowhere. Write the note (`add_note`), scoped to the
   charter so it auto-loads.
2. The fact is in a note body but not in its summary or its `## For the AI`
   section, so the model never sees it without being told to read the note.
3. The fact is there and the wording differs. Widen the keyword — but only
   after checking the reply actually says the right thing.

Editing the keyword to match whatever the model happened to say is how a
harness becomes a test that always passes.

## The sample

`docs/harness/planner.example.md` in this repo is twenty questions about the
planner itself, all answerable from `AGENTS.md` and the planner's notes. Copy
it into the data repo as `harness/planner.md` and run it. Any example slug in a
question uses an `acme-*` placeholder; this repo is public and holds no
personal data.
