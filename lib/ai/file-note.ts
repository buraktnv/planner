import {
  addNote,
  deriveTitle,
  listNotes,
  nearDuplicateOf,
  updateNote,
} from "../core/knowledge";
import { readJournal } from "../core/journal";
import type { KnowledgeNote } from "../core/types";
import { classifyNote, type ClassifyMethod } from "./classify";

export interface FileNoteInput {
  title?: string;
  summary: string;
  body?: string;
  scope?: string[];
  tags?: string[];
  source?: string;
}

export interface FileNoteResult {
  note: KnowledgeNote;
  scopeMethod: ClassifyMethod;
  scopeReason: string;
  createdArea?: string;
  duplicateOf?: string;
}

const DAILY_AUTO_CAP = 40;

export function autoNotesToday(
  journal: Array<{ entries: Array<{ message: string }> }>,
): number {
  let n = 0;
  for (const day of journal) {
    for (const e of day.entries) if (e.message.includes("note added:")) n++;
  }
  return n;
}

export async function fileNote(
  input: FileNoteInput,
  opts: { allowCreate?: boolean } = {},
): Promise<FileNoteResult> {
  const summary = input.summary?.trim() ?? "";
  if (!summary) throw new Error("A note requires a non-empty summary");
  const title = input.title?.trim() || deriveTitle(summary);

  const existing = await listNotes();
  const duplicate = nearDuplicateOf(existing, { title, summary });
  if (duplicate) {
    const merged =
      summary.length > duplicate.summary.length
        ? await updateNote(duplicate.id, { summary })
        : duplicate;
    return {
      note: merged,
      scopeMethod: "explicit",
      scopeReason: "already filed; kept the existing note",
      duplicateOf: duplicate.id,
    };
  }

  if (!input.scope?.length) {
    const today = await readJournal(1);
    if (autoNotesToday(today) >= DAILY_AUTO_CAP) {
      throw new Error(
        `Daily note limit reached (${DAILY_AUTO_CAP}). Refusing to file more automatically today.`,
      );
    }
  }

  const classified = await classifyNote(
    { title, summary, body: input.body, scope: input.scope },
    { allowCreate: opts.allowCreate ?? true },
  );

  const note = await addNote({
    title,
    summary,
    body: input.body,
    scope: classified.scope,
    tags: input.tags,
    source: input.source ?? (classified.method === "explicit" ? undefined : "auto-filed"),
  });

  return {
    note,
    scopeMethod: classified.method,
    scopeReason: classified.reason,
    createdArea: classified.createdArea?.id,
  };
}
