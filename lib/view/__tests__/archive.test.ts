import { describe, expect, it } from "vitest";
import { archiveNote, buildArchive } from "../archive";
import type { ArchivedCharter } from "@/lib/core/store";
import type { ProjectType, Task } from "@/lib/core/types";

function charter(
  archivedAs: string,
  type: ProjectType,
  archivedAt: string,
  name = archivedAs,
): ArchivedCharter {
  return {
    id: archivedAs,
    name,
    type,
    status: "active",
    priority: 2,
    created: "2026-01-01",
    updated: "2026-01-01",
    why: "  because it mattered  ",
    mvpScope: [],
    parkingLot: [],
    archivedAs,
    archivedAt,
  };
}

function task(id: string, done: boolean): Task {
  return {
    id,
    title: `Task ${id}`,
    size: "M",
    done,
    section: done ? "done" : "backlog",
    parentId: null,
  };
}

describe("buildArchive", () => {
  it("splits projects from areas", () => {
    const model = buildArchive([
      { charter: charter("job-search", "project", "2026-08-28"), tasks: [] },
      { charter: charter("old-habit", "area", "2026-08-20"), tasks: [] },
    ]);
    expect(model.projects.map((r) => r.archivedAs)).toEqual(["job-search"]);
    expect(model.areas.map((r) => r.archivedAs)).toEqual(["old-habit"]);
    expect(model.total).toBe(2);
  });

  it("orders most recently archived first", () => {
    const model = buildArchive([
      { charter: charter("older", "project", "2026-06-01"), tasks: [] },
      { charter: charter("newer", "project", "2026-08-28"), tasks: [] },
    ]);
    expect(model.projects.map((r) => r.archivedAs)).toEqual(["newer", "older"]);
  });

  it("counts total and done tasks", () => {
    const model = buildArchive([
      {
        charter: charter("job-search", "project", "2026-08-28"),
        tasks: [task("T-001", true), task("T-002", false), task("T-003", true)],
      },
    ]);
    expect(model.projects[0].total).toBe(3);
    expect(model.projects[0].done).toBe(2);
  });

  it("trims the why and keeps the display name", () => {
    const model = buildArchive([
      { charter: charter("job-search", "project", "2026-08-28", "Job Search"), tasks: [] },
    ]);
    expect(model.projects[0].why).toBe("because it mattered");
    expect(model.projects[0].name).toBe("Job Search");
  });

  it("is empty for an empty archive", () => {
    const model = buildArchive([]);
    expect(model).toEqual({ projects: [], areas: [], total: 0 });
  });
});

describe("archiveNote", () => {
  it("speaks to an empty archive", () => {
    expect(archiveNote(buildArchive([]))).toMatch(/Nothing archived/);
  });

  it("says nothing was deleted", () => {
    const model = buildArchive([
      { charter: charter("job-search", "project", "2026-08-28"), tasks: [] },
    ]);
    expect(archiveNote(model)).toBe(
      "1 retired charter. Nothing here was deleted — restore any of it.",
    );
  });
});
