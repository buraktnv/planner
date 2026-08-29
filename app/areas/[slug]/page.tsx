import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCharterModel, type CardModel } from "@/lib/view/workspace";
import {
  AssistantNote,
  LaneTag,
  Mono,
  Ring,
  Rule,
  Tick,
} from "@/components/momentum/primitives";
import CardOpener from "@/components/momentum/card-opener";
import NewButton from "@/components/momentum/new-button";
import ArchiveButton from "@/components/momentum/archive-button";
import { targetsOf } from "@/lib/view/targets";
import { listNotes } from "@/lib/core/knowledge";
import TargetToggle from "@/components/momentum/target-toggle";
import { LANES, shortDate } from "@/lib/ui/momentum";

export const dynamic = "force-dynamic";

function parkedTitle(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^-\s*(\[( |x)\]\s*)?/, "").trim() || null;
}

function noteFor(open: number, overdue: number, lastActivity: string | null): string {
  if (open === 0) return "Nothing open here. Capture something, or let it rest.";
  const head = overdue > 0 ? `${open} open, ${overdue} overdue.` : `${open} open.`;
  const tail = lastActivity
    ? ` Last movement ${shortDate(lastActivity)}.`
    : " No movement logged yet.";
  return head + tail;
}

function orderCards(cards: CardModel[]): CardModel[] {
  const rank = (c: CardModel) =>
    c.done ? 3 : c.overdue ? 0 : c.section === "in-progress" ? 1 : 2;
  return [...cards].sort((a, b) => rank(a) - rank(b));
}

export default async function AreaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const area = await loadCharterModel("area", slug);
  if (!area) notFound();

  const notes = await listNotes();
  const docCount = notes.filter((n) => n.scope.includes(`area:${area.id}`)).length;

  const targets = targetsOf(area.mvpScope);
  const parked = area.parkingLot
    .map(parkedTitle)
    .filter((t): t is string => t !== null);
  const overdue = area.cards.filter((c) => c.overdue).length;
  const tasks = orderCards(area.cards);

  return (
    <div className="mx-auto max-w-[760px] px-[36px] pt-[52px] pb-[90px]">
      <div className="mb-3 flex items-center gap-[11px]">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: area.color }}
        />
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">{area.name}</h1>
        <div className="flex-1" />
        <Link
          href={`/areas/${area.id}/docs`}
          className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          DOCS · {docCount}
        </Link>
        <Link
          href={`/canvas/area/${area.id}/system`}
          className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          SYSTEM
        </Link>
        <Link
          href={`/canvas/area/${area.id}`}
          className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          MAP
        </Link>
        <NewButton kind="branch" prefill={{ scopeKey: `area/${area.id}` }} variant="mono">
          + TASK
        </NewButton>
        <ArchiveButton type="area" slug={area.id} name={area.name} />
      </div>

      <AssistantNote className="mb-3.5">
        {noteFor(area.open, overdue, area.lastActivity)}
      </AssistantNote>

      {area.next && (
        <div
          className="mb-[30px] rounded-2xl border border-edge bg-surf px-[18px] py-4"
          style={{ borderLeft: `3px solid ${area.color}` }}
        >
          <Mono className="mb-[7px] block text-[9px] tracking-[0.12em] text-faint">
            RIGHT NOW
          </Mono>
          <div className="text-base font-semibold tracking-[-0.02em]">{area.next.title}</div>
        </div>
      )}

      <Rule label="SHORT TERM" />
      {targets.length === 0 ? (
        <p className="mb-6 text-[13px] text-faint">
          No targets on this area yet.
        </p>
      ) : (
        <div className="mb-6 grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2.5">
          {targets.map((t) => (
            <div
              key={t.title}
              className="flex min-w-0 items-center gap-[13px] rounded-2xl border border-edge bg-surf p-[15px]"
            >
              <Ring pct={t.done ? 100 : 0} size={42} width={13} color={area.color} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <TargetToggle
                    type="area"
                    slug={area.id}
                    scope={area.mvpScope}
                    index={t.index}
                    done={t.done}
                    color={area.color}
                  />
                  <div
                    className={`text-[13px] font-semibold leading-[1.3] ${
                      t.done ? "text-faint line-through" : ""
                    }`}
                  >
                    {t.title}
                  </div>
                </div>
                <Mono className="mt-1.5 block text-[9px] text-faint">
                  {t.done ? "DONE" : "OPEN"}
                  {t.by ? ` · BY ${t.by.toUpperCase()}` : ""}
                </Mono>
              </div>
            </div>
          ))}
        </div>
      )}

      <Rule label="LONG TERM" />
      {parked.length === 0 ? (
        <p className="mb-[30px] text-[13px] text-faint">
          Nothing parked. The parking lot holds ideas that are out of scope for now.
        </p>
      ) : (
        <div className="mb-[30px] grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-2.5">
          {parked.map((title) => (
            <div
              key={title}
              className="flex min-w-0 items-center gap-[13px] rounded-2xl border border-dashed border-edge p-[15px]"
            >
              <Ring pct={0} size={42} width={13} color={area.color} />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold leading-[1.3]">{title}</div>
                <Mono className="mt-1.5 block text-[9px] text-faint">PARKED</Mono>
              </div>
            </div>
          ))}
        </div>
      )}

      <Rule label="TASKS" />
      {tasks.length === 0 ? (
        <p className="text-[13px] text-faint">
          No tasks yet. Add one with + TASK above.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[18px] border border-edge bg-surf">
          {tasks.map((t) => {
            const lane = LANES[t.lane];
            return (
              <CardOpener
                key={t.key}
                card={t}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-edge2 px-[17px] py-[13px] text-left"
              >
                <Tick done={t.done} color={area.color} size={15} />
                <div className="min-w-0">
                  <div
                    className={`text-[13.5px] leading-[1.35] ${
                      t.done ? "text-faint line-through" : ""
                    }`}
                  >
                    {t.title}
                  </div>
                  {t.overdue && t.due && (
                    <Mono className="mt-[5px] block text-[9px] text-wait-ink">
                      OVERDUE · DUE {shortDate(t.due)}
                    </Mono>
                  )}
                </div>
                <LaneTag label={lane.label} ink={lane.ink} tint={lane.tint} />
              </CardOpener>
            );
          })}
        </div>
      )}
    </div>
  );
}
