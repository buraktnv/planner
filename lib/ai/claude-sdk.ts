import type { UIMessage } from "ai";
import {
  query,
  createSdkMcpServer,
  tool as sdkTool,
} from "@anthropic-ai/claude-agent-sdk";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { buildSystemContext } from "./context";
import { toolShapes, toolDescriptions, toolImplMap, toolNames, type ToolName } from "./schemas";

export interface ClaudeSdkChatOptions {
  messages: UIMessage[];
  focus?: { type: "project" | "area"; slug: string };
}

function formatTranscript(messages: UIMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = m.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { text?: string }).text ?? "")
      .join("\n")
      .trim();
    if (text) lines.push(`${m.role === "user" ? "User" : "Assistant"}: ${text}`);
  }
  return lines.join("\n\n");
}

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not.*log ?in|oauth|authentic|unauthor|401|no.*credential|credential/i.test(msg)) {
    return `Claude subscription not authenticated: run \`claude login\` or set CLAUDE_CODE_OAUTH_TOKEN. (${msg})`;
  }
  return msg;
}

function buildMcpServer() {
  const sdkTools = toolNames.map((name: ToolName) =>
    sdkTool(
      name,
      toolDescriptions[name],
      toolShapes[name],
      async (args: Record<string, unknown>) => {
        const result = await toolImplMap[name](args);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    ),
  );
  return createSdkMcpServer({ name: "planner", version: "1.0.0", tools: sdkTools });
}

export async function claudeSdkChat(opts: ClaudeSdkChatOptions): Promise<Response> {
  const { messages, focus } = opts;
  const system = await buildSystemContext(focus);
  const prompt = formatTranscript(messages) || "Hello";

  const server = buildMcpServer();
  const allowedTools = toolNames.map((n) => `mcp__planner__${n}`);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        const q = query({
          prompt,
          options: {
            systemPrompt: system,
            mcpServers: { planner: server },
            allowedTools,
            model: "sonnet",
            maxTurns: 12,
            tools: [],
          },
        });

        let textId = 0;
        for await (const msg of q) {
          if (msg.type !== "assistant") continue;
          for (const block of msg.message.content) {
            if (block.type === "text") {
              const id = `t${textId++}`;
              writer.write({ type: "text-start", id });
              writer.write({ type: "text-delta", id, delta: block.text });
              writer.write({ type: "text-end", id });
            } else if (block.type === "mcp_tool_use" || block.type === "tool_use") {
              writer.write({
                type: "tool-input-available",
                toolCallId: block.id,
                toolName: block.name,
                input: block.input,
              });
            } else if (block.type === "mcp_tool_result") {
              const output =
                typeof block.content === "string"
                  ? block.content
                  : block.content.map((c) => c.text).join("\n");
              if (block.is_error) {
                writer.write({
                  type: "tool-output-error",
                  toolCallId: block.tool_use_id,
                  errorText: output,
                });
              } else {
                writer.write({
                  type: "tool-output-available",
                  toolCallId: block.tool_use_id,
                  output,
                });
              }
            }
          }
        }
      } catch (err) {
        writer.write({ type: "error", errorText: describeError(err) });
      }
    },
    onError: (error) => describeError(error),
  });

  return createUIMessageStreamResponse({ stream });
}
