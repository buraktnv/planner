import matter from "gray-matter";
import type {
  Charter,
  ProjectStatus,
  ProjectType,
  Task,
  TaskLane,
  TaskSection,
  TaskSize,
} from "./types";

export class CharterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharterParseError";
  }
}

export class TaskParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskParseError";
  }
}

function toLF(raw: string): string {
  return raw.replace(/\r\n/g, "\n");
}

const TASK_SECTIONS: Record<string, TaskSection> = {
  Backlog: "backlog",
  "In progress": "in-progress",
  Done: "done",
};
const TASK_SECTION_ORDER: TaskSection[] = ["backlog", "in-progress", "done"];
const TASK_SECTION_HEADER: Record<TaskSection, string> = {
  backlog: "## Backlog",
  "in-progress": "## In progress",
  done: "## Done",
};
const TASK_FIELD_KEYS = new Set(["created", "done", "est", "due", "lane", "target", "waits"]);
const TARGET_REF_RE = /^G-\d{3,}$/;
const TASK_LANE_VALUES: TaskLane[] = ["quick", "deep", "wait", "some"];
const TASK_SIZE_VALUES: TaskSize[] = ["S", "M", "L"];

const TASK_PREFIX_RE = /^( *)- \[( |x)\] (.*)$/;

function depthOf(id: string): number {
  return id.split(".").length - 1;
}

export function parseTasks(raw: string): Task[] {
  const text = toLF(raw);
  const lines = text.split("\n");
  const tasks: Task[] = [];
  const seenIds = new Set<string>();
  let currentSection: TaskSection | null = null;
  let sectionIndex = -1;
  const pendingParents: { id: string; parentId: string; lineNo: number; line: string }[] = [];

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine;

    if (line.trim() === "") return;

    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      const sec = TASK_SECTIONS[heading];
      if (!sec) {
        throw new TaskParseError(`Line ${lineNo}: unknown task section "${heading}"`);
      }
      const newIndex = TASK_SECTION_ORDER.indexOf(sec);
      if (newIndex < sectionIndex) {
        throw new TaskParseError(`Line ${lineNo}: section "${heading}" is out of order`);
      }
      sectionIndex = newIndex;
      currentSection = sec;
      return;
    }

    if (currentSection === null) {
      throw new TaskParseError(`Line ${lineNo}: task line before any section: ${line}`);
    }

    const prefix = TASK_PREFIX_RE.exec(line);
    if (!prefix) {
      throw new TaskParseError(`Line ${lineNo}: malformed task line: ${line}`);
    }

    const indent = prefix[1];
    const checked = prefix[2];
    const rest = prefix[3];

    if (indent.length % 2 !== 0) {
      throw new TaskParseError(`Line ${lineNo}: odd indent (${indent.length} spaces): ${line}`);
    }
    const depth = indent.length / 2;

    const parts = rest.split(" | ");
    const id = parts[0].trim();
    const sizeRaw = (parts[1] ?? "").trim();
    const title = (parts[2] ?? "").trim();

    if (id === "") {
      throw new TaskParseError(`Line ${lineNo}: missing task id: ${line}`);
    }
    if (!TASK_SIZE_VALUES.includes(sizeRaw as TaskSize)) {
      throw new TaskParseError(`Line ${lineNo}: task ${id} has invalid size "${sizeRaw}"`);
    }
    if (title === "") {
      throw new TaskParseError(`Line ${lineNo}: task ${id} is missing a title: ${line}`);
    }
    if (seenIds.has(id)) {
      throw new TaskParseError(`Line ${lineNo}: duplicate task id "${id}"`);
    }

    const idDepth = depthOf(id);
    if (depth !== idDepth) {
      throw new TaskParseError(
        `Line ${lineNo}: indent depth ${depth} does not match id "${id}" (no parent at depth ${depth - 1}): ${line}`,
      );
    }
    const parentId = depth === 0 ? null : id.slice(0, id.lastIndexOf("."));
    seenIds.add(id);
    if (parentId !== null) {
      pendingParents.push({ id, parentId, lineNo, line });
    }

    let created: string | undefined;
    let doneDate: string | undefined;
    let est: string | undefined;
    let due: string | undefined;
    let lane: TaskLane | undefined;
    let target: string | undefined;
    let waitsOn: string | undefined;
    for (const field of parts.slice(3)) {
      const colon = field.indexOf(":");
      if (colon < 0) {
        throw new TaskParseError(`Line ${lineNo}: malformed field "${field}" in: ${line}`);
      }
      const key = field.slice(0, colon).trim();
      const value = field.slice(colon + 1).trim();
      if (!TASK_FIELD_KEYS.has(key)) {
        throw new TaskParseError(`Line ${lineNo}: unknown field key "${key}" in: ${line}`);
      }
      if (key === "created") created = value;
      else if (key === "done") doneDate = value;
      else if (key === "est") est = value;
      else if (key === "due") due = value;
      else if (key === "lane") {
        if (!TASK_LANE_VALUES.includes(value as TaskLane)) {
          throw new TaskParseError(
            `Line ${lineNo}: task ${id} has invalid lane "${value}"; expected one of: ${TASK_LANE_VALUES.join(", ")}`,
          );
        }
        lane = value as TaskLane;
      } else if (key === "target") {
        // Shape only. Targets live in the charter file, not here, so this
        // parser cannot check existence — and must not, or editing a charter
        // could make tasks.md unparseable. Unknown ids resolve to no link.
        if (!TARGET_REF_RE.test(value)) {
          throw new TaskParseError(
            `Line ${lineNo}: task ${id} has invalid target "${value}"; expected G- followed by at least 3 digits`,
          );
        }
        target = value;
      } else if (key === "waits") {
        if (value === "") {
          throw new TaskParseError(`Line ${lineNo}: task ${id} has an empty waits: value: ${line}`);
        }
        waitsOn = value;
      }
    }

    const isDone = checked === "x";
    if (isDone !== (currentSection === "done")) {
      throw new TaskParseError(
        `Line ${lineNo}: checkbox [${isDone ? "x" : " "}] is inconsistent with section "${currentSection}" for ${id}: ${line}`,
      );
    }
    if (isDone && !doneDate) {
      throw new TaskParseError(`Line ${lineNo}: done task ${id} is missing a done: date: ${line}`);
    }
    if (!isDone && doneDate) {
      throw new TaskParseError(`Line ${lineNo}: non-done task ${id} has a done: date: ${line}`);
    }

    tasks.push({
      id,
      title,
      size: sizeRaw as TaskSize,
      lane,
      done: isDone,
      section: currentSection,
      created,
      doneDate,
      est,
      due,
      target,
      waitsOn,
      parentId,
    });
  });

  for (const pending of pendingParents) {
    if (!seenIds.has(pending.parentId)) {
      throw new TaskParseError(
        `Line ${pending.lineNo}: subtask "${pending.id}" has no parent "${pending.parentId}" in this file: ${pending.line}`,
      );
    }
  }

  return tasks;
}

