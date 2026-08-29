import Link from "next/link";
import {
  loadWorkspace,
  type CardModel,
  type CharterModel,
  type SubModel,
} from "@/lib/view/workspace";
import { Bar, Mono, Rule } from "@/components/momentum/primitives";
import NewButton from "@/components/momentum/new-button";
import {
  charterMilestones,
  targetProgress,
  type CharterTarget,
} from "@/lib/view/targets";
import TargetToggle from "@/components/momentum/target-toggle";

export const dynamic = "force-dynamic";

interface Linkable {
  target?: string;
  done: boolean;
}

/** A target may be named by a branch or by any leaf beneath it. */
function flattenSubs(subs: SubModel[]): Linkable[] {
  return subs.flatMap((s) => [{ target: s.target, done: s.done }, ...flattenSubs(s.subs)]);
}

function linkables(cards: CardModel[]): Linkable[] {
  return cards.flatMap((c) => [{ target: c.target, done: c.done }, ...flattenSubs(c.subs)]);
}

function TargetCard({ target, tasks }: { target: CharterTarget; tasks: Linkable[] }) {
  const progress = targetProgress(target, tasks);
  const quiet = target.charter.priority > 2;
  return (
    <div
      className={`rounded-2xl px-[18px] py-4 ${
        quiet ? "border border-dashed border-edge" : "border border-edge bg-surf"
      }`}
      style={quiet ? undefined : { borderLeft: `3px solid ${target.charter.color}` }}
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
        {target.id ? (
          <Mono className="text-[9px] tracking-[0.08em] text-faint">{target.id}</Mono>
        ) : null}
        <div className="flex-1" />
        {progress.binary ? (
          <Mono className="text-[10px] text-dim">{progress.pct}%</Mono>
        ) : (
          <Mono className="text-[10px] text-dim">
            {progress.done}/{progress.total} · {progress.pct}%
          </Mono>
        )}
        {target.by && <Mono className="text-[9.5px] text-faint">BY {target.by.toUpperCase()}</Mono>}
      </div>
      <Bar pct={progress.pct} color={target.charter.color} />
    </div>
  );
}

function CharterBlock({ charter, tasks }: { charter: CharterModel; tasks: CardModel[] }) {
  const groups = charterMilestones(charter);
  if (groups.length === 0) return null;

  const mine = linkables(
    tasks.filter((c) => c.slug === charter.id && c.type === charter.type),
  );

  return (
    <div className="mb-9">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-2 w-2 rounded-full" style={{ background: charter.color }} />
        <Link
          href={`/${charter.type === "area" ? "areas" : "projects"}/${charter.id}`}
          className="text-[15px] font-semibold tracking-[-0.02em] transition-colors hover:text-dim"
        >
          {charter.name}
        </Link>
        <Mono className="text-[9px] tracking-[0.1em] text-faint">{charter.priorityLabel}</Mono>
      </div>

      {groups.map((g, i) => (
        <div key={`${g.name ?? "none"}-${i}`} className="mb-4">
          <Rule label={(g.name ?? "UNSCHEDULED").toUpperCase()} />
          <div className="flex flex-col gap-2.5">
            {g.targets.map((t) => (
              <TargetCard key={`${charter.id}/${t.index}`} target={t} tasks={mine} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function TargetsPage() {
  const ws = await loadWorkspace();
  const charters = ws.charters.filter((c) => charterMilestones(c).length > 0);
  const ordered = [...charters].sort((a, b) =>
    a.priority !== b.priority ? a.priority - b.priority : a.name.localeCompare(b.name),
  );

  return (
    <div className="mx-auto max-w-[800px] px-[36px] pt-[52px] pb-[90px]">
      <div className="mb-[26px] flex items-center gap-3.5">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Roadmap</h1>
        <div className="flex-1" />
        <NewButton kind="target">New target</NewButton>
      </div>

      {ordered.length === 0 ? (
        <p className="text-[13px] text-faint">
          No targets yet. A target is one line of MVP scope on a project or area — add one there, or
          with + New target. Group them under <code>### M1 — name</code> headings to build a
          sequence, and put <code>target:G-001</code> on a task to make its progress real.
        </p>
      ) : (
        ordered.map((c) => <CharterBlock key={`${c.type}/${c.id}`} charter={c} tasks={ws.cards} />)
      )}
    </div>
  );
}
