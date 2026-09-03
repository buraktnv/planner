import { NextRequest } from "next/server";
import { streamText, tool as aiTool, stepCountIs, convertToModelMessages, type UIMessage, type Tool } from "ai";
import { getProviders } from "@/lib/core/providers";
import { buildSystemContext } from "@/lib/ai/context";
import { recallQuery } from "@/lib/ai/recall";
import { resolveModel } from "@/lib/ai/providers";
import { claudeSdkChat } from "@/lib/ai/claude-sdk";
import { toolSchemas, toolDescriptions, type ToolName } from "@/lib/ai/schemas";
import { toolImplMap } from "@/lib/ai/tool-map";
import { isChatMode, type ChatMode } from "@/lib/ai/modes";
import { parseRevise, toolNamesForRevise } from "@/lib/ai/revise";
import { parseDigest } from "@/lib/ai/digest";
import { isProviderEffort } from "@/lib/ui/providers";
import type { ProviderEffort } from "@/lib/core/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ChatBody {
  messages: UIMessage[];
  profileId?: string;
  focus?: { type: "project" | "area"; slug: string };
  mode?: ChatMode;
  effort?: ProviderEffort;
  /**
   * Set when the user asked, from the review modal, for changes to a batch the
   * model already proposed. It rides in the body rather than the message text
   * so it is sent once and never persisted into the transcript.
   */
  revise?: unknown;
  /**
   * The client windows long transcripts and sends a digest of what it left
   * out. Prompt text, like revise, so it reaches both provider paths; never a
   * message, or the subscription path would re-send it for ever.
   */
  digest?: unknown;
}

const tools: Record<string, Tool> = {};
for (const name of Object.keys(toolSchemas) as ToolName[]) {
  tools[name] = aiTool({
    description: toolDescriptions[name],
    inputSchema: toolSchemas[name],
    execute: (input) => toolImplMap[name](input as Record<string, unknown>),
  });
}

/**
 * On a revise turn the direct write tools are withheld, so the model cannot
 * quietly apply the change instead of re-proposing it. The instruction alone
 * would only discourage that; this makes it impossible.
 */
const reviseTools: Record<string, Tool> = {};
for (const name of toolNamesForRevise()) reviseTools[name] = tools[name];

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
  const effort = isProviderEffort(body.effort) ? body.effort : undefined;

  // Validated and size-capped before it is ever interpolated into a prompt.
  let revise;
  if (body.revise !== undefined && body.revise !== null) {
    const parsed = parseRevise(body.revise);
    if (!parsed.ok) {
      return new Response(JSON.stringify({ error: `Invalid revise payload: ${parsed.error}` }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    revise = parsed.payload;
  }
  const digest = parseDigest(body.digest);

  if (profile.type === "claude-subscription") {
    return claudeSdkChat({
      messages: body.messages,
      focus: body.focus,
      mode,
      model: profile.model,
      effort: effort ?? profile.effort,
      revise,
      digest,
    });
  }

  const system = await buildSystemContext(
    body.focus,
    mode,
    recallQuery(body.messages),
    revise,
    digest,
  );
  const resolved = resolveModel(profile, effort);

  const result = streamText({
    model: resolved.model,
    ...(resolved.providerOptions ? { providerOptions: resolved.providerOptions } : {}),
    system,
    messages: await convertToModelMessages(body.messages),
    tools: revise ? reviseTools : tools,
    stopWhen: stepCountIs(6),
  });

  return result.toUIMessageStreamResponse();
}
