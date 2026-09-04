import { z, type ZodRawShape } from "zod";
import type { TaskLane } from "../core/types";

/** "" is accepted because the review modal's cleared select sends it, and the writer reads it as "no repeat". */
const eventRepeat = z.enum(["yearly", "monthly", "weekly", ""]).optional();

const baseShapes = {
  list_projects: {},
  list_areas: {},
  get_context: {
    type: z.enum(["project", "area"]).optional(),
    slug: z.string().optional(),
  },
  create_project: {
    name: z.string(),
    why: z.string(),
    mvp: z.string(),
  },
  create_area: {
    name: z.string(),
    why: z.string(),
  },
  create_task: {
    project: z.string(),
    title: z.string(),
    size: z.enum(["S", "M", "L"]),
    est: z.string().optional(),
    due: z.string().optional(),
    lane: z.enum(["quick", "deep", "wait", "some"]).optional(),
    target: z.string().optional(),
    note: z.string().optional(),
    waitsOn: z.string().optional(),
    description: z.string().optional(),
  },
  update_task: {
    project: z.string(),
    id: z.string(),
    title: z.string().optional(),
    size: z.enum(["S", "M", "L"]).optional(),
    section: z.enum(["backlog", "in-progress", "done"]).optional(),
    est: z.string().optional(),
    due: z.string().optional(),
    target: z.string().optional(),
    note: z.string().optional(),
    waitsOn: z.string().optional(),
    complete: z.boolean().optional(),
  },
  decompose_task: {
    project: z.string(),
    id: z.string(),
    subtasks: z.array(
      z.object({
        title: z.string(),
        size: z.enum(["S", "M", "L"]),
        plan: z.string().optional(),
      }),
    ),
    reason: z.string().optional(),
  },
  move_to_parking_lot: {
    project: z.string(),
    idea: z.string(),
  },
  add_journal: {
    scope: z.string(),
    message: z.string(),
  },
  list_events: {
    from: z.string().optional(),
    to: z.string().optional(),
  },
  create_event: {
    date: z.string(),
    title: z.string(),
    time: z.string().optional(),
    note: z.string().optional(),
    scope: z.string().optional(),
    action: z.string().optional(),
    repeat: eventRepeat,
    lead: z.number().int().min(0).max(999).optional(),
  },
  update_event: {
    id: z.string(),
    date: z.string().optional(),
    title: z.string().optional(),
    time: z.string().optional(),
    note: z.string().optional(),
    scope: z.string().optional(),
    action: z.string().optional(),
    repeat: eventRepeat,
    lead: z.number().int().min(0).max(999).optional(),
    done: z.boolean().optional(),
  },
  get_daily: {},
  log_daily: {
    id: z.string(),
  },
  create_habit: {
    name: z.string(),
    goal: z.number().int().positive(),
    unit: z.string().optional(),
  },
  create_rhythm: {
    name: z.string(),
    per: z.number().int().positive(),
  },
  create_meal: {
    name: z.string(),
    servings: z.number().int().positive(),
  },
  add_grocery: {
    name: z.string(),
    cat: z.string().optional(),
  },
  set_grocery: {
    id: z.string(),
    got: z.boolean(),
  },
  read_task_detail: {
    project: z.string(),
    id: z.string(),
  },
  write_task_detail: {
    project: z.string(),
    id: z.string(),
    body: z.string(),
  },
  read_task_comments: {
    project: z.string(),
    id: z.string(),
    limit: z.number().int().positive().optional(),
  },
  add_task_comment: {
    project: z.string(),
    id: z.string(),
    body: z.string(),
  },
  search_knowledge: {
    query: z.string(),
    scope: z.string().optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().int().positive().optional(),
  },
  read_note: {
    id: z.string(),
  },
  add_note: {
    title: z.string().optional(),
    summary: z.string(),
    body: z.string().optional(),
    scope: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
  },
  update_note: {
    id: z.string(),
    title: z.string().optional(),
    summary: z.string().optional(),
    body: z.string().optional(),
    scope: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
  },
  attach_image: {
    path: z.string(),
    noteId: z.string().optional(),
    alt: z.string().optional(),
  },
  next_actions: {},
  list_targets: { project: z.string().optional() },
  list_components: { project: z.string() },
  /**
   * The three canvas shapes share one surface selector: no `project` is the
   * global knowledge board, and with a project `map` picks its component map or
   * its task map. The edge kind is called `relation` rather than `kind` on
   * purpose — `kind` is the discriminant of `proposalActionSchema`, so a field
   * of that name would be overwritten by the spread that builds the union.
   */
  read_canvas: {
    project: z.string().optional(),
    map: z.enum(["system", "tasks"]).optional(),
  },
  place_card: {
    project: z.string().optional(),
    map: z.enum(["system", "tasks"]).optional(),
    ref: z.string(),
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().positive().optional(),
    h: z.number().int().positive().optional(),
  },
  connect_cards: {
    project: z.string().optional(),
    map: z.enum(["system", "tasks"]).optional(),
    from: z.string(),
    to: z.string(),
    relation: z.enum(["requires", "triggers", "rel"]).optional(),
    label: z.string().optional(),
  },
  disconnect_cards: {
    project: z.string().optional(),
    map: z.enum(["system", "tasks"]).optional(),
    from: z.string(),
    to: z.string(),
    relation: z.enum(["requires", "triggers", "rel"]).optional(),
  },
  weekly_summary: {},
  life_trends: {},
} satisfies Record<string, ZodRawShape>;

