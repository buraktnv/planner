import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-waits-"));
  process.env.PLANNER_DATA_DIR = tmp;
  const git = simpleGit(tmp);
  await git.init();
  await git.addConfig("user.name", "test");
  await git.addConfig("user.email", "test@example.com");
});

afterEach(async () => {
  delete process.env.PLANNER_DATA_DIR;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("store threads waitsOn", () => {
  it("addTask stores a dependency and writes it to the line", async () => {
    const { createCharter, addTask, listTasks } = await import("../store");
    await createCharter({ type: "area", name: "Admin", why: "paperwork" });
    const blocker = await addTask("area", "admin", { title: "Gather papers", size: "M" });
    const waiter = await addTask("area", "admin", {
      title: "Send the forms",
      size: "S",
      waitsOn: blocker.id,
    });
    expect(waiter.waitsOn).toBe(blocker.id);
    const raw = await fs.readFile(path.join(tmp, "areas", "admin", "tasks.md"), "utf8");
    expect(raw).toContain(`waits:${blocker.id}`);
    const tasks = await listTasks("area", "admin");
    expect(tasks.find((t) => t.id === waiter.id)?.waitsOn).toBe(blocker.id);
  });

  it("addTask keeps free text with spaces", async () => {
    const { createCharter, addTask } = await import("../store");
    await createCharter({ type: "area", name: "Admin", why: "paperwork" });
    const t = await addTask("area", "admin", {
      title: "Book the follow-up",
      size: "S",
      waitsOn: "  the clinic reception  ",
    });
    expect(t.waitsOn).toBe("the clinic reception");
  });

  it("addTask rejects a value containing a pipe separator", async () => {
    const { createCharter, addTask } = await import("../store");
    await createCharter({ type: "area", name: "Admin", why: "paperwork" });
    await expect(
      addTask("area", "admin", { title: "Bad", size: "S", waitsOn: "a | b" }),
    ).rejects.toThrow(/waits:/);
  });

  it("updateTask sets and then clears waitsOn with an empty string", async () => {
    const { createCharter, addTask, updateTask, listTasks } = await import("../store");
    await createCharter({ type: "area", name: "Admin", why: "paperwork" });
    const t = await addTask("area", "admin", { title: "Send the forms", size: "S" });
    const set = await updateTask("area", "admin", t.id, { waitsOn: "the clinic" });
    expect(set.waitsOn).toBe("the clinic");
    expect(await fs.readFile(path.join(tmp, "areas", "admin", "tasks.md"), "utf8")).toContain(
      "waits:the clinic",
    );

    const cleared = await updateTask("area", "admin", t.id, { waitsOn: "" });
    expect(cleared.waitsOn).toBeUndefined();
    const raw = await fs.readFile(path.join(tmp, "areas", "admin", "tasks.md"), "utf8");
    expect(raw).not.toContain("waits:");
    expect((await listTasks("area", "admin"))[0].waitsOn).toBeUndefined();
  });

  it("updateTask leaves waitsOn alone when the patch omits it", async () => {
    const { createCharter, addTask, updateTask } = await import("../store");
    await createCharter({ type: "area", name: "Admin", why: "paperwork" });
    const t = await addTask("area", "admin", {
      title: "Send the forms",
      size: "S",
      waitsOn: "the clinic",
    });
    const updated = await updateTask("area", "admin", t.id, { size: "M" });
    expect(updated.waitsOn).toBe("the clinic");
  });
});
