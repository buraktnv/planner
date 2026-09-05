import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { agentFromHeaders, envForRequest, handleMcpRequest, refuse } from "../http";
import { allowedToolNames, type McpEnv } from "../planner";

const URL_ = "http://desktop.example/api/mcp";

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-http-"));
  process.env.PLANNER_DATA_DIR = tmp;
  const git = simpleGit(tmp);
  await git.init();
  await git.addConfig("user.name", "test");
  await git.addConfig("user.email", "test@example.com");
  const { createCharter } = await import("@/lib/core/store");
  await createCharter({
    type: "project",
    name: "Demo Bot",
    why: "practice fixture",
    mvp: "one green test",
  });
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

let nextId = 0;

function rpc(method: string, params?: Record<string, unknown>): Record<string, unknown> {
  nextId += 1;
  return { jsonrpc: "2.0", id: nextId, method, ...(params ? { params } : {}) };
}

const INIT = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test", version: "1.0.0" },
};

function post(
  body: unknown,
  extra: Record<string, string> = {},
): Request {
  return new Request(URL_, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      host: "desktop.example",
      ...extra,
    },
    body: JSON.stringify(body),
  });
}

interface RpcResult {
  result?: Record<string, unknown>;
  error?: { message: string };
}

async function call(
  method: string,
  params?: Record<string, unknown>,
  headers: Record<string, string> = {},
  env: McpEnv = process.env,
): Promise<RpcResult> {
  const res = await handleMcpRequest(post(rpc(method, params), headers), env);
  const text = await res.text();
  expect(res.status, text).toBe(200);
  return JSON.parse(text) as RpcResult;
}

