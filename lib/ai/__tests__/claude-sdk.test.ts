import { describe, it, expect } from "vitest";
import { mapSdkMessages } from "../claude-sdk";

describe("mapSdkMessages", () => {
  it("emits tool-input-available for an assistant tool_use block", () => {
    const parts = mapSdkMessages([
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "Let me do that." },
            {
              type: "tool_use",
              id: "toolu_abc",
              name: "mcp__planner__create_task",
              input: { project: "demo", title: "T", size: "S" },
            },
          ],
        },
      },
    ]);

    expect(parts).toContainEqual({
      type: "text-start",
      id: "t0",
    });
    expect(parts).toContainEqual({
      type: "tool-input-available",
      toolCallId: "toolu_abc",
      toolName: "mcp__planner__create_task",
      input: { project: "demo", title: "T", size: "S" },
    });
  });

  it("emits a matching tool-output-available from a user tool_result block", () => {
    const parts = mapSdkMessages([
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_abc",
              content: "created T-001",
              is_error: false,
            },
          ],
        },
      },
    ]);

    expect(parts).toContainEqual({
      type: "tool-output-available",
      toolCallId: "toolu_abc",
      output: "created T-001",
    });
  });

  it("emits tool-output-error when the tool result is_error", () => {
    const parts = mapSdkMessages([
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_xyz",
              content: "boom",
              is_error: true,
            },
          ],
        },
      },
    ]);

    expect(parts).toContainEqual({
      type: "tool-output-error",
      toolCallId: "toolu_xyz",
      errorText: "boom",
    });
  });

  it("pairs input and output by tool_use_id across assistant + user messages", () => {
    const parts = mapSdkMessages([
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "mcp_tool_use",
              id: "toolu_pair",
              name: "mcp__planner__next_actions",
              input: {},
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_pair",
              content: [{ text: "do the thing" }],
              is_error: false,
            },
          ],
        },
      },
    ]);

    const input = parts.find((p) => p.type === "tool-input-available");
    const output = parts.find((p) => p.type === "tool-output-available");
    expect(input).toBeDefined();
    expect(output).toBeDefined();
    expect((input as { toolCallId: string }).toolCallId).toBe("toolu_pair");
    expect((output as { toolCallId: string }).toolCallId).toBe("toolu_pair");
  });

  it("skips plain user text messages without emitting tool parts", () => {
    const parts = mapSdkMessages([
      { type: "user", message: { content: "just chatting" } },
    ]);
    expect(parts).toHaveLength(0);
  });
});
