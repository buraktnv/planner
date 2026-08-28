import { describe, expect, it, vi, afterEach } from "vitest";
import { sep } from "node:path";

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

describe("archiveDir", () => {
  it("points at archive/ and its per-type subdirs", async () => {
    vi.stubEnv("PLANNER_DATA_DIR", "C:/tmp/custom-data");
    const { archiveDir } = await import("../paths");
    const norm = (p: string) => p.split(sep).join("/");
    expect(norm(archiveDir())).toBe("C:/tmp/custom-data/archive");
    expect(norm(archiveDir("project"))).toBe("C:/tmp/custom-data/archive/projects");
    expect(norm(archiveDir("area"))).toBe("C:/tmp/custom-data/archive/areas");
  });
});