/** `T-001.2` -> [1, 2], so ids sort as a tree rather than as strings. */
function idPath(id: string): number[] {
  return id
    .replace(/^T-/, "")
    .split(".")
    .map((part) => Number(part) || 0);
}

function byIdPath(a: Task, b: Task): number {
  const pa = idPath(a.id);
  const pb = idPath(b.id);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function serializeTasks(tasks: Task[]): string {
  const blocks = TASK_SECTION_ORDER.map((sec) => {
    const lines: string[] = [TASK_SECTION_HEADER[sec]];
    // Sorted by id rather than array position: completing a task moves it to
    // another section without moving it in the array, so raw order would list
    // a decomposition backwards in ## Done.
    for (const t of [...tasks].filter((x) => x.section === sec).sort(byIdPath)) {
      const indent = "  ".repeat(depthOf(t.id));
      const box = t.done ? "[x]" : "[ ]";
      const fields: string[] = [];
      if (t.created) fields.push(`created:${t.created}`);
      if (t.est) fields.push(`est:${t.est}`);
      if (t.due) fields.push(`due:${t.due}`);
      if (t.lane) fields.push(`lane:${t.lane}`);
      if (t.target) fields.push(`target:${t.target}`);
      if (t.waitsOn) fields.push(`waits:${t.waitsOn}`);
      if (t.doneDate) fields.push(`done:${t.doneDate}`);
      const fieldStr = fields.length ? ` | ${fields.join(" | ")}` : "";
      lines.push(`${indent}- ${box} ${t.id} | ${t.size} | ${t.title}${fieldStr}`);
    }
    return lines.join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}

export function nextTaskId(tasks: Task[]): string {
  let max = 0;
  for (const t of tasks) {
    const m = /^T-(\d+)$/.exec(t.id);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  const next = max + 1;
  return `T-${String(next).padStart(3, "0")}`;
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
