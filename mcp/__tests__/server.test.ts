import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  allowedToolNames,
  buildServer,
  isReadonly,
  OWNER_ONLY_TOOLS,
  type McpEnv,
} from "../planner";

let tmp: string;

function localDate(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

async function seed(): Promise<void> {
  const { createCharter, addTask } = await import("@/lib/core/store");
  await createCharter({
    type: "project",
    name: "Demo Bot",
    why: "practice fixture",
    mvp: "one green test",
  });
  await addTask("project", "demo-bot", { title: "Wire the fixture", size: "M" });
}

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-mcp-"));
  process.env.PLANNER_DATA_DIR = tmp;
  const git = simpleGit(tmp);
  await git.init();
  await git.addConfig("user.name", "test");
  await git.addConfig("user.email", "test@example.com");
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

async function connect(env: McpEnv): Promise<Client> {
  const server = buildServer({ env });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("allowedToolNames", () => {
  it("exposes reads and the allowed writes but never charter creation", () => {
    const names = allowedToolNames({});
    expect(names).toContain("next_actions");
    expect(names).toContain("create_task");
    expect(names).toContain("propose_changes");
    expect(names).toContain("add_journal");
    for (const owner of OWNER_ONLY_TOOLS) expect(names).not.toContain(owner);
  });

  it("readonly mode keeps reads and propose_changes only", () => {
    const names = allowedToolNames({ PLANNER_MCP_READONLY: "1" });
    expect(names).toContain("get_context");
    expect(names).toContain("propose_changes");
    expect(names).not.toContain("create_task");
    expect(names).not.toContain("add_journal");
  });

  it("treats empty, 0 and false as not readonly", () => {
    expect(isReadonly({})).toBe(false);
    expect(isReadonly({ PLANNER_MCP_READONLY: "" })).toBe(false);
    expect(isReadonly({ PLANNER_MCP_READONLY: "0" })).toBe(false);
    expect(isReadonly({ PLANNER_MCP_READONLY: "false" })).toBe(false);
    expect(isReadonly({ PLANNER_MCP_READONLY: "1" })).toBe(true);
  });
});

describe("mcp server over an in-memory transport", () => {
  it("tools/list matches the allow-list", async () => {
    const client = await connect({ PLANNER_AGENT: "test-agent" });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      allowedToolNames({}).slice().sort(),
    );
    expect(tools.every((t) => typeof t.description === "string" && t.description.length > 0)).toBe(
      true,
    );
    await client.close();
  });

  it("tools/list drops writes under PLANNER_MCP_READONLY", async () => {
    const client = await connect({ PLANNER_MCP_READONLY: "1" });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).not.toContain("create_task");
    await client.close();
  });

  it("a read tool returns JSON from the data dir", async () => {
    await seed();
    const client = await connect({});
    const res = await client.callTool({ name: "next_actions", arguments: {} });
    expect(res.isError).not.toBe(true);
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    const parsed = JSON.parse(text) as Array<{ task: { title: string } }>;
    expect(parsed.some((a) => a.task.title === "Wire the fixture")).toBe(true);
    await client.close();
  });

  it("a write tool appends the agent journal line", async () => {
    await seed();
    const client = await connect({ PLANNER_AGENT: "claude-code" });
    const res = await client.callTool({
      name: "create_task",
      arguments: { project: "demo-bot", title: "From the agent", size: "S" },
    });
    expect(res.isError).not.toBe(true);
    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).toMatch(/\[agent:claude-code\] create_task demo-bot T-\d+/);
    await client.close();
  });

  it("reads are not journaled under an agent scope", async () => {
    await seed();
    const client = await connect({ PLANNER_AGENT: "claude-code" });
    await client.callTool({ name: "list_projects", arguments: {} });
    const journal = await fs.readFile(path.join(tmp, "journal", `${localDate()}.md`), "utf8");
    expect(journal).not.toContain("[agent:claude-code] list_projects");
    await client.close();
  });

  it("a failing tool comes back as an isError result, not a crash", async () => {
    await seed();
    const client = await connect({});
    const res = await client.callTool({
      name: "get_context",
      arguments: { type: "project", slug: "does-not-exist" },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(text.length).toBeGreaterThan(0);
    const after = await client.callTool({ name: "list_projects", arguments: {} });
    expect(after.isError).not.toBe(true);
    await client.close();
  });

  it("exposes the planner:// resources", async () => {
    await seed();
    const client = await connect({});
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("planner://next");
    const read = await client.readResource({ uri: "planner://context/project/demo-bot" });
    const text = (read.contents as Array<{ text: string }>)[0].text;
    expect(text).toContain("demo-bot");
    await client.close();
  });
});
