"use client";

import Link from "next/link";
import { LANES } from "@/lib/ui/momentum";
import { taskHrefFromScope } from "@/lib/view/task";
import {
  readDaily,
  readNextActions,
  readNotes,
  readOneNote,
  readTargets,
  readTaskReceipt,
} from "@/lib/view/chat-cards";
import type { ToolPartLike } from "@/lib/view/chat-parts";
import { Mono } from "../primitives";

/**
 * The model chooses its UI by choosing a tool. This registry maps a tool name
 * to what its output renders as; anything not listed keeps the plain chip the
 * transcript already shows, so an unregistered tool can never regress.
 *
 * Lookup happens after `toolNameOf`, so both provider paths hit the same entry
 * despite one of them prefixing every name with `mcp__planner__`.
 */
export type ToolCardRenderer = (part: ToolPartLike) => React.ReactNode;

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-[12px] border border-edge2 bg-surf px-3 py-2.5">
      <Mono className="mb-2 block text-[8px] tracking-[0.12em] text-faint">{label}</Mono>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[12px] text-faint">{children}</p>;
}

function NextActions(part: ToolPartLike) {
  const list = readNextActions(part.output);
  if (!list) return null;
  if (list.length === 0) return <Card label="NEXT"><Empty>Nothing open.</Empty></Card>;

  return (
    <Card label={`NEXT · ${list.length}`}>
      <div className="flex flex-col gap-1.5">
        {list.slice(0, 8).map((a) => {
          const lane = a.lane ? LANES[a.lane] : null;
          return (
            <div key={a.id} className="flex items-center gap-2.5">
              {a.scope ? (
                <Link href={taskHrefFromScope(a.scope, a.id)} className="shrink-0">
                  <Mono className="text-[9px] text-faint hover:text-ink hover:underline">
                    {a.id}
                  </Mono>
                </Link>
              ) : (
                <Mono className="shrink-0 text-[9px] text-faint">{a.id}</Mono>
              )}
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{a.title}</span>
              {a.due && <Mono className="shrink-0 text-[8.5px] text-faint">{a.due}</Mono>}
              {a.blocked && (
                <Mono className="shrink-0 text-[8px] tracking-[0.08em] text-wait-ink">BLOCKED</Mono>
              )}
              {lane && (
                <Mono
                  className="shrink-0 rounded-[5px] px-1.5 py-[2px] text-[8px] tracking-[0.08em]"
                  style={{ color: lane.ink, background: lane.tint }}
                >
                  {lane.label.toUpperCase()}
                </Mono>
              )}
            </div>
          );
        })}
        {list.length > 8 && (
          <Mono className="text-[8.5px] text-faint">+{list.length - 8} more</Mono>
        )}
      </div>
    </Card>
  );
}

