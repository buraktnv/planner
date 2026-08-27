import { NextRequest } from "next/server";
import { streamText, tool, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { getProviders } from "@/lib/core/providers";
import { buildSystemContext } from "@/lib/ai/context";
import { resolveModel } from "@/lib/ai/providers";
import { claudeSdkChat } from "@/lib/ai/claude-sdk";
import { toolImpls } from "@/lib/ai/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ChatBody {
  messages: UIMessage[];
  profileId?: string;
  focus?: { type: "project" | "area"; slug: string };
}

const tools = {
  list_projects: tool({
    description: "List all projects (charters).",
    inputSchema: z.object({}),
    execute: () => toolImpls.listProjects(),
  }),
  list_areas: tool({
    description: "List all life areas (charters).",
    inputSchema: z.object({}),
    execute: () => toolImpls.listAreas(),
  }),
  get_context: tool({
    description: "Get charter context, open tasks, and the about text for a project or area.",
    inputSchema: z.object({
      type: z.enum(["project", "area"]).optional(),
      slug: z.string().optional(),
    }),
    execute: ({ type, slug }) => toolImpls.getContext({ type, slug }),
  }),
  create_project: tool({
    description: "Create a new project charter.",
    inputSchema: z.object({
      name: z.string(),
      why: z.string(),
      mvp: z.string(),
    }),
    execute: ({ name, why, mvp }) => toolImpls.createProject({ name, why, mvp }),
  }),
  create_area: tool({
    description: "Create a new life area charter.",
    inputSchema: z.object({
      name: z.string(),
      why: z.string(),
    }),
    execute: ({ name, why }) => toolImpls.createArea({ name, why }),
  }),
  create_task: tool({
    description: "Create a task in a project or area (slug or area:<slug>).",
    inputSchema: z.object({
      project: z.string(),
      title: z.string(),
      size: z.enum(["S", "M", "L"]),
    }),
    execute: ({ project, title, size }) => toolImpls.createTask({ project, title, size }),
  }),
  update_task: tool({
    description: "Update a task's fields (title, size, section, est, due, done).",
    inputSchema: z.object({
      project: z.string(),
      id: z.string(),
      title: z.string().optional(),
      size: z.enum(["S", "M", "L"]).optional(),
      section: z.enum(["backlog", "in-progress", "done"]).optional(),
      est: z.string().optional(),
      due: z.string().optional(),
      complete: z.boolean().optional(),
    }),
    execute: (input) => toolImpls.updateTask(input),
  }),
  decompose_task: tool({
    description: "Break a task into subtasks.",
    inputSchema: z.object({
      project: z.string(),
      id: z.string(),
      subtasks: z.array(
        z.object({
          title: z.string(),
          size: z.enum(["S", "M", "L"]),
        }),
      ),
    }),
    execute: ({ project, id, subtasks }) => toolImpls.decomposeTask({ project, id, subtasks }),
  }),
  move_to_parking_lot: tool({
    description: "Add an idea to a charter's parking lot.",
    inputSchema: z.object({
      project: z.string(),
      idea: z.string(),
    }),
    execute: ({ project, idea }) => toolImpls.moveToParkingLot({ project, idea }),
  }),
  add_journal: tool({
    description: "Append a journal entry for a scope.",
    inputSchema: z.object({
      scope: z.string(),
      message: z.string(),
    }),
    execute: ({ scope, message }) => toolImpls.addJournal({ scope, message }),
  }),
  next_actions: tool({
    description: "Get the prioritized list of next actions across the workspace.",
    inputSchema: z.object({}),
    execute: () => toolImpls.nextActions(),
  }),
  weekly_summary: tool({
    description: "Get insights and the last 7 days of journal digest.",
    inputSchema: z.object({}),
    execute: () => toolImpls.weeklySummary(),
  }),
};

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: "messages array is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { profiles, default: defaultId } = await getProviders();
  const profile =
    (body.profileId && profiles.find((p) => p.id === body.profileId)) ||
    profiles.find((p) => p.id === defaultId) ||
    undefined;

  if (!profile) {
    return new Response(
      JSON.stringify({ error: "No provider profile found (missing or default not set)" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  if (profile.type === "claude-subscription") {
    return claudeSdkChat({ messages: body.messages, focus: body.focus });
  }

  const system = await buildSystemContext(body.focus);

  const result = streamText({
    model: resolveModel(profile),
    system,
    messages: await convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(6),
  });

  return result.toUIMessageStreamResponse();
}
