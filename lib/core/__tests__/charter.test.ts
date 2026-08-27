import { describe, expect, it } from "vitest";
import { parseCharter, serializeCharter } from "../schema";

const RAW = `---
id: demo
name: Demo
type: project
status: active
priority: 1
mvp: "Ship the thing"
repo: ../demo
created: 2026-08-27
updated: 2026-08-27
---

## Why
Because reasons.
Second line.

## MVP scope
- [ ] first item
- [x] second item

## Parking lot
- later idea
`;

const toLF = (s: string) => s.replace(/\r\n/g, "\n");

const AREA_RAW = `---
id: health
name: Health
type: area
status: active
priority: 2
created: 2026-08-27
updated: 2026-08-27
---

## Why
Stay fit.

## MVP scope
- [ ] walk daily

## Parking lot
- marathon
`;

describe("parseCharter", () => {
  it("parses all fields", () => {
    const c = parseCharter(RAW);
    expect(c.id).toBe("demo");
    expect(c.name).toBe("Demo");
    expect(c.type).toBe("project");
    expect(c.status).toBe("active");
    expect(c.priority).toBe(1);
    expect(c.mvp).toBe("Ship the thing");
    expect(c.repo).toBe("../demo");
    expect(c.created).toBe("2026-08-27");
    expect(c.updated).toBe("2026-08-27");
    expect(c.why).toBe("Because reasons.\nSecond line.");
    expect(c.mvpScope).toEqual(["- [ ] first item", "- [x] second item"]);
    expect(c.parkingLot).toEqual(["- later idea"]);
  });

  it("round-trips identically", () => {
    expect(serializeCharter(parseCharter(RAW))).toBe(toLF(RAW));
  });

  it("throws on missing Why section", () => {
    expect(() => parseCharter(RAW.replace("## Why", "## Nope"))).toThrow(/Why/);
  });

  it("parses area without mvp", () => {
    const c = parseCharter(AREA_RAW);
    expect(c.type).toBe("area");
    expect(c.mvp).toBeUndefined();
    expect(c.why).toBe("Stay fit.");
    expect(c.mvpScope).toEqual(["- [ ] walk daily"]);
    expect(c.parkingLot).toEqual(["- marathon"]);
  });

  it("throws on unknown frontmatter key", () => {
    const bad = RAW.replace("id: demo", "id: demo\nfoo: bar");
    expect(() => parseCharter(bad)).toThrow(/foo/);
  });

  it("throws on unknown body heading", () => {
    const bad = RAW.replace("## MVP scope", "## Bogus");
    expect(() => parseCharter(bad)).toThrow(/Bogus/);
  });

  it("round-trips area identically", () => {
    expect(serializeCharter(parseCharter(AREA_RAW))).toBe(toLF(AREA_RAW));
  });
});

describe("serializeCharter", () => {
  it("omits absent optionals", () => {
    const c = parseCharter(AREA_RAW);
    const out = serializeCharter(c);
    expect(out).not.toMatch(/^mvp:/m);
    expect(out).not.toMatch(/^repo:/m);
  });
});
