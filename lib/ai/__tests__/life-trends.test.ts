import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-trends-tool-"));
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

describe("life_trends", () => {
  it("returns eight weeks per habit with a streak and a slope, plus task throughput", async () => {
    const { toolImpls } = await import("../tools");
    const { toolImplMap } = await import("../tool-map");
    const habit = await toolImpls.createHabit({ name: "Walk", goal: 1 });
    await toolImpls.logDaily({ id: habit.id });

    const trends = await toolImpls.lifeTrends();
    expect(trends.weeks).toHaveLength(8);
    expect(trends.habits).toHaveLength(1);
    expect(trends.habits[0].weeks).toHaveLength(8);
    expect(trends.habits[0].streak).toBe(1);
    expect(typeof trends.habits[0].slope).toBe("number");
    expect(trends.throughput).toHaveLength(8);
    expect(trends.stalled).toEqual([]);

    expect(await toolImplMap.life_trends({})).toEqual(trends);
  });

  it("is a read tool over MCP, never gated by readonly mode", async () => {
    const { allowedToolNames } = await import("../../../mcp/allowlist");
    expect(allowedToolNames({ PLANNER_MCP_READONLY: "1" })).toContain("life_trends");
  });
});
