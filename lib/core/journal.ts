import fs from "node:fs/promises";
import path from "node:path";
import { journalPath } from "./paths";

export async function appendJournal(scope: string, message: string): Promise<void> {
  const now = new Date();
  const date = now.toLocaleDateString("sv").slice(0, 10);
  const time = now.toLocaleTimeString("sv").slice(0, 5);
  const file = journalPath(date);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const header = await fs.access(file).then(() => "").catch(() => `# ${date}\n\n`);
  const line = `- ${time} [${scope}] ${message}\n`;
  await fs.appendFile(file, header + line);
}

export interface JournalEntry {
  time: string;
  scope: string;
  message: string;
}

export interface JournalDay {
  date: string;
  entries: JournalEntry[];
}

const ENTRY_RE = /^- (\d{2}:\d{2}) \[([^\]]+)\] (.*)$/;

function today(): string {
  return new Date().toLocaleDateString("sv").slice(0, 10);
}

function dateMinusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString("sv").slice(0, 10);
}

export async function readJournal(days: number): Promise<JournalDay[]> {
  const todayStr = today();
  const out: JournalDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = dateMinusDays(todayStr, i);
    const file = journalPath(date);
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      continue;
    }
    const entries: JournalEntry[] = [];
    for (const line of raw.split("\n")) {
      const m = ENTRY_RE.exec(line);
      if (m) entries.push({ time: m[1], scope: m[2], message: m[3] });
    }
    if (entries.length) out.push({ date, entries });
  }
  return out;
}
