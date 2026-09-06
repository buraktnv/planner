import { describe, expect, it } from "vitest";
import { idsIn, parseStatus, renderStatus } from "../status";

describe("renderStatus / parseStatus", () => {
  it("round-trips the three parts", () => {
    const body = renderStatus({
      happened: "Chose heading chunks.",
      changed: "Updated K-001; created T-004 (waits on T-001).",
      next: "Run the eval set.",
    });
    expect(body).toBe(
      "**What happened:** Chose heading chunks.\n\n**What changed elsewhere:** Updated K-001; created T-004 (waits on T-001).\n\n**Next:** Run the eval set.",
    );
    expect(parseStatus(body)).toEqual({
      happened: "Chose heading chunks.",
      changed: "Updated K-001; created T-004 (waits on T-001).",
      next: "Run the eval set.",
    });
  });

  it("writes 'nothing' for an empty middle or end so a reader never wonders", () => {
    const body = renderStatus({ happened: "Looked.", changed: "", next: " " });
    expect(body).toContain("**What changed elsewhere:** nothing");
    expect(body).toContain("**Next:** nothing");
  });

  it("keeps multi-line parts", () => {
    const body = renderStatus({ happened: "One.\nTwo.", changed: "- K-001\n- K-002", next: "" });
    const parsed = parseStatus(body)!;
    expect(parsed.happened).toBe("One.\nTwo.");
    expect(parsed.changed).toBe("- K-001\n- K-002");
  });

  it("is total: a marked entry without the labels is a plain entry", () => {
    expect(parseStatus("just some text")).toBeNull();
    expect(parseStatus("")).toBeNull();
    expect(parseStatus("**Next:** only this")).toBeNull();
  });
});

describe("idsIn", () => {
  it("finds every id kind once, in order", () => {
    expect(idsIn("Updated K-001 and K-001; created T-004.2; event E-003; target G-002.")).toEqual([
      "K-001",
      "T-004.2",
      "E-003",
      "G-002",
    ]);
    expect(idsIn("nothing")).toEqual([]);
  });
});
