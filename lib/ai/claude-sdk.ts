import type { UIMessage } from "ai";
import {
  query,
  createSdkMcpServer,
  tool as sdkTool,
} from "@anthropic-ai/claude-agent-sdk";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { buildSystemContext } from "./context";
import { recallQuery } from "./recall";
import type { ChatMode } from "./modes";
import type { ProviderEffort } from "../core/types";
import { toolShapes, toolDescriptions, toolNames, type ToolName } from "./schemas";
import { toolImplMap } from "./tool-map";

export interface ClaudeSdkChatOptions {
  messages: UIMessage[];
  focus?: { type: "project" | "area"; slug: string };
  mode?: ChatMode;
  model?: string;
  effort?: ProviderEffort;
}

type StreamPart =
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | { type: "tool-input-available"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-output-available"; toolCallId: string; output: unknown }
  | { type: "tool-output-error"; toolCallId: string; errorText: string };

interface TextBlock {
  type: "text";
  text: string;
}
interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}
interface ToolUseBlock {
  type: "tool_use" | "mcp_tool_use";
  id: string;
  name: string;
  input: unknown;
}
interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | Array<{ text: string }>;
  is_error?: boolean;
}

function blockText(content: string | Array<{ text: string }> | undefined): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content.map((c) => c.text).join("\n");
}

function mapAssistantBlocks(blocks: unknown[]): StreamPart[] {
  const parts: StreamPart[] = [];
  let textId = 0;
  for (const block of blocks) {
    if ((block as ThinkingBlock).type === "thinking") {
      const id = `r${textId++}`;
      const thinking = (block as ThinkingBlock).thinking ?? "";
      parts.push({ type: "reasoning-start", id });
      parts.push({ type: "reasoning-delta", id, delta: thinking });
      parts.push({ type: "reasoning-end", id });
    } else if ((block as TextBlock).type === "text") {
      const id = `t${textId++}`;
      parts.push({ type: "text-start", id });
      parts.push({ type: "text-delta", id, delta: (block as TextBlock).text });
      parts.push({ type: "text-end", id });
    } else if ((block as ToolUseBlock).type === "tool_use" || (block as ToolUseBlock).type === "mcp_tool_use") {
      const b = block as ToolUseBlock;
      parts.push({
        type: "tool-input-available",
        toolCallId: b.id,
        toolName: b.name,
        input: b.input,
      });
    } else if ((block as { type: string }).type === "mcp_tool_result") {
      const b = block as unknown as ToolResultBlock;
      const output = blockText(b.content);
      parts.push(
        b.is_error
          ? { type: "tool-output-error", toolCallId: b.tool_use_id, errorText: output }
          : { type: "tool-output-available", toolCallId: b.tool_use_id, output },
      );
    }
  }
  return parts;
}

function mapUserBlocks(blocks: unknown[]): StreamPart[] {
  const parts: StreamPart[] = [];
  for (const block of blocks) {
    if ((block as ToolResultBlock).type === "tool_result") {
      const b = block as ToolResultBlock;
      const output = blockText(b.content);
      parts.push(
        b.is_error
          ? { type: "tool-output-error", toolCallId: b.tool_use_id, errorText: output }
          : { type: "tool-output-available", toolCallId: b.tool_use_id, output },
      );
    }
  }
  return parts;
}

export function mapSdkMessages(messages: unknown[]): StreamPart[] {
  const parts: StreamPart[] = [];
  for (const msg of messages) {
    const m = msg as { type: string; message?: { content?: unknown | unknown[] } };
    if (m.type === "assistant" && m.message) {
      const content = m.message.content;
      parts.push(...mapAssistantBlocks(Array.isArray(content) ? (content as unknown[]) : []));
    } else if (m.type === "user" && m.message) {
      const content = m.message.content;
      const blocks = typeof content === "string" ? [] : Array.isArray(content) ? content : [];
      parts.push(...mapUserBlocks(blocks as unknown[]));
    }
  }
  return parts;
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
  const { messages, focus, mode, model = "sonnet", effort } = opts;
  const system = await buildSystemContext(focus, mode, recallQuery(messages));
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
            model,
            maxTurns: 12,
            tools: [],
            ...(effort ? { effort } : {}),
          },
        });

        for await (const msg of q) {
          for (const part of mapSdkMessages([msg])) {
            writer.write(part as Parameters<typeof writer.write>[0]);
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
