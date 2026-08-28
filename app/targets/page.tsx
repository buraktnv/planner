import { loadWorkspace } from "@/lib/view/workspace";
import { Bar, Mono, Rule } from "@/components/momentum/primitives";
import NewButton from "@/components/momentum/new-button";
import { allTargets, targetPct, type CharterTarget } from "@/lib/view/targets";
import TargetToggle from "@/components/momentum/target-toggle";

export const dynamic = "force-dynamic";

function TargetCard({ target, dashed }: { target: CharterTarget; dashed: boolean }) {
  const pct = targetPct(target);
  return (
    <div
      className={`rounded-2xl px-[18px] py-4 ${
        dashed ? "border border-dashed border-edge" : "border border-edge bg-surf"
      }`}
      style={dashed ? undefined : { borderLeft: `3px solid ${target.charter.color}` }}
    >
      <div className="mb-[11px] flex flex-wrap items-center gap-[11px]">
        <TargetToggle
          type={target.charter.type}
          slug={target.charter.id}
          scope={target.charter.mvpScope}
          index={target.index}
          done={target.done}
          color={target.charter.color}
        />
        <span
          className={`text-[14.5px] font-semibold tracking-[-0.02em] ${
            target.done ? "text-faint line-through" : ""
          }`}
        >
          {target.title}
        </span>
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
  const all = allTargets(ws.charters);
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
