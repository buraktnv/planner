# Writing a canvas from outside the browser

2026-09-04

## The gap

The canvas has three surfaces — the global knowledge board, a charter's system
map, a charter's task map — and until now every one of them could only be
changed by dragging. `lib/core/canvas.ts` had a complete writer set
(`saveNodePositions`, `addCanvasEdge`, `removeCanvasEdge`) and the only caller
was `PATCH /api/canvas`, driven by a mouse.

So an agent could read the graph and never change it. `list_components` answers
"what requires what" for a project's system map, which is exactly enough to
reason about structure and exactly not enough to record the conclusion. An
agent that worked out that the detector cannot be built before camera control
had nowhere to put that. Worse, nothing told it what was on a map at all:
`list_components` reports edges between notes it already knows about, and says
nothing about positions, sizes, or a ref whose note has since been deleted.

## What was added

Four tools, in `lib/ai/tools.ts`, reachable from both the app's chat and the MCP
server because both dispatch through `toolImplMap`.

- **`read_canvas`** — every card with its position and size, every arrow, which
  live cards are unplaced, and which placed refs point at nothing. `READ_TOOLS`,
  so a readonly agent gets it.
- **`place_card`** — one card to a position, or a new size. `WRITE_TOOLS`.
- **`connect_cards`** / **`disconnect_cards`** — one arrow. `WRITE_TOOLS` *and*
  `proposalActionSchema` members.

One surface selector serves all four: no `project` is the knowledge board; with
a project, `map` is `system` (default) or `tasks`.

## Decisions

**The edge kind is `relation`, not `kind`.** `kind` is the discriminant of
`proposalActionSchema`, and the union is built by spreading a base shape into
`{ kind: z.literal(...) }`. A field named `kind` in the base shape silently
overwrites the discriminant, which would have broken the whole union rather
than just these two members.

**Arrows are proposable; positions are not.** An arrow is a claim about
structure that the owner may disagree with, so it earns a review row and a
readonly agent can still make one. Where a card sits is not a claim, and a
review row reading "moved 40px" is noise. This is the same seam as
`add_task_comment`, which is a write and deliberately not a proposal because it
records what already happened.

**The charter is resolved before a surface is built.** `canvasPathFor`
interpolates the slug straight into a file path, so `canvasSurfaceOf` calls
`getCharter` first and the surface carries `charter.id`, never the caller's
string. A slug that resolved to a real charter cannot be a traversal.

**The tools re-validate what the core deliberately tolerates.** `applyMoves`
and `addCanvasEdge` silently skip a ref they do not like — correct for a file
two processes write and a human edits, wrong for a tool call, where it makes a
typo a successful call that wrote nothing. Both writers therefore check the ref
is a card on that map. `disconnect_cards` checks neither ref, because removing
an arrow to a note that has already been deleted is the point.

**Arrows stay rationed.** Every `[[K-nnn]]` in a note body already draws one.
The tool descriptions say so: draw an arrow only for a relationship the note
text does not carry.

## Verification

`npm run lint`, `npx tsc --noEmit`, `npm test` (1320, up from 1296) and
`npm run build` green. The proof that matters is in `mcp/__tests__/stdio.test.ts`:
it spawns the real server over stdio against a throwaway `PLANNER_DATA_DIR`,
files two notes, places one, connects them, and reads the map back.
