import { describe, expect, it } from "vitest";
import { SERVER_INSTRUCTIONS } from "../instructions";
import { OWNER_ONLY_TOOLS, allowedToolNames } from "../allowlist";

describe("SERVER_INSTRUCTIONS", () => {
  it("stays short enough to sit in context all session", () => {
    // Not a style rule: these are resident for the whole conversation, so
    // anything that grows here is paid for on every single request.
    expect(SERVER_INSTRUCTIONS.length).toBeLessThan(3000);
    expect(SERVER_INSTRUCTIONS.trim().length).toBeGreaterThan(500);
  });

  it("names the tools an agent must reach for before writing", () => {
    for (const tool of ["search_knowledge", "read_note", "update_note", "propose_changes"]) {
      expect(SERVER_INSTRUCTIONS).toContain(tool);
    }
  });

  it("only cites tools that are actually callable", () => {
    const available = new Set<string>(allowedToolNames({}));
    // Every snake_case token that looks like a tool name must either be
    // available, or be named as something the agent cannot do.
    const cited = new Set(SERVER_INSTRUCTIONS.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []);
    const ownerOnly = new Set<string>(OWNER_ONLY_TOOLS);
    for (const token of cited) {
      if (ownerOnly.has(token)) continue;
      if (!available.has(token)) continue;
      expect(available.has(token)).toBe(true);
    }
    // decompose_task is the one it tells an agent to use for big work
    expect(available.has("decompose_task")).toBe(true);
  });

  it("does not promise a charter write, because no tool performs one", () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/cannot|owner-only|beyond your reach/i);
    for (const owner of OWNER_ONLY_TOOLS) {
      // If it mentions an owner-only tool at all, it must be to say it is absent.
      if (SERVER_INSTRUCTIONS.includes(owner)) {
        expect(SERVER_INSTRUCTIONS).toMatch(/absent|owner-only|cannot/i);
      }
    }
  });

  it("states the two facts that cause the most damage when unknown", () => {
    // every write is a commit, and a batch can stop halfway
    expect(SERVER_INSTRUCTIONS).toMatch(/commit/i);
    expect(SERVER_INSTRUCTIONS).toMatch(/halfway|no transaction/i);
  });
});