function Daily(part: ToolPartLike) {
  const data = readDaily(part.output);
  if (!data) return null;

  const row = (label: string, items: { id: string; name: string; goal: number; unit: string | null }[], per: string) =>
    items.length === 0 ? null : (
      <div key={label}>
        <Mono className="mb-1 block text-[8px] tracking-[0.1em] text-faint">{label}</Mono>
        <div className="mb-2 flex flex-col gap-1">
          {items.map((h) => (
            <div key={h.id} className="flex items-center gap-2.5">
              <Mono className="shrink-0 text-[9px] text-faint">{h.id}</Mono>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{h.name}</span>
              <Mono className="shrink-0 text-[8.5px] text-dim">
                {h.goal}×{h.unit ? ` ${h.unit}` : ""} {per}
              </Mono>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <Card label="DAILY">
      {row("HABITS", data.habits, "a day")}
      {row("RHYTHMS", data.rhythms, "a week")}
      {data.meals.length > 0 && (
        <>
          <Mono className="mb-1 block text-[8px] tracking-[0.1em] text-faint">MEALS</Mono>
          <div className="mb-2 flex flex-col gap-1">
            {data.meals.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5">
                <Mono className="shrink-0 text-[9px] text-faint">{m.id}</Mono>
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{m.name}</span>
                <Mono className="shrink-0 text-[8.5px] text-dim">{m.servings} left</Mono>
              </div>
            ))}
          </div>
        </>
      )}
      {data.groceriesOpen > 0 && (
        <Mono className="text-[8.5px] text-faint">{data.groceriesOpen} ON THE GROCERY LIST</Mono>
      )}
      {data.habits.length === 0 && data.rhythms.length === 0 && data.meals.length === 0 && (
        <Empty>Nothing set up yet.</Empty>
      )}
    </Card>
  );
}

function Targets(part: ToolPartLike) {
  const list = readTargets(part.output);
  if (!list) return null;
  if (list.length === 0) return <Card label="TARGETS"><Empty>No targets set.</Empty></Card>;

  return (
    <Card label={`TARGETS · ${list.length}`}>
      <div className="flex flex-col gap-2">
        {list.slice(0, 10).map((t, i) => (
          <div key={t.id ?? `${t.title}-${i}`}>
            <div className="flex items-center gap-2.5">
              {t.id && <Mono className="shrink-0 text-[9px] text-faint">{t.id}</Mono>}
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{t.title}</span>
              {t.by && <Mono className="shrink-0 text-[8.5px] text-faint">{t.by}</Mono>}
              <Mono className="shrink-0 text-[8.5px] text-dim">{t.pct}%</Mono>
            </div>
            <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-soft">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${t.pct}%`,
                  background: t.done ? "var(--color-quick)" : "var(--color-deep)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Notes(part: ToolPartLike) {
  const list = readNotes(part.output);
  if (!list) return null;
  if (list.length === 0) return <Card label="KNOWLEDGE"><Empty>Nothing matched.</Empty></Card>;

  return (
    <Card label={`KNOWLEDGE · ${list.length}`}>
      <div className="flex flex-col gap-2">
        {list.map((n) => (
          <NoteRow key={n.id} note={n} />
        ))}
      </div>
    </Card>
  );
}

function OneNote(part: ToolPartLike) {
  const note = readOneNote(part.output);
  if (!note) return null;
  return (
    <Card label="NOTE">
      <NoteRow note={note} />
    </Card>
  );
}

function NoteRow({
  note,
}: {
  note: { id: string; title: string; summary: string; scope: string[]; tags: string[] };
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <Link href={`/knowledge/${note.id}`} className="shrink-0">
          <Mono className="text-[9px] text-faint hover:text-ink hover:underline">{note.id}</Mono>
        </Link>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
          {note.title}
        </span>
        {note.tags.slice(0, 2).map((t) => (
          <Mono key={t} className="shrink-0 rounded-[5px] bg-soft px-1.5 py-[2px] text-[8px] text-dim">
            {t}
          </Mono>
        ))}
      </div>
      {note.summary && (
        <p className="mt-0.5 mb-0 pl-[34px] text-[11.5px] leading-[1.45] text-faint">
          {note.summary}
        </p>
      )}
    </div>
  );
}

function receipt(label: string): ToolCardRenderer {
  return function Receipt(part) {
    const input = part.input as { project?: unknown } | undefined;
    const row = readTaskReceipt(part.output, input);
    if (!row) return null;
    return (
      <Card label={label}>
        <div className="flex items-center gap-2.5">
          {row.scope ? (
            <Link href={taskHrefFromScope(row.scope, row.id)} className="shrink-0">
              <Mono className="text-[9px] text-faint hover:text-ink hover:underline">{row.id}</Mono>
            </Link>
          ) : (
            <Mono className="shrink-0 text-[9px] text-faint">{row.id}</Mono>
          )}
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{row.title}</span>
        </div>
      </Card>
    );
  };
}

export const TOOL_CARDS: Record<string, ToolCardRenderer> = {
  next_actions: NextActions,
  get_daily: Daily,
  list_targets: Targets,
  search_knowledge: Notes,
  read_note: OneNote,
  create_task: receipt("CREATED"),
  update_task: receipt("UPDATED"),
};
