import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import {
  assetExt,
  assetHeaders,
  assetMime,
  assetNameFor,
  assetNameOk,
  assetPath,
  sniffExt,
  svgIsSafe,
  SVG_UNSAFE,
} from "../assets";

const svgBytes = (s: string) => new TextEncoder().encode(s);
const PLAIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';

const png = (extra: number[] = []) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...extra]);

describe("assetNameOk", () => {
  it("accepts a content-addressed name", () => {
    expect(assetNameOk("a1b2c3d4e5f60718.png")).toBe(true);
    expect(assetNameOk("a1b2c3d4e5f60718.jpeg")).toBe(true);
    expect(assetNameOk("a1b2c3d4e5f60718.webp")).toBe(true);
    expect(assetNameOk("a1b2c3d4e5f60718.svg")).toBe(true);
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
    ["uppercase svg", "x.SVG"],
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
    expect(assetMime("a.svg")).toBe("image/svg+xml");
  });

  it("has no type for anything else, so the route cannot serve it", () => {
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

  it("accepts a plain SVG", () => {
    expect(sniffExt(svgBytes(PLAIN_SVG))).toBe(".svg");
  });

  it("accepts a BOM, whitespace and an XML declaration ahead of the root", () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...svgBytes(`\n  <?xml version="1.0"?>\n${PLAIN_SVG}`),
    ]);
    expect(sniffExt(bytes)).toBe(".svg");
  });

  it("rejects XML that never reaches an svg root", () => {
    expect(sniffExt(svgBytes('<?xml version="1.0"?><note>hello there</note>'))).toBeNull();
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
    for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"]) {
      expect(assetNameOk(assetNameFor(png(), ext))).toBe(true);
    }
  });
});

describe("svgIsSafe", () => {
  it("passes a plain drawing", () => {
    expect(svgIsSafe(svgBytes(PLAIN_SVG))).toBe(true);
    expect(svgIsSafe(svgBytes('<svg><use xlink:href="#icon"/></svg>'))).toBe(true);
    expect(svgIsSafe(svgBytes('<svg><use href="#icon"/></svg>'))).toBe(true);
  });

  const unsafe: [string, string][] = [
    ["script element", '<svg><script>alert(1)</script></svg>'],
    ["event handler", '<svg onload="alert(1)"></svg>'],
    ["foreignObject", "<svg><foreignObject><b>x</b></foreignObject></svg>"],
    ["javascript url", '<svg><a href="javascript:alert(1)">x</a></svg>'],
    ["iframe", "<svg><iframe src=\"/\"></iframe></svg>"],
    ["embed", '<svg><embed src="x.swf"/></svg>'],
    ["object", '<svg><object data="x"/></svg>'],
    ["entity declaration", '<!DOCTYPE svg [<!ENTITY a "b">]><svg/>'],
    ["external xlink", '<svg><use xlink:href="https://evil.test/x#i"/></svg>'],
    ["external use href", '<svg><use href="https://evil.test/x#i"/></svg>'],
    ["data image href", '<svg><image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/></svg>'],
    ["protocol-relative href", '<svg><use href="//evil.test/x.svg#i"/></svg>'],
    ["unquoted href", "<svg><use href=//evil.test/x.svg#i /></svg>"],
    ["unquoted xlink href", "<svg><use xlink:href=//evil.test/x.svg#i /></svg>"],
  ];

  for (const [label, body] of unsafe) {
    it(`refuses ${label}`, () => {
      expect(svgIsSafe(svgBytes(body))).toBe(false);
    });
  }

  it("has a sample that trips every pattern in the exported list", () => {
    for (const re of SVG_UNSAFE) {
      expect(unsafe.some(([, body]) => re.test(body))).toBe(true);
    }
  });
});

describe("assetHeaders", () => {
  it("locks an SVG down and leaves every other type alone", () => {
    const svg = assetHeaders("svg");
    expect(svg["content-security-policy"]).toContain("default-src 'none'");
    expect(svg["content-security-policy"]).toContain("sandbox");
    expect(svg["content-disposition"]).toBe("inline");
    expect(assetHeaders(".svg")).toEqual(svg);
    expect(assetHeaders("png")).toEqual({});
    expect(assetHeaders(".png")).toEqual({});
  });
});

describe("saveAsset", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = fsSync.mkdtempSync(path.join(os.tmpdir(), "planner-assets-"));
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

  it("writes a plain SVG under a .svg name", async () => {
    const { saveAsset } = await import("../assets");
    const saved = await saveAsset(svgBytes(PLAIN_SVG));

    expect(saved.name.endsWith(".svg")).toBe(true);
    expect(saved.ref).toBe(`assets/${saved.name}`);
    const onDisk = await fs.readFile(path.join(tmp, "assets", saved.name), "utf8");
    expect(onDisk).toBe(PLAIN_SVG);
  });

  it("refuses an SVG carrying script", async () => {
    const { saveAsset } = await import("../assets");
    await expect(saveAsset(svgBytes("<svg><script>alert(1)</script></svg>"))).rejects.toThrow(
      "That SVG contains script or external references and was refused",
    );
  });
});
