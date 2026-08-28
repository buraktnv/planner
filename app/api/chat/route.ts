import { NextRequest } from "next/server";
import { streamText, tool as aiTool, stepCountIs, convertToModelMessages, type UIMessage, type Tool } from "ai";
import { getProviders } from "@/lib/core/providers";
import { buildSystemContext } from "@/lib/ai/context";
import { resolveModel } from "@/lib/ai/providers";
import { claudeSdkChat } from "@/lib/ai/claude-sdk";
import { toolSchemas, toolDescriptions, type ToolName } from "@/lib/ai/schemas";
import { toolImplMap } from "@/lib/ai/tool-map";
import { isChatMode, type ChatMode } from "@/lib/ai/modes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ChatBody {
  messages: UIMessage[];
  profileId?: string;
  focus?: { type: "project" | "area"; slug: string };
  mode?: ChatMode;
}

const tools: Record<string, Tool> = {};
for (const name of Object.keys(toolSchemas) as ToolName[]) {
  tools[name] = aiTool({
    description: toolDescriptions[name],
    inputSchema: toolSchemas[name],
    execute: (input) => toolImplMap[name](input as Record<string, unknown>),
  });
}

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

  const mode = isChatMode(body.mode) ? body.mode : undefined;

  if (profile.type === "claude-subscription") {
    return claudeSdkChat({ messages: body.messages, focus: body.focus, mode, model: profile.model });
  }

  const system = await buildSystemContext(body.focus, mode);

  const result = streamText({
    model: resolveModel(profile),
    system,
    messages: await convertToModelMessages(body.messages),
    tools,
    stopWhen: stepCountIs(6),
  });

  return result.toUIMessageStreamResponse();
}
