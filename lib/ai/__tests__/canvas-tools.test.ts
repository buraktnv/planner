import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";

let tmp: string;

beforeEach(async () => {
  tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-canvas-tools-"));
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

async function seed() {
  const { createCharter } = await import("@/lib/core/store");
  const { addNote } = await import("@/lib/core/knowledge");
  await createCharter({ type: "project", name: "Acme App", why: "trade", mvp: "ship" });
  await createCharter({ type: "area", name: "Acme Health", why: "stay well" });
  const camera = await addNote({
    title: "Camera control",
    summary: "One process owns the camera.",
    scope: ["acme-app"],
  });
  const detector = await addNote({
    title: "Detector",
    summary: "Nano model, one frame at a time.",
    scope: ["acme-app"],
  });
  const loose = await addNote({ title: "A loose thought", summary: "Filed nowhere." });
  return { camera: camera.id, detector: detector.id, loose: loose.id };
}

describe("read_canvas", () => {
  it("lists every note on the knowledge board as an unplaced card", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();

    const board = await toolImpls.readCanvas({});
    expect(board.map).toBe("knowledge");
    expect(board.project).toBeNull();
    expect(board.cards.map((c) => c.ref).sort()).toEqual(
      [ids.camera, ids.detector, ids.loose].sort(),
    );
    expect(board.cards.every((c) => !c.placed && c.x === null && c.y === null)).toBe(true);
    expect(board.cards.every((c) => c.type === "note")).toBe(true);
    expect(board.edges).toEqual([]);
    expect(board.orphans).toEqual([]);
  });

  it("shows a system map only the notes scoped to that charter", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();

    const map = await toolImpls.readCanvas({ project: "acme-app" });
    expect(map.map).toBe("system");
    expect(map.cards.map((c) => c.ref).sort()).toEqual([ids.camera, ids.detector].sort());
    expect(map.cards.some((c) => c.ref === ids.loose)).toBe(false);
  });

  it("resolves a title for each ref, which the node line does not carry", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();

    await toolImpls.placeCard({ project: "acme-app", ref: ids.camera, x: 40, y: 80 });
    const map = await toolImpls.readCanvas({ project: "acme-app" });
    const card = map.cards.find((c) => c.ref === ids.camera);
    expect(card).toMatchObject({ title: "Camera control", x: 40, y: 80, placed: true });
  });

  /**
   * The canvas parser tolerates a ref whose note is gone, so the tool has to
   * report it rather than pretend the card is fine. This is the distinction a
   * caller cannot make from a node line alone.
   */
  it("separates a card that was never placed from one whose note is gone", async () => {
    const { toolImpls } = await import("../tools");
    const { saveNodePositions } = await import("@/lib/core/canvas");
    const ids = await seed();

    await saveNodePositions({ kind: "system", type: "project", slug: "acme-app" }, [
      { ref: ids.camera, x: 10, y: 10 },
      { ref: "K-404", x: 20, y: 20 },
    ]);

    const map = await toolImpls.readCanvas({ project: "acme-app" });
    expect(map.orphans).toEqual(["K-404"]);
    expect(map.cards.find((c) => c.ref === "K-404")).toMatchObject({
      type: "missing",
      placed: true,
    });
    expect(map.cards.find((c) => c.ref === ids.detector)).toMatchObject({
      type: "note",
      placed: false,
      x: null,
    });
  });

  it("reads a task map, with tasks as its cards", async () => {
    const { toolImpls } = await import("../tools");
    const { addTask } = await import("@/lib/core/store");
    await seed();
    const task = await addTask("project", "acme-app", { title: "Wire the camera", size: "M" });

    const map = await toolImpls.readCanvas({ project: "acme-app", map: "tasks" });
    expect(map.map).toBe("tasks");
    expect(map.cards.map((c) => c.ref)).toEqual([task.id]);
    expect(map.cards[0]).toMatchObject({ title: "Wire the camera", type: "task" });
  });

  it("refuses a map on the knowledge board, which has no charter", async () => {
    const { toolImpls } = await import("../tools");
    await seed();
    await expect(toolImpls.readCanvas({ map: "tasks" })).rejects.toThrow(/knowledge board/i);
  });

  /**
   * canvasPathFor interpolates the slug straight into a file path. Resolving
   * the charter first is what stops a caller's string from ever reaching it.
   */
  it("refuses a charter that does not exist, before touching a path", async () => {
    const { toolImpls } = await import("../tools");
    await seed();
    await expect(toolImpls.readCanvas({ project: "../../etc" })).rejects.toThrow();
    await expect(toolImpls.readCanvas({ project: "no-such-project" })).rejects.toThrow();
  });
});

