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
