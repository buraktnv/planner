import Link from "next/link";
import type { CSSProperties } from "react";
import { loadWorkspace, type CharterModel } from "@/lib/view/workspace";
import { Mono, Ring, Rule, StatChip } from "@/components/momentum/primitives";
import { shortDate } from "@/lib/ui/momentum";

export const dynamic = "force-dynamic";

interface Target {
  title: string;
  by: string | null;
  done: boolean;
}

function parseScopeLine(line: string): Target | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const marker = /^-\s*\[( |x)\]\s*/.exec(trimmed);
  const done = marker ? marker[1] === "x" : false;
  let rest = marker ? trimmed.slice(marker[0].length) : trimmed.replace(/^-\s*/, "");
  let by: string | null = null;
  const byMatch = /\s*(?:—|--)\s*by\s+(.+)$/i.exec(rest);
  if (byMatch) {
    by = byMatch[1].trim();
    rest = rest.slice(0, byMatch.index).trim();
  }
  if (!rest) return null;
  return { title: rest, by, done };
}

function targetsOf(charter: CharterModel): Target[] {
  return charter.mvpScope
    .map(parseScopeLine)
    .filter((t): t is Target => t !== null);
}

function statusLine(area: CharterModel): string {
  if (area.total === 0) return "Nothing captured here yet.";
  const overdue = area.cards.filter((c) => c.overdue).length;
  const parts = [`${area.open} open`, `${area.doneTotal} done`];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  const tail = area.lastActivity
    ? ` Last movement ${shortDate(area.lastActivity)}.`
    : "";
  return `${parts.join(", ")}.${tail}`;
}

export default async function LifePage() {
  const ws = await loadWorkspace();
  const openInAreas = ws.areas.reduce((a, c) => a + c.open, 0);
  const allTargets = ws.charters.flatMap((c) =>
    targetsOf(c).map((t) => ({ ...t, charter: c })),
  );
  const closest = allTargets
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        a.charter.priority - b.charter.priority ||
        a.charter.name.localeCompare(b.charter.name),
    )
    .slice(0, 4);

  return (
    <div className="mx-auto max-w-[800px] px-[36px] pt-[52px] pb-[90px]">
      <h1 className="m-0 mb-1.5 text-2xl font-semibold tracking-[-0.03em]">Life</h1>
      <p className="m-0 mb-[26px] text-[13.5px] text-dim">
        Areas and targets. Projects sit alongside and feed into them.
      </p>

      <div className="mb-[30px] grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-[11px]">
        <StatChip n={ws.areas.length} label="AREAS" />
        <StatChip n={ws.projects.length} label="PROJECTS" color="var(--color-deep-ink)" />
        <StatChip n={openInAreas} label="OPEN IN AREAS" color="var(--color-wait-ink)" />
        <StatChip n={allTargets.length} label="TARGETS" color="var(--color-quick-ink)" />
      </div>

      <Rule label="AREAS" />
      {ws.areas.length === 0 ? (
        <p className="mb-[30px] text-[13px] text-faint">
          No areas yet. An area is a part of life that never finishes — health, home, learning.
        </p>
      ) : (
        <div className="mb-[30px] grid grid-cols-[repeat(auto-fit,minmax(330px,1fr))] gap-[11px]">
          {ws.areas.map((a) => (
            <Link
              key={a.id}
              href={`/areas/${a.id}`}
              className="min-w-0 rounded-[18px] border border-edge bg-surf px-5 py-[18px] transition-colors hover:border-[var(--hov)]"
              style={{ "--hov": a.color } as CSSProperties}
            >
              <div className="mb-2.5 flex items-center gap-2.5">
                <span
                  className="h-[9px] w-[9px] rounded-full"
                  style={{ background: a.color }}
                />
                <span className="text-base font-semibold tracking-[-0.02em]">{a.name}</span>
                <div className="flex-1" />
                <Mono className="text-[9.5px] text-faint">{a.open} OPEN</Mono>
              </div>
              <p className="m-0 text-[13px] leading-[1.55] text-dim">{statusLine(a)}</p>
            </Link>
          ))}
        </div>
      )}

      <Rule label="CLOSEST TARGETS" />
      {closest.length === 0 ? (
        <p className="text-[13px] text-faint">
          No open targets. Add one line to a charter&apos;s MVP scope and it lands here.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2.5">
          {closest.map((t) => (
            <div
              key={`${t.charter.id}/${t.title}`}
              className="flex min-w-0 items-center gap-[13px] rounded-2xl border border-edge bg-surf p-[15px]"
            >
              <Ring pct={t.done ? 100 : 0} size={42} width={13} color={t.charter.color} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold leading-[1.3]">{t.title}</div>
                <Mono className="mt-1.5 block text-[9px] text-faint">
                  {t.charter.name.toUpperCase()}
                  {t.by ? ` · BY ${t.by.toUpperCase()}` : ""}
                </Mono>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