describe("place_card", () => {
  it("places a card, then moves it, keeping the size set earlier", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();

    await toolImpls.placeCard({ project: "acme-app", ref: ids.camera, x: 0, y: 0, w: 320, h: 240 });
    const moved = await toolImpls.placeCard({
      project: "acme-app",
      ref: ids.camera,
      x: 100,
      y: 50,
    });
    expect(moved).toMatchObject({ ref: ids.camera, x: 100, y: 50, w: 320, h: 240 });
  });

  /**
   * applyMoves silently skips a ref it does not like, so without these two
   * guards a typo would be a successful call that wrote nothing at all.
   */
  it("refuses a ref that is not a card ref", async () => {
    const { toolImpls } = await import("../tools");
    await seed();
    await expect(
      toolImpls.placeCard({ project: "acme-app", ref: "camera", x: 0, y: 0 }),
    ).rejects.toThrow(/not a card ref/i);
  });

  it("refuses a card that belongs to another charter's map", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();
    await expect(
      toolImpls.placeCard({ project: "area:acme-health", ref: ids.camera, x: 0, y: 0 }),
    ).rejects.toThrow(/not a card on this map/i);
  });

  it("journals and commits the move, like every other write", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();
    await toolImpls.placeCard({ project: "acme-app", ref: ids.camera, x: 12, y: 34 });

    const dir = path.join(tmp, "journal");
    const files = await fs.readdir(dir);
    const text = await fs.readFile(path.join(dir, files[0]), "utf8");
    expect(text).toMatch(/canvas:/);

    const log = await simpleGit(tmp).log();
    expect(log.latest?.message).toMatch(/canvas:/);
  });
});

