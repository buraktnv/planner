import { describe, expect, it } from "vitest";
import {
  assetExt,
  assetMime,
  assetNameFor,
  assetNameOk,
  assetPath,
  sniffExt,
} from "../assets";

const png = (extra: number[] = []) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...extra]);

describe("assetNameOk", () => {
  it("accepts a content-addressed name", () => {
    expect(assetNameOk("a1b2c3d4e5f60718.png")).toBe(true);
    expect(assetNameOk("a1b2c3d4e5f60718.jpeg")).toBe(true);
    expect(assetNameOk("a1b2c3d4e5f60718.webp")).toBe(true);
  });

  // Each of these is a real Win32 bypass, not a hypothetical.
  const rejected: [string, unknown][] = [
    ["empty", ""],
    ["not a string", 42],
    ["null", null],
    ["undefined", undefined],
    ["dot", "."],
    ["dotdot", ".."],
    ["parent traversal", "../x.png"],
    ["windows traversal", "..\\x.png"],
    ["nested traversal", "a/../../b.png"],
    ["forward slash", "sub/x.png"],
    ["back slash", "sub\\x.png"],
    ["drive relative", "c:x.png"],
    ["drive absolute", "c:\\x.png"],
    ["extended path", "\\\\?\\c:\\x.png"],
    ["unc path", "\\\\srv\\share\\x.png"],
    ["ntfs stream", "x.png:$data"],
    ["ntfs stream doubled", "x.png::$data"],
    ["dos device nul", "nul"],
    ["dos device with ext", "nul.png"],
    ["dos device com1", "com1.png"],
    ["dos device lpt1", "lpt1.png"],
    ["trailing dot", "x.png."],
    ["trailing space", "x.png "],
    ["leading space", " x.png"],
    ["uppercase", "X.PNG"],
    ["mixed case", "Abc.png"],
    ["leading dot", ".hidden.png"],
    ["leading dash", "-x.png"],
    ["no extension", "abcdef"],
    ["svg", "x.svg"],
    ["html", "x.html"],
    ["null byte", "x.png\u0000.txt"],
    ["newline", "x\n.png"],
    ["control char", "x\u0001.png"],
    ["wildcard", "x*.png"],
    ["question mark", "x?.png"],
    ["pipe", "x|.png"],
    ["quote", 'x".png'],
    ["angle bracket", "x<.png"],
    ["over length", `${"a".repeat(80)}.png`],
  ];

  for (const [label, value] of rejected) {
    it(`rejects ${label}`, () => {
      expect(assetNameOk(value)).toBe(false);
    });
  }

  it("refuses to build a path for anything it rejects", () => {
    for (const [, value] of rejected) {
      expect(assetPath(value as string)).toBeNull();
    }
  });
});

describe("assetExt / assetMime", () => {
  it("maps each allowed extension to a fixed type", () => {
    expect(assetMime("a.png")).toBe("image/png");
    expect(assetMime("a.jpg")).toBe("image/jpeg");
    expect(assetMime("a.jpeg")).toBe("image/jpeg");
    expect(assetMime("a.gif")).toBe("image/gif");
    expect(assetMime("a.webp")).toBe("image/webp");
    expect(assetMime("a.avif")).toBe("image/avif");
  });

  it("has no type for anything else, so the route cannot serve it", () => {
    expect(assetMime("a.svg")).toBeNull();
    expect(assetMime("a.html")).toBeNull();
    expect(assetMime("a")).toBeNull();
  });

  it("reads the extension off the last dot", () => {
    expect(assetExt("a.b.png")).toBe(".png");
    expect(assetExt("nodot")).toBe("");
  });
});

describe("sniffExt", () => {
  it("recognises the formats it accepts", () => {
    expect(sniffExt(png())).toBe(".png");
    expect(sniffExt(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(".jpg");
    expect(sniffExt(new TextEncoder().encode("GIF89a______"))).toBe(".gif");
    expect(sniffExt(new TextEncoder().encode("RIFF____WEBPVP8 "))).toBe(".webp");
    expect(sniffExt(new TextEncoder().encode("____ftypavif"))).toBe(".avif");
  });

  it("rejects an SVG however it is labelled", () => {
    expect(sniffExt(new TextEncoder().encode("<svg xmlns=..."))).toBeNull();
  });

  it("rejects HTML dressed up as an image", () => {
    expect(sniffExt(new TextEncoder().encode("<!doctype html>"))).toBeNull();
  });

  it("rejects a file too short to identify", () => {
    expect(sniffExt(new Uint8Array([0x89, 0x50]))).toBeNull();
    expect(sniffExt(new Uint8Array())).toBeNull();
  });

  it("rejects a PNG signature that is only half right", () => {
    expect(sniffExt(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
  });
});

describe("assetNameFor", () => {
  it("names identical bytes identically, which is the dedupe", () => {
    expect(assetNameFor(png(), ".png")).toBe(assetNameFor(png(), ".png"));
  });

  it("names different bytes differently", () => {
    expect(assetNameFor(png(), ".png")).not.toBe(assetNameFor(png([1]), ".png"));
  });

  it("produces a name its own validator accepts", () => {
    for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"]) {
      expect(assetNameOk(assetNameFor(png(), ext))).toBe(true);
    }
  });
});
