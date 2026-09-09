import fs from "node:fs/promises";
import path from "node:path";
import { harnessDir, harnessPath } from "./paths";

export interface HarnessQuestion {
  q: string;
  keywords: string[];
}

export interface HarnessFile {
  questions: HarnessQuestion[];
}

/** The same shape a charter slug takes, checked before it reaches a path. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function harnessSlugOk(slug: string): boolean {
  return typeof slug === "string" && SLUG_RE.test(slug);
}

/**
 * Total: this never throws, for anything.
 *
 * A harness file is written by hand, so a half-finished line is the normal
 * case rather than corruption. A line that does not parse is skipped and the
 * rest of the file still runs — the opposite of `parseTasks`, where a
 * mis-parse must stop the world.
 */
export function parseHarness(raw: string): HarnessFile {
  const questions: HarnessQuestion[] = [];
  let active = true;

  for (const line of String(raw ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    if (trimmed.startsWith("#")) {
      const heading = /^#{1,6}\s*questions\s*$/i.test(trimmed);
      active = heading;
      continue;
    }
    if (!active) continue;
    if (!trimmed.startsWith("- ")) continue;

    const rest = trimmed.slice(2).trim();
    // The keywords are the last field, and a question may itself quote " | ".
    const cut = rest.lastIndexOf(" | ");
    if (cut < 0) continue;

    const q = rest.slice(0, cut).trim();
    const keywords = rest
      .slice(cut + 3)
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k !== "");

    if (q === "" || keywords.length === 0) continue;
    questions.push({ q, keywords });
  }

  return { questions };
}

export async function listHarnesses(): Promise<string[]> {
  let files: string[];
  try {
    files = await fs.readdir(harnessDir());
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.basename(f, ".md"))
    .filter(harnessSlugOk)
    .sort();
}

export async function readHarness(slug: string): Promise<HarnessFile> {
  if (!harnessSlugOk(slug)) {
    throw new Error(`Not a usable harness slug: "${slug}"`);
  }
  let raw: string;
  try {
    raw = await fs.readFile(harnessPath(slug), "utf8");
  } catch {
    throw new Error(`Harness not found: harness/${slug}.md`);
  }
  return parseHarness(raw);
}
