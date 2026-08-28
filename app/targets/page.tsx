import { loadWorkspace, type CharterModel } from "@/lib/view/workspace";
import { Bar, Mono, Rule } from "@/components/momentum/primitives";
import NewButton from "@/components/momentum/new-button";

export const dynamic = "force-dynamic";

interface Target {
  title: string;
  by: string | null;
  done: boolean;
  charter: CharterModel;
}

function parseScopeLine(line: string): Omit<Target, "charter"> | null {
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

function TargetCard({ target, dashed }: { target: Target; dashed: boolean }) {
  const pct = target.done ? 100 : 0;
  return (
    <div
      className={`rounded-2xl px-[18px] py-4 ${
        dashed ? "border border-dashed border-edge" : "border border-edge bg-surf"
      }`}
      style={dashed ? undefined : { borderLeft: `3px solid ${target.charter.color}` }}
    >
      <div className="mb-[11px] flex flex-wrap items-baseline gap-[11px]">
        <span className="text-[14.5px] font-semibold tracking-[-0.02em]">{target.title}</span>
        <Mono className="rounded-[5px] bg-soft px-2 py-[3px] text-[9px] tracking-[0.08em] text-dim">
          {target.charter.name.toUpperCase()}
        </Mono>
        <div className="flex-1" />
        <Mono className="text-[10px] text-dim">{pct}%</Mono>
        {target.by && (
          <Mono className="text-[9.5px] text-faint">BY {target.by.toUpperCase()}</Mono>
        )}
      </div>
      <Bar pct={pct} color={target.charter.color} />
    </div>
  );
}

export default async function TargetsPage() {
  const ws = await loadWorkspace();
  const all: Target[] = ws.charters.flatMap((c) =>
    c.mvpScope
      .map(parseScopeLine)
      .filter((t): t is Omit<Target, "charter"> => t !== null)
      .map((t) => ({ ...t, charter: c })),
  );
  const short = all.filter((t) => t.charter.priority <= 2);
  const long = all.filter((t) => t.charter.priority > 2);

  return (
    <div className="mx-auto max-w-[800px] px-[36px] pt-[52px] pb-[90px]">
      <div className="mb-[26px] flex items-center gap-3.5">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Targets</h1>
        <div className="flex-1" />
        <NewButton kind="target">New target</NewButton>
      </div>

      {all.length === 0 ? (
        <p className="text-[13px] text-faint">
          No targets yet. A target is one line of MVP scope on a project or area — add one there,
          or with + New target.
        </p>
      ) : (
        <>
          <Rule label="SHORT TERM — WEEKS" />
          {short.length === 0 ? (
            <p className="mb-8 text-[13px] text-faint">
              Nothing short-term. Targets on P1 and P2 charters land here.
            </p>
          ) : (
            <div className="mb-8 flex flex-col gap-2.5">
              {short.map((t) => (
                <TargetCard key={`${t.charter.id}/${t.title}`} target={t} dashed={false} />
              ))}
            </div>
          )}

          <Rule label="LONG TERM — MONTHS AND YEARS" />
          {long.length === 0 ? (
            <p className="text-[13px] text-faint">
              Nothing long-term. Targets on lower-priority charters land here.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {long.map((t) => (
                <TargetCard key={`${t.charter.id}/${t.title}`} target={t} dashed />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
