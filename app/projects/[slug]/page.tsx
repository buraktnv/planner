import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCharterModel } from "@/lib/view/workspace";
import { listNotes } from "@/lib/core/knowledge";
import { isQuiet, LANES, LANE_KEYS, shortDate } from "@/lib/ui/momentum";
import { Bar, Mono, Ring } from "@/components/momentum/primitives";
import CardOpener from "@/components/momentum/card-opener";
import NewButton from "@/components/momentum/new-button";
import ArchiveButton from "@/components/momentum/archive-button";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const charter = await loadCharterModel("project", slug);
  if (!charter) notFound();

  const notes = await listNotes();
  const docCount = notes.filter((n) => n.scope.includes(charter.id)).length;

  const quiet = isQuiet(charter.status);
  const scopeKey = `project/${charter.id}`;
  const open = charter.cards.filter((c) => !c.done);
  const doneCards = charter.cards
    .filter((c) => c.done)
    .sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""));

  return (
    <div className="px-[30px] pt-[34px] pb-[60px]">
      <div className="mb-3.5 flex items-center gap-3">
        <Link
          href="/projects"
          className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          ← PROJECTS
        </Link>
        <div className="flex-1" />
        <Link
          href={`/projects/${charter.id}/docs`}
          className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          DOCS · {docCount}
        </Link>
        <Link
          href={`/canvas/project/${charter.id}/system`}
          className="font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink"
        >
          SYSTEM
        </Link>
        <NewButton kind="target" prefill={{ scopeKey }} variant="mono">
          + TARGET
        </NewButton>
        <NewButton kind="branch" prefill={{ scopeKey }} variant="mono">
          + BRANCH
        </NewButton>
        <ArchiveButton type="project" slug={charter.id} name={charter.name} />
      </div>

      <div className="relative mb-3 overflow-hidden rounded-[20px] border border-edge bg-surf px-[22px] py-5">
        <div className="absolute top-0 left-0 h-[3px] w-full" style={{ background: charter.color }} />
        <div className="grid grid-cols-[1fr_auto] items-center gap-6">
          <div>
            <div className="mb-3 flex flex-wrap items-baseline gap-2.5">
              <h1 className="m-0 text-[23px] font-semibold tracking-[-0.03em]">{charter.name}</h1>
              <Mono
                className="rounded-md px-2 py-[3px] text-[9px] tracking-[0.1em]"
                style={{
                  color: quiet ? "var(--color-dim)" : "#ffffff",
                  background: quiet ? "var(--color-soft)" : charter.color,
                }}
              >
                {charter.statusLabel}
              </Mono>
              <Mono className="rounded-md border border-edge px-2 py-[3px] text-[9px] tracking-[0.1em] text-dim">
                {charter.priorityLabel}
              </Mono>
            </div>
            {charter.next ? (
              <div
                className="flex items-center gap-2.5 pl-[13px]"
                style={{ borderLeft: `2px solid ${charter.color}` }}
              >
                <Mono className="text-[9px] tracking-[0.12em] text-faint">NEXT</Mono>
                <span className="text-sm font-medium tracking-[-0.01em]">
                  {charter.next.title}
                </span>
              </div>
            ) : (
              <div
                className="flex items-center gap-2.5 pl-[13px]"
                style={{ borderLeft: `2px solid ${charter.color}` }}
              >
                <Mono className="text-[9px] tracking-[0.12em] text-faint">NEXT</Mono>
                <span className="text-sm text-dim">Nothing open. Add the first task.</span>
              </div>
            )}
          </div>
          <div className="text-center">
            <Ring pct={charter.pct} size={76} color={charter.color} width={12} />
            <Mono className="mt-[5px] block text-[10px] text-dim">{charter.pct}%</Mono>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-[11px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        {LANE_KEYS.map((k) => {
          const meta = LANES[k];
          const cards = open.filter((c) => c.lane === k);
          return (
            <div
              key={k}
              className="min-w-0 rounded-[18px] border border-edge2 p-3.5"
              style={{ background: meta.tint }}
            >
              <div className="mb-[13px] flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                <span
                  className={`text-[12.5px] font-semibold ${k === "some" ? "text-dim" : "text-ink"}`}
                >
                  {meta.label}
                </span>
                <Mono className="text-[10px] text-faint">{cards.length}</Mono>
              </div>
              {cards.length === 0 ? (
                <div className="px-0.5 py-1.5 text-[12.5px] text-faint">Nothing here yet.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {cards.map((card) => (
                    <CardOpener
                      key={card.key}
                      card={card}
                      className="w-full rounded-[12px] border border-edge bg-surf p-3 transition-colors hover:border-faint"
                    >
                      <div className="mb-2 flex items-center gap-[7px]">
                        <Mono className="text-[9px] text-faint">{card.id}</Mono>
                        {card.subTotal > 0 && (
                          <Mono className="text-[9px] text-faint">
                            {card.subDone}/{card.subTotal}
                          </Mono>
                        )}
                      </div>
                      <div className="mb-[11px] text-[13.5px] font-medium leading-[1.35]">
                        {card.title}
                      </div>
                      <Bar pct={card.pct} color={card.color} height={4} />
                    </CardOpener>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {doneCards.length > 0 && (
        <details className="mt-[18px] rounded-[18px] border border-edge2 px-3.5 py-3">
          <summary className="cursor-pointer list-none font-mono text-[10px] tracking-[0.12em] text-faint transition-colors hover:text-ink">
            DONE · {doneCards.length}
          </summary>
          <div className="mt-3 flex flex-col">
            {doneCards.map((card) => (
              <CardOpener
                key={card.key}
                card={card}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-edge2 py-2.5 text-left"
              >
                <Mono className="text-[9px] text-faint">{card.id}</Mono>
                <span className="truncate text-[13px] text-faint line-through">{card.title}</span>
                <Mono className="text-[9px] text-faint">
                  {card.doneDate ? shortDate(card.doneDate) : ""}
                </Mono>
              </CardOpener>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