export const proposalActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create_task"), ...baseShapes.create_task }),
  z.object({ kind: z.literal("update_task"), ...baseShapes.update_task }),
  z.object({ kind: z.literal("decompose_task"), ...baseShapes.decompose_task }),
  z.object({ kind: z.literal("move_to_parking_lot"), ...baseShapes.move_to_parking_lot }),
  z.object({ kind: z.literal("create_event"), ...baseShapes.create_event }),
  z.object({ kind: z.literal("update_event"), ...baseShapes.update_event }),
  z.object({ kind: z.literal("add_note"), ...baseShapes.add_note }),
  z.object({ kind: z.literal("update_note"), ...baseShapes.update_note }),
  /**
   * An arrow is a claim about structure, so it is proposable as well as
   * writable — a readonly agent that has read a map can still say what it
   * thinks connects to what. `place_card` deliberately is not: where a card
   * sits is not a claim, and a review row reading "moved 40px" is noise.
   */
  z.object({ kind: z.literal("connect_cards"), ...baseShapes.connect_cards }),
  z.object({ kind: z.literal("disconnect_cards"), ...baseShapes.disconnect_cards }),
  z.object({ kind: z.literal("create_habit"), ...baseShapes.create_habit }),
  z.object({ kind: z.literal("create_rhythm"), ...baseShapes.create_rhythm }),
  z.object({ kind: z.literal("create_meal"), ...baseShapes.create_meal }),
  /**
   * A charter is the one thing an agent may *propose* but never write. No tool
   * edits a charter after the fact, so the review modal is the only moment its
   * Why and MVP scope can be corrected — which is exactly why these arrive here
   * rather than in `WRITE_TOOLS`.
   */
  z.object({ kind: z.literal("create_project"), ...baseShapes.create_project }),
  z.object({ kind: z.literal("create_area"), ...baseShapes.create_area }),
]);

export type ProposalAction = z.infer<typeof proposalActionSchema>;
export type ProposalActionKind = ProposalAction["kind"];

export interface ProposalPreviewRow {
  kind: ProposalActionKind;
  id: string;
  title: string;
  lane: TaskLane | null;
  note: string;
  detail?: string;
  charterName: string;
  color: string;
  /** Charter the row's task lives in ("<slug>" or "area:<slug>"). Absent when the row is not a task, or when the task does not exist yet. */
  scope?: string;
}

export interface Proposal {
  proposalId: string;
  title: string;
  summary?: string;
  actions: ProposalAction[];
  preview: ProposalPreviewRow[];
}

