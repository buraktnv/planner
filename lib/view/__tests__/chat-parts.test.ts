import { describe, expect, it } from "vitest";
import {
  asProposal,
  isToolPart,
  normaliseOutput,
  partsOf,
  toolNameOf,
  toolStatus,
  toolSummary,
  type ToolPartLike,
} from "../chat-parts";
import type { Proposal } from "@/lib/ai/schemas";

const proposal: Proposal = {
  proposalId: "p-1",
  title: "Two changes",
  actions: [
    { kind: "create_task", project: "acme-app", title: "Sketch it", size: "S" },
    { kind: "move_to_parking_lot", project: "acme-app", idea: "Streaming" },
  ],
  preview: [
    {
      kind: "create_task",
      id: "NEW",
      title: "Sketch it",
      lane: "quick",
      note: "",
      charterName: "Acme App",
      color: "#7d95dd",
    },
    {
      kind: "move_to_parking_lot",
      id: "PARK",
      title: "Streaming",
      lane: "some",
      note: "parking lot",
      charterName: "Acme App",
      color: "#7d95dd",
    },
  ],
};

function part(over: Partial<ToolPartLike> = {}): ToolPartLike {
  return { type: "tool-propose_changes", state: "output-available", ...over };
}

describe("toolNameOf", () => {
  it("strips the tool- prefix the AI SDK path adds", () => {
    expect(toolNameOf({ type: "tool-next_actions" })).toBe("next_actions");
  });

  it("strips the mcp__planner__ prefix the subscription path adds", () => {
    expect(toolNameOf({ type: "dynamic-tool", toolName: "mcp__planner__add_note" })).toBe(
      "add_note",
    );
  });

  it("prefers an explicit toolName over the part type", () => {
    expect(toolNameOf({ type: "tool-ignored", toolName: "read_note" })).toBe("read_note");
  });

  it("leaves a bare name alone", () => {
    expect(toolNameOf({ type: "get_daily" })).toBe("get_daily");
  });
});

describe("normaliseOutput", () => {
  it("parses the JSON string the subscription path produces", () => {
    expect(normaliseOutput('{"id":"T-001"}')).toEqual({ id: "T-001" });
    expect(normaliseOutput("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("passes an object straight through", () => {
    const value = { id: "T-001" };
    expect(normaliseOutput(value)).toBe(value);
  });

  it("leaves a plain string alone rather than mangling it", () => {
    expect(normaliseOutput("all done")).toBe("all done");
  });

  it("returns unparseable JSON-looking text as-is instead of throwing", () => {
    expect(normaliseOutput("{not json")).toBe("{not json");
  });

  it("passes null and undefined through", () => {
    expect(normaliseOutput(null)).toBeNull();
    expect(normaliseOutput(undefined)).toBeUndefined();
  });
});

describe("asProposal", () => {
  it("reads an object output — the AI SDK path", () => {
    expect(asProposal(proposal)?.title).toBe("Two changes");
  });

  it("reads a JSON string output — the subscription path", () => {
    expect(asProposal(JSON.stringify(proposal))?.actions).toHaveLength(2);
  });

  it("rejects anything missing the fields the card renders", () => {
    expect(asProposal({ title: "No actions" })).toBeNull();
    expect(asProposal({ actions: [], preview: [] })).toBeNull();
    expect(asProposal({ title: "x", actions: [], preview: "not an array" })).toBeNull();
  });

  it("returns null rather than throwing on junk", () => {
    expect(asProposal("{broken")).toBeNull();
    expect(asProposal(null)).toBeNull();
    expect(asProposal(42)).toBeNull();
    expect(asProposal([proposal])).toBeNull();
  });
});

describe("toolStatus", () => {
  it("separates a failed tool from a pending one", () => {
    expect(toolStatus(part({ state: "output-error" }))).toBe("error");
    expect(toolStatus(part({ state: "input-available" }))).toBe("pending");
    expect(toolStatus(part({ state: undefined }))).toBe("pending");
    expect(toolStatus(part({ state: "output-available" }))).toBe("done");
  });
});

describe("toolSummary", () => {
  it("counts the changes in a proposal from either path", () => {
    expect(toolSummary(part({ output: proposal }))).toBe("proposed 2 changes");
    expect(toolSummary(part({ output: JSON.stringify(proposal) }))).toBe("proposed 2 changes");
  });

  it("counts rows in a JSON-string array — the bug that showed raw JSON", () => {
    expect(toolSummary(part({ type: "tool-next_actions", output: "[{},{},{}]" }))).toBe("3 rows");
  });

  it("names the id in a JSON-string object", () => {
    expect(toolSummary(part({ type: "tool-create_task", output: '{"id":"T-014"}' }))).toBe("T-014");
  });

  it("says an object with no id has nothing to summarise, rather than dumping it", () => {
    expect(toolSummary(part({ type: "tool-get_daily", output: '{"habits":[]}' }))).toBe("");
  });

  it("truncates a long plain string", () => {
    const long = "a".repeat(60);
    expect(toolSummary(part({ type: "tool-add_journal", output: long })).endsWith("…")).toBe(true);
  });

  it("reports the error text when the tool failed", () => {
    expect(
      toolSummary(part({ state: "output-error", errorText: "Task not found: T-999" })),
    ).toBe("Task not found: T-999");
    expect(toolSummary(part({ state: "output-error" }))).toBe("failed");
  });

  it("is empty when there is no output yet", () => {
    expect(toolSummary(part({ state: "input-available", output: undefined }))).toBe("");
  });
});

describe("isToolPart", () => {
  it("accepts both shapes the stream produces", () => {
    expect(isToolPart({ type: "tool-read_note" })).toBe(true);
    expect(isToolPart({ type: "dynamic-tool", toolName: "mcp__planner__read_note" })).toBe(true);
  });

  it("rejects text, reasoning and junk", () => {
    expect(isToolPart({ type: "text", text: "hi" })).toBe(false);
    expect(isToolPart({ type: "reasoning", text: "hm" })).toBe(false);
    expect(isToolPart(null)).toBe(false);
    expect(isToolPart({})).toBe(false);
  });
});

describe("partsOf", () => {
  it("splits one message into text, thoughts and tools in a single pass", () => {
    const m = partsOf({
      id: "m1",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "weighing it up" },
        { type: "text", text: "Here is " },
        { type: "tool-next_actions", state: "output-available" },
        { type: "text", text: "the plan." },
      ],
    });
    expect(m.text).toBe("Here is the plan.");
    expect(m.thoughts).toEqual(["weighing it up"]);
    expect(m.tools).toHaveLength(1);
  });

  it("drops empty reasoning but keeps empty text joined", () => {
    const m = partsOf({
      id: "m2",
      role: "assistant",
      parts: [
        { type: "reasoning", text: "   " },
        { type: "text", text: "" },
      ],
    });
    expect(m.thoughts).toEqual([]);
    expect(m.text).toBe("");
  });

  it("ignores parts with no usable text rather than throwing", () => {
    const m = partsOf({
      id: "m3",
      role: "assistant",
      parts: [null, { type: "text" }, { type: "file", url: "x" }, "nonsense"],
    });
    expect(m).toEqual({ text: "", thoughts: [], tools: [] });
  });
});
