import { describe, expect, it } from "vitest";
import { rewriteAssetSrc } from "../markdown-assets";

describe("rewriteAssetSrc", () => {
  it("points a data-repo reference at the route that serves it", () => {
    expect(rewriteAssetSrc("assets/a1b2.png")).toBe("/api/assets/a1b2.png");
  });

  it("accepts the relative and rooted spellings of the same reference", () => {
    expect(rewriteAssetSrc("./assets/a1b2.png")).toBe("/api/assets/a1b2.png");
    expect(rewriteAssetSrc("/assets/a1b2.png")).toBe("/api/assets/a1b2.png");
  });

  it("tolerates surrounding whitespace", () => {
    expect(rewriteAssetSrc("  assets/a1b2.png  ")).toBe("/api/assets/a1b2.png");
  });

  it("leaves a remote image alone", () => {
    expect(rewriteAssetSrc("https://example.com/a.png")).toBe("https://example.com/a.png");
    expect(rewriteAssetSrc("http://example.com/a.png")).toBe("http://example.com/a.png");
  });

  it("drops a data URI, which would bury megabytes of base64 in a note", () => {
    expect(rewriteAssetSrc("data:image/png;base64,iVBORw0KGgo=")).toBeNull();
  });

  const dropped = [
    "javascript:alert(1)",
    "vbscript:msgbox(1)",
    "file:///C:/secrets.png",
    "//evil.example.com/a.png",
    "assets/../../secrets.png",
    "assets/sub/a.png",
    "../assets/a.png",
    "assets/",
    "assets",
    "C:\\secrets.png",
    "",
    "   ",
  ];

  for (const src of dropped) {
    it(`renders nothing for ${JSON.stringify(src)}`, () => {
      expect(rewriteAssetSrc(src)).toBeNull();
    });
  }

  it("renders nothing when there is no src at all", () => {
    expect(rewriteAssetSrc(undefined)).toBeNull();
  });

  it("never returns a path that escapes the assets route", () => {
    for (const src of ["assets/a.png", "./assets/b.jpg", ...dropped]) {
      const out = rewriteAssetSrc(src);
      if (out === null || out.startsWith("http")) continue;
      expect(out.startsWith("/api/assets/")).toBe(true);
      expect(out).not.toContain("..");
    }
  });
});