export interface ProposalActionResult {
  kind: ProposalActionKind;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ProposalApplyResult {
  applied: number;
  failedIndex: number | null;
  results: ProposalActionResult[];
}

export const toolShapes = {
  ...baseShapes,
  propose_changes: {
    title: z.string(),
    summary: z.string().optional(),
    actions: z.array(proposalActionSchema),
  },
} satisfies Record<string, ZodRawShape>;

export const proposalSchema = z.object(toolShapes.propose_changes);

export type ProposalInput = z.infer<typeof proposalSchema>;

export type ToolName = keyof typeof toolShapes;

export const toolNames = Object.keys(toolShapes) as ToolName[];

export const toolSchemas = toolNames.reduce((acc, name) => {
  acc[name] = z.object(toolShapes[name]);
  return acc;
}, {} as Record<ToolName, z.ZodTypeAny>);

export const toolDescriptions: Record<ToolName, string> = {
  list_projects: "List all projects (charters).",
  list_areas: "List all life areas (charters).",
  get_context:
    "Get charter context, open tasks, and the about text for a project or area.",
  create_project: "Create a new project charter.",
  create_area: "Create a new life area charter.",
  create_task:
    "Create a task in a project or area (slug or area:<slug>). due is an ISO date (2026-09-04) and est is free text like '2h' — set due whenever the work has a real deadline, rather than creating the task and updating it afterwards. lane picks the board column (quick, deep, wait, some); omit it and it is derived from size. waitsOn marks it blocked by a task id in the same file or by free text. target links it to a charter goal (G-001) from list_targets, which is what makes that goal show real progress. note links it to a component (K-001) from list_components, which is what makes that component show real progress. description is free markdown saved as the task's description, the same text read_task_detail returns — write it here rather than creating the task and calling write_task_detail afterwards.",
  update_task:
    "Update a task's fields (title, size, section, est, due, target, note, waitsOn, done). Pass waitsOn, target or note as an empty string to clear it.",
  decompose_task:
    "Break a task into subtasks. Each subtask may carry an optional plan — free markdown stored alongside it. reason says why the work splits into these pieces and is appended to the parent's log, where it is dated and cannot be overwritten later.",
  move_to_parking_lot: "Add an idea to a charter's parking lot.",
  add_journal: "Append a journal entry for a scope.",
  list_events:
    "List calendar events, optionally limited to an ISO date range (from/to, inclusive).",
  create_event:
    "Create a calendar event on an ISO date. time is free text up to 12 characters, scope is a project slug or area:<slug> and is optional, action is what still needs doing before the event. repeat makes it recur from the date given — a birthday is yearly; put the birth year in note, since ticking a repeating event advances its date to the next occurrence. lead is how many days before the date it should surface in Today and in context: pair it with action for anything that must be done ahead, like a photoshoot three weeks before a passport appointment. A routine is a habit or rhythm, never a repeating event.",
  update_event:
    "Update a calendar event (date, title, time, note, scope, action, repeat, lead, done). Pass an empty string to clear time, note, scope, action or repeat, and 0 to clear lead. Marking a repeating event done advances it to its next occurrence instead of closing it.",
  get_daily:
    "Get the daily habits, weekly rhythms, prepped meals, grocery list and the raw activity log for the last 28 days (logDays says how many).",
  log_daily:
    "Count one tick for a habit (H-) or a rhythm (R-). When the goal for today or the week is already met the tick wraps around and resets the count.",
  create_habit:
    "Create a daily habit, counted on /daily. goal is how many times a day it should happen; unit is optional free text describing one count ('× 15 min'). Something the user wants to do every day is a habit — create it as one. Never create a task that says to add a habit by hand; that is the thing this tool exists to avoid.",
  create_rhythm:
    "Create a weekly rhythm, counted on /daily. per is how many times in a Mon–Sun week it should happen. Use this rather than a habit when the thing does not need to happen every day, and rather than a task when it repeats.",
  create_meal:
    "Add a prepped meal with a live servings count, eaten down on /daily. servings is how many portions exist now.",
  add_grocery: "Add an item to the grocery list. cat is a free-text category, default Other.",
  set_grocery: "Mark a grocery item as got (true) or back on the list (false).",
  read_task_detail:
    "Read the plan attached to one task or subtask — the notes, steps and decisions behind it. Task lines only carry a title, so read this before working on a task. Returns an empty body when nothing is written yet.",
  write_task_detail:
    "Write the plan for one task or subtask, replacing whatever is there. Free markdown: steps, findings, decisions, anything worth keeping. It replaces and never appends, so anything that has to survive the next edit — what you tried, what failed — goes to add_task_comment instead. id accepts a subtask id like T-007.2. An empty body removes the plan.",
  read_task_comments:
    "Read the log for one task or subtask: every dated entry, oldest first, including approaches that did not work. Read it with read_task_detail before restarting work — the description says what was intended, the log says what actually happened. limit returns only the most recent entries.",
  add_task_comment:
    "Append one dated entry to a task's log. Nothing is overwritten and nothing can be edited afterwards, so this is where an approach that failed belongs: say what you tried and why you abandoned it. Log it when you turn back, not only when you finish. id accepts a subtask id like T-007.2.",
  search_knowledge:
    "Search the knowledge base and get ranked snippets. Use this whenever the answer might already be written down — the system prompt only lists notes for the focused scope. scope filters to a project slug or area:<slug>; tags must all match.",
  read_note: "Read one knowledge note in full, with the notes it links to and the notes linking back to it.",
  add_note:
    "File a knowledge note. summary must be a single line stating the conclusion, not the topic — it is the only text loaded into context until someone searches. title is optional and is derived from the summary when omitted. Leave scope empty and it is categorised automatically into the right area or project; pass it only when you are certain. File the note even when no task is being created for the idea: work that becomes a task is at least visible on a board, so an idea nobody is scheduling is the one actually at risk of being lost.",
  update_note:
    "Amend a knowledge note. Only the fields you pass change; updated is bumped. Pass source as an empty string to clear it.",
  attach_image:
    "Copy an image file into the data repo and optionally append it to a knowledge note. path is read from the filesystem this server runs on. Use it for a screenshot or diagram that belongs with a note; the file is committed, so it survives and works on another machine. PNG, JPEG, GIF, WebP and AVIF only, up to 2 MB — SVG is refused. Identical images are stored once.",
  next_actions: "Get the prioritized list of next actions across the workspace.",
  list_targets:
    "List the goals (targets) on a charter, with their G- ids, milestone grouping and progress. Read this before setting target: on a task — an id that does not exist simply shows no link.",
  list_components:
    "Read a project's system map: its components (knowledge notes on its canvas), what each one requires or is required by, what it triggers, and how much of its delegated work is done. Read this before changing a component — it says what must exist first.",
  read_canvas:
    "Read a canvas map: every card on it with its position and size, every arrow between them, which live cards are not placed yet, and which placed refs point at something that no longer exists. Omit project for the global knowledge board; with a project, map is 'system' for its component map (knowledge notes) or 'tasks' for its task map. Read this before drawing an arrow or moving a card — it is the only way to see what is already there.",
  place_card:
    "Put one card at a position on a canvas map, or resize it. ref is a note (K-001), a task (T-007) or a target (G-001) — it must already exist. x and y are absolute board coordinates, so read_canvas first and place relative to what is there. w and h are optional; a bigger card shows its summary or its full body instead of just a title. A card that is already placed is moved.",
  connect_cards:
    "Draw an arrow between two cards on a canvas map. relation is 'requires' (from cannot be built until to exists), 'triggers' (from causes to) or 'rel' (a plain relationship, the default). Arrows are rationed on purpose: a [[K-nnn]] link in a note body already draws one, so only draw an arrow for something the note text does not say. Both refs must exist on that map's charter.",
  disconnect_cards:
    "Remove an arrow between two cards on a canvas map. relation must match the arrow being removed ('rel' by default). An arrow derived from a [[K-nnn]] link cannot be removed here — edit the note body instead.",
  weekly_summary: "Get insights and the last 7 days of journal digest.",
  life_trends:
    "Eight weeks of trend: per habit the weekly adherence, streak, slope in percentage points per week and days since last logged; per rhythm the count against its target by week; task throughput by week; open and done per charter; and charters idle for more than two weeks. Read this before saying how things are going, and project forward from the slope rather than from today alone.",
  propose_changes:
    "Propose a batch of changes without writing anything — tasks, events and knowledge notes. Returns a preview the user must Accept before it is applied. Use this for any set of writes; use the direct tools only for a single, explicitly requested change.",
};
