import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { simpleGit } from "simple-git";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { allowedToolNames } from "../planner";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const tsxCli = path.join(
  path.dirname(createRequire(import.meta.url).resolve("tsx/package.json")),
  "dist",
  "cli.mjs",
);

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-stdio-"));
  process.env.PLANNER_DATA_DIR = tmp;
  const git = simpleGit(tmp);
  await git.init();
  await git.addConfig("user.name", "test");
  await git.addConfig("user.email", "test@example.com");
  const { createCharter, addTask } = await import("@/lib/core/store");
  await createCharter({
    type: "project",
    name: "Demo Bot",
    why: "practice fixture",
    mvp: "one green test",
  });
  await addTask("project", "demo-bot", { title: "Wire the fixture", size: "M" });
  delete process.env.PLANNER_DATA_DIR;
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 120 });
});

describe("stdio transport", () => {
  it(
    "spawns the server and answers tools/list and next_actions",
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [tsxCli, path.join(root, "mcp", "server.ts")],
        cwd: root,
        env: {
          PATH: process.env.PATH ?? "",
          SystemRoot: process.env.SystemRoot ?? "",
          APPDATA: process.env.APPDATA ?? "",
          PLANNER_DATA_DIR: tmp,
          PLANNER_AGENT: "vitest-agent",
        },
        stderr: "pipe",
      });
      const client = new Client({ name: "test", version: "1.0.0" });
      await client.connect(transport);

      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(
        allowedToolNames({}).slice().sort(),
      );

      const res = await client.callTool({ name: "next_actions", arguments: {} });
      expect(res.isError).not.toBe(true);
      const text = (res.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text) as Array<{ task: { title: string } }>;
      expect(parsed.some((a) => a.task.title === "Wire the fixture")).toBe(true);

      await client.close();
    },
    60000,
  );
});