describe("handleMcpRequest", () => {
  it("answers the initialize handshake with the standing instructions", async () => {
    const out = await call("initialize", INIT);
    expect(out.error).toBeUndefined();
    const info = out.result?.serverInfo as { name: string } | undefined;
    expect(info?.name).toBe("planner");
    expect(String(out.result?.instructions)).toContain("READ BEFORE YOU WRITE");
  });

  /**
   * The point of the route: the tool list a laptop sees over HTTP is the same
   * list a local agent sees over stdio, because both come off one allowlist.
   */
  it("lists exactly the tools the allowlist exposes", async () => {
    await call("initialize", INIT);
    const out = await call("tools/list");
    const names = (out.result?.tools as { name: string }[]).map((t) => t.name).sort();
    expect(names).toEqual(allowedToolNames({}).slice().sort());
    expect(names).toContain("read_canvas");
    expect(names).not.toContain("create_project");
  });

  it("runs a read tool", async () => {
    await call("initialize", INIT);
    const out = await call("tools/call", { name: "list_projects", arguments: {} });
    const content = out.result?.content as { text: string }[];
    expect(JSON.parse(content[0].text)).toEqual([
      expect.objectContaining({ id: "demo-bot" }),
    ]);
  });

  /**
   * A write over HTTP has to reach the same place a write over stdio does: the
   * markdown, plus a journal line naming the agent — which here came from a
   * request header, so the desktop and the laptop are distinguishable.
   */
  it("writes through, and journals under the header-supplied agent name", async () => {
    await call("initialize", INIT, { "x-planner-agent": "macbook" });
    const out = await call(
      "tools/call",
      { name: "create_task", arguments: { project: "demo-bot", title: "Wire the laptop", size: "S" } },
      { "x-planner-agent": "macbook" },
    );
    const content = out.result?.content as { text: string }[];
    expect(out.result?.isError).not.toBe(true);
    expect(JSON.parse(content[0].text)).toMatchObject({ title: "Wire the laptop" });

    const { listTasks } = await import("@/lib/core/store");
    const tasks = await listTasks("project", "demo-bot");
    expect(tasks.some((t) => t.title === "Wire the laptop")).toBe(true);

    const journal = await fs.readdir(path.join(tmp, "journal"));
    const lines = await fs.readFile(path.join(tmp, "journal", journal[0]), "utf8");
    expect(lines).toContain("[agent:macbook]");
  });

  it("drops the write tools when the server env is readonly", async () => {
    const env: McpEnv = { ...process.env, PLANNER_MCP_READONLY: "1" };
    await call("initialize", INIT, {}, env);
    const out = await call("tools/list", undefined, {}, env);
    const names = (out.result?.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain("next_actions");
    expect(names).toContain("propose_changes");
    expect(names).not.toContain("create_task");
  });

  it("lets a client restrict itself to reads, but never widen itself", async () => {
    await call("initialize", INIT, { "x-planner-readonly": "1" });
    const asked = await call("tools/list", undefined, { "x-planner-readonly": "1" });
    expect((asked.result?.tools as { name: string }[]).map((t) => t.name)).not.toContain(
      "create_task",
    );

    const env: McpEnv = { ...process.env, PLANNER_MCP_READONLY: "1" };
    await call("initialize", INIT, { "x-planner-readonly": "0" }, env);
    const widened = await call("tools/list", undefined, { "x-planner-readonly": "0" }, env);
    expect((widened.result?.tools as { name: string }[]).map((t) => t.name)).not.toContain(
      "create_task",
    );
  });

  it("refuses a cross-origin request, and allows one with no Origin at all", async () => {
    const res = await handleMcpRequest(
      post(rpc("tools/list"), { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("cross-origin");

    const same = await handleMcpRequest(
      post(rpc("initialize", INIT), { origin: "http://desktop.example" }),
    );
    expect(same.status).toBe(200);
  });

  it("requires a bearer token only when one is configured", async () => {
    const env: McpEnv = { ...process.env, PLANNER_MCP_TOKEN: "s3cret" };
    const none = await handleMcpRequest(post(rpc("initialize", INIT)), env);
    expect(none.status).toBe(401);

    const wrong = await handleMcpRequest(
      post(rpc("initialize", INIT), { authorization: "Bearer nope" }),
      env,
    );
    expect(wrong.status).toBe(401);

    const right = await handleMcpRequest(
      post(rpc("initialize", INIT), { authorization: "Bearer s3cret" }),
      env,
    );
    expect(right.status).toBe(200);
  });

  /**
   * The data root is set on `process.env`, not passed in: `dataRoot()` and every
   * writer under `lib/core` read the process env, so it is a property of the
   * process and cannot be scoped to one request. The stdio entrypoint exits on
   * this; a route sharing its process with the web app has to answer instead.
   */
  it("answers 503 rather than crashing when the data directory is gone", async () => {
    process.env.PLANNER_DATA_DIR = path.join(tmp, "not-here");
    const res = await handleMcpRequest(post(rpc("initialize", INIT)));
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("PLANNER_DATA_DIR");
  });
});

describe("agentFromHeaders", () => {
  it("falls back when the header is absent or empty", () => {
    expect(agentFromHeaders(new Headers(), "desktop")).toBe("desktop");
    expect(agentFromHeaders(new Headers({ "x-planner-agent": "   " }), "desktop")).toBe("desktop");
  });

  /**
   * A journal line reads `[agent:<name>]` and `/agents` parses it back by those
   * brackets, so a name carrying one has to be stripped. A newline cannot get
   * this far — `new Headers()` throws on one, which is why that is not tested
   * here — so brackets are the half left to us.
   */
  it("strips anything that could forge a journal line, and caps the length", () => {
    expect(agentFromHeaders(new Headers({ "x-planner-agent": "mac[book]" }))).toBe("macbook");
    expect(agentFromHeaders(new Headers({ "x-planner-agent": "[a] b" }))).toBe("a b");
    expect(agentFromHeaders(new Headers({ "x-planner-agent": "x".repeat(80) }))?.length).toBe(40);
    expect(agentFromHeaders(new Headers({ "x-planner-agent": "!!!" }), "desktop")).toBe("desktop");
  });
});

describe("envForRequest", () => {
  it("names the surface when nothing else does", () => {
    expect(envForRequest(new Headers(), {}).PLANNER_AGENT).toBe("http");
  });

  it("leaves the rest of the env alone", () => {
    const out = envForRequest(new Headers(), { PLANNER_DATA_DIR: "/x", PLANNER_AGENT: "desktop" });
    expect(out.PLANNER_DATA_DIR).toBe("/x");
    expect(out.PLANNER_AGENT).toBe("desktop");
  });
});

describe("refuse", () => {
  it("passes a plain request with no token configured", () => {
    expect(refuse(post(rpc("initialize", INIT)), {})).toBeNull();
  });

  it("refuses an unparseable Origin", () => {
    expect(refuse(post(rpc("initialize", INIT), { origin: "not a url" }), {})?.status).toBe(403);
  });
});
