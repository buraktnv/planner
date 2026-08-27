import { describe, expect, it, vi, afterEach } from "vitest";
import path from "node:path";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dataRoot", () => {
  it("uses PLANNER_DATA_DIR when set", async () => {
    vi.stubEnv("PLANNER_DATA_DIR", "C:/tmp/custom-data");
    const { dataRoot } = await import("../paths");
    expect(dataRoot()).toBe("C:/tmp/custom-data");
  });
});
