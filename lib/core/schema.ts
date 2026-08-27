import matter from "gray-matter";
import type { Charter, ProjectStatus, ProjectType } from "./types";

export class CharterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharterParseError";
  }
}

const PROJECT_TYPES: ProjectType[] = ["project", "area"];
const PROJECT_STATUSES: ProjectStatus[] = ["active", "paused", "done", "abandoned"];

const REQUIRED_KEYS = ["id", "name", "type", "status", "priority", "created", "updated"] as const;
const OPTIONAL_KEYS = ["mvp", "repo"] as const;
const KNOWN_KEYS = new Set<string>([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
const KNOWN_SECTIONS = ["Why", "MVP scope", "Parking lot"] as const;

const SPECIAL_CHAR_RE = /[\s:#,[\]{}&*!|>"%@`\\]/;
const YAML_KEYWORD_RE = /^(true|false|null|~|yes|no|on|off)$/i;
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

function needsQuote(value: string): boolean {
  if (value === "") return true;
  if (SPECIAL_CHAR_RE.test(value)) return true;
  if (YAML_KEYWORD_RE.test(value)) return true;
  if (NUMERIC_RE.test(value)) return true;
  return false;
}

function formatScalar(value: string | number): string {
  if (typeof value === "number") return String(value);
  return needsQuote(value) ? JSON.stringify(value) : value;
}

function normalizeScalar(value: unknown, key: string): string | number {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  throw new CharterParseError(`Invalid value for "${key}": expected string or number`);
}

function trimTrailingBlanks(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

export function parseCharter(raw: string): Charter {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  const unknownKeys = Object.keys(data).filter((k) => !KNOWN_KEYS.has(k));
  if (unknownKeys.length > 0) {
    throw new CharterParseError(`Unknown frontmatter key(s): ${unknownKeys.join(", ")}`);
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in data)) {
      throw new CharterParseError(`Missing required frontmatter key: ${key}`);
    }
  }

  const id = String(normalizeScalar(data.id, "id"));
  const name = String(normalizeScalar(data.name, "name"));

  const type = normalizeScalar(data.type, "type") as ProjectType;
  if (!PROJECT_TYPES.includes(type)) {
    throw new CharterParseError(`Invalid type "${type}"; expected one of: ${PROJECT_TYPES.join(", ")}`);
  }

  const status = normalizeScalar(data.status, "status") as ProjectStatus;
  if (!PROJECT_STATUSES.includes(status)) {
    throw new CharterParseError(`Invalid status "${status}"; expected one of: ${PROJECT_STATUSES.join(", ")}`);
  }

  const priority = normalizeScalar(data.priority, "priority");
  if (typeof priority !== "number" || !Number.isFinite(priority)) {
    throw new CharterParseError(`Invalid priority: expected number`);
  }

  const mvp = data.mvp === undefined ? undefined : String(normalizeScalar(data.mvp, "mvp"));
  if (type === "project" && mvp === undefined) {
    throw new CharterParseError(`Project charter requires "mvp"`);
  }

  const repo = data.repo === undefined ? undefined : String(normalizeScalar(data.repo, "repo"));
  const created = String(normalizeScalar(data.created, "created"));
  const updated = String(normalizeScalar(data.updated, "updated"));

  const { why, mvpScope, parkingLot } = parseBody(parsed.content);

  return {
    id,
    name,
    type,
    status,
    priority,
    mvp,
    repo,
    created,
    updated,
    why,
    mvpScope,
    parkingLot,
  };
}

function parseBody(content: string): { why: string; mvpScope: string[]; parkingLot: string[] } {
  const lines = content.split(/\r?\n/);
  let section: "Why" | "MVP scope" | "Parking lot" | null = null;
  const whyLines: string[] = [];
  const mvpLines: string[] = [];
  const parkingLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      if (heading === "Why") section = "Why";
      else if (heading === "MVP scope") section = "MVP scope";
      else if (heading === "Parking lot") section = "Parking lot";
      else {
        throw new CharterParseError(
          `Unknown section "${heading}". Known sections: ${KNOWN_SECTIONS.join(", ")}`,
        );
      }
      continue;
    }
    if (section === "Why") whyLines.push(line);
    else if (section === "MVP scope") mvpLines.push(line);
    else if (section === "Parking lot") parkingLines.push(line);
  }

  if (whyLines.length === 0) {
    throw new CharterParseError(`Missing required section: Why`);
  }

  return {
    why: trimTrailingBlanks(whyLines).join("\n"),
    mvpScope: trimTrailingBlanks(mvpLines),
    parkingLot: trimTrailingBlanks(parkingLines),
  };
}

export function serializeCharter(c: Charter): string {
  const rows: string[] = [
    `id: ${formatScalar(c.id)}`,
    `name: ${formatScalar(c.name)}`,
    `type: ${formatScalar(c.type)}`,
    `status: ${formatScalar(c.status)}`,
    `priority: ${formatScalar(c.priority)}`,
  ];
  if (c.mvp !== undefined) rows.push(`mvp: ${formatScalar(c.mvp)}`);
  if (c.repo !== undefined) rows.push(`repo: ${formatScalar(c.repo)}`);
  rows.push(`created: ${formatScalar(c.created)}`);
  rows.push(`updated: ${formatScalar(c.updated)}`);

  const why = c.why.split("\n");

  const body = [
    "## Why",
    ...why,
    "",
    "## MVP scope",
    ...c.mvpScope,
    "",
    "## Parking lot",
    ...c.parkingLot,
  ].join("\n");

  return `---\n${rows.join("\n")}\n---\n\n${body}\n`;
}