describe("connect_cards / disconnect_cards", () => {
  it("draws an arrow, and says so only the first time", async () => {
    const { toolImpls } = await import("../tools");
    const { readCanvas } = await import("@/lib/core/canvas");
    const ids = await seed();

    const first = await toolImpls.connectCards({
      project: "acme-app",
      from: ids.detector,
      to: ids.camera,
      relation: "requires",
    });
    expect(first).toMatchObject({ relation: "requires", added: true });

    const again = await toolImpls.connectCards({
      project: "acme-app",
      from: ids.detector,
      to: ids.camera,
      relation: "requires",
    });
    expect(again.added).toBe(false);

    const file = await readCanvas({ kind: "system", type: "project", slug: "acme-app" });
    expect(file.edges).toHaveLength(1);
    expect(file.edges[0]).toMatchObject({
      from: ids.detector,
      to: ids.camera,
      kind: "requires",
    });
  });

  it("defaults to a plain relationship", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();
    const edge = await toolImpls.connectCards({
      project: "acme-app",
      from: ids.camera,
      to: ids.detector,
    });
    expect(edge.relation).toBe("rel");
  });

  it("keeps a label", async () => {
    const { toolImpls } = await import("../tools");
    const { readCanvas } = await import("@/lib/core/canvas");
    const ids = await seed();
    await toolImpls.connectCards({
      project: "acme-app",
      from: ids.camera,
      to: ids.detector,
      relation: "triggers",
      label: "on new frame",
    });
    const file = await readCanvas({ kind: "system", type: "project", slug: "acme-app" });
    expect(file.edges[0].label).toBe("on new frame");
  });

  it("refuses a self-arrow and a ref that is not on the map", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();
    await expect(
      toolImpls.connectCards({ project: "acme-app", from: ids.camera, to: ids.camera }),
    ).rejects.toThrow(/itself/i);
    await expect(
      toolImpls.connectCards({ project: "acme-app", from: ids.camera, to: "K-404" }),
    ).rejects.toThrow(/not a card on this map/i);
  });

  it("works on the global knowledge board, where scope does not narrow anything", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();
    const edge = await toolImpls.connectCards({ from: ids.loose, to: ids.camera });
    expect(edge.added).toBe(true);
    const board = await toolImpls.readCanvas({});
    expect(board.edges).toHaveLength(1);
  });

  /** Removing an arrow to a note that has already been deleted is the point. */
  it("removes an arrow without checking either ref still exists", async () => {
    const { toolImpls } = await import("../tools");
    const { addCanvasEdge, readCanvas } = await import("@/lib/core/canvas");
    await seed();
    const surface = { kind: "system", type: "project", slug: "acme-app" } as const;
    await addCanvasEdge(surface, { from: "K-404", to: "K-405", kind: "requires" });

    const gone = await toolImpls.disconnectCards({
      project: "acme-app",
      from: "K-404",
      to: "K-405",
      relation: "requires",
    });
    expect(gone.removed).toBe(true);
    expect((await readCanvas(surface)).edges).toEqual([]);
  });

  it("reports nothing removed when there was no such arrow", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();
    const gone = await toolImpls.disconnectCards({
      project: "acme-app",
      from: ids.camera,
      to: ids.detector,
    });
    expect(gone.removed).toBe(false);
  });

  it("only removes the relation it was asked for", async () => {
    const { toolImpls } = await import("../tools");
    const { readCanvas } = await import("@/lib/core/canvas");
    const ids = await seed();
    await toolImpls.connectCards({
      project: "acme-app",
      from: ids.camera,
      to: ids.detector,
      relation: "requires",
    });
    await toolImpls.connectCards({
      project: "acme-app",
      from: ids.camera,
      to: ids.detector,
      relation: "triggers",
    });

    await toolImpls.disconnectCards({
      project: "acme-app",
      from: ids.camera,
      to: ids.detector,
      relation: "requires",
    });
    const file = await readCanvas({ kind: "system", type: "project", slug: "acme-app" });
    expect(file.edges.map((e) => e.kind)).toEqual(["triggers"]);
  });
});

describe("an arrow as a proposal", () => {
  it("previews as an arrow, not as a calendar event", async () => {
    const { toolImpls } = await import("../tools");
    const ids = await seed();

    const proposal = await toolImpls.proposeChanges({
      title: "Map the detector",
      actions: [
        {
          kind: "connect_cards",
          project: "acme-app",
          from: ids.detector,
          to: ids.camera,
          relation: "requires",
        },
        {
          kind: "disconnect_cards",
          project: "acme-app",
          from: ids.camera,
          to: ids.detector,
        },
      ],
    });

    expect(proposal.preview[0]).toMatchObject({
      kind: "connect_cards",
      id: "ARROW",
      title: `${ids.detector} → ${ids.camera}`,
      charterName: "Acme App",
    });
    expect(proposal.preview[0].note).toContain("requires");
    expect(proposal.preview[1].note).toMatch(/^remove rel/);
  });

  it("applies through the same path every other action does", async () => {
    const { applyProposal } = await import("../proposals");
    const { readCanvas } = await import("@/lib/core/canvas");
    const ids = await seed();

    const result = await applyProposal([
      {
        kind: "connect_cards",
        project: "acme-app",
        from: ids.detector,
        to: ids.camera,
        relation: "requires",
      },
    ]);
    expect(result.applied).toBe(1);
    expect(result.failedIndex).toBeNull();

    const file = await readCanvas({ kind: "system", type: "project", slug: "acme-app" });
    expect(file.edges).toHaveLength(1);
  });
});
