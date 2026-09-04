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

  /**
   * The canvas round trip over the real transport, because that is the whole
   * point of these tools: a map could previously only be arranged by dragging,
   * so an agent in another process could read the graph and never change it.
   */
  it(
    "draws on a canvas map and reads it back",
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

      const call = async (name: string, args: Record<string, unknown>) => {
        const res = await client.callTool({ name, arguments: args });
        const text = (res.content as Array<{ type: string; text: string }>)[0].text;
        expect(res.isError, `${name}: ${text}`).not.toBe(true);
        return JSON.parse(text) as Record<string, unknown>;
      };

      const camera = (await call("add_note", {
        title: "Camera control",
        summary: "One process owns the camera.",
        scope: ["demo-bot"],
      })) as { note: { id: string } };
      const detector = (await call("add_note", {
        title: "Detector",
        summary: "Nano model, one frame at a time.",
        scope: ["demo-bot"],
      })) as { note: { id: string } };

      await call("place_card", { project: "demo-bot", ref: camera.note.id, x: 0, y: 0, w: 320, h: 200 });
      const edge = await call("connect_cards", {
        project: "demo-bot",
        from: detector.note.id,
        to: camera.note.id,
        relation: "requires",
      });
      expect(edge).toMatchObject({ relation: "requires", added: true });

      const map = (await call("read_canvas", { project: "demo-bot" })) as {
        cards: { ref: string; title: string; placed: boolean; w?: number }[];
        edges: { from: string; to: string; relation: string }[];
        orphans: string[];
      };
      expect(map.edges).toEqual([
        { from: detector.note.id, to: camera.note.id, relation: "requires" },
      ]);
      expect(map.cards.find((c) => c.ref === camera.note.id)).toMatchObject({
        title: "Camera control",
        placed: true,
        w: 320,
      });
      expect(map.cards.find((c) => c.ref === detector.note.id)?.placed).toBe(false);
      expect(map.orphans).toEqual([]);

      await client.close();
    },
    60000,
  );
});
