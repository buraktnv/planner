import type { Proposal } from "@/lib/ai/schemas";

/**
 * One assistant turn arrives as a list of parts, and the two provider paths
 * disagree about their shape. The AI SDK path names a tool `propose_changes`
 * and hands back its output as an object; the claude-subscription path names
 * the same tool `mcp__planner__propose_changes` and hands back a JSON *string*,
 * because it crosses an MCP boundary on the way. Everything here exists to make
 * the difference stop at this file.
 */
export interface ToolPartLike {
  type: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

export interface MessageLike {
  id: string;
  role: string;
  parts: readonly unknown[];
}

export type ToolStatus = "pending" | "done" | "error";

export function toolNameOf(part: ToolPartLike): string {
  const raw = part.toolName ?? part.type.replace(/^tool-/, "");
  return raw.replace(/^mcp__planner__/, "");
}

/**
 * A tool result that crossed the MCP boundary is a JSON string. Parse it once,
 * here, so no caller has to branch on `typeof`. Anything that is not JSON is
 * returned as-is — plenty of tools legitimately answer with a bare string.
 */
export function normaliseOutput(output: unknown): unknown {
  if (typeof output !== "string") return output;
  const trimmed = output.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return output;
  try {
    return JSON.parse(trimmed);
  } catch {
    return output;
  }
}

export function asProposal(output: unknown): Proposal | null {
  const value = normaliseOutput(output);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Partial<Proposal>;
  if (typeof p.title !== "string") return null;
  if (!Array.isArray(p.actions) || !Array.isArray(p.preview)) return null;
  return p as Proposal;
}

/**
 * A failed tool used to render exactly like a pending one — an eternal "…" with
 * no way to tell the difference. The stream reports it, nothing read it.
 */
export function toolStatus(part: ToolPartLike): ToolStatus {
  if (part.state === "output-error") return "error";
  if (part.state === "output-available") return "done";
  return "pending";
}

export function isToolPart(part: unknown): part is ToolPartLike {
  if (!part || typeof part !== "object") return false;
  const type = (part as { type?: unknown }).type;
  if (typeof type !== "string") return false;
  return type === "dynamic-tool" || type.startsWith("tool-");
}

export interface MessageParts {
  text: string;
  thoughts: string[];
  tools: ToolPartLike[];
}

/** One pass over the parts, replacing three separate filters over the same array. */
export function partsOf(message: MessageLike): MessageParts {
  const text: string[] = [];
  const thoughts: string[] = [];
  const tools: ToolPartLike[] = [];

  for (const part of message.parts) {
    if (isToolPart(part)) {
      tools.push(part);
      continue;
    }
    if (!part || typeof part !== "object") continue;
    const { type, text: value } = part as { type?: unknown; text?: unknown };
    if (typeof value !== "string") continue;
    if (type === "text") text.push(value);
    else if (type === "reasoning" && value.trim().length > 0) thoughts.push(value);
  }

  return { text: text.join(""), thoughts, tools };
}

/**
 * The chip beside a tool name. Every branch below reads the *normalised* output,
 * which is the whole point: reading `part.output` directly meant the
 * subscription path fell through to the string branch and every chip showed a
 * truncated fragment of JSON.
 */
export function toolSummary(part: ToolPartLike): string {
  if (toolStatus(part) === "error") return part.errorText ? trim(part.errorText) : "failed";
  const out = normaliseOutput(part.output);
  if (out == null) return "";
  if (toolNameOf(part) === "propose_changes") {
    const proposal = asProposal(out);
    return proposal ? `proposed ${proposal.actions.length} changes` : "";
  }
  if (Array.isArray(out)) return `${out.length} rows`;
  if (typeof out === "object") {
    const id = (out as { id?: unknown }).id;
    if (typeof id === "string") return id;
    return "";
  }
  if (typeof out === "string") return trim(out);
  return "";
}

function trim(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 28 ? `${flat.slice(0, 28)}…` : flat;
}
