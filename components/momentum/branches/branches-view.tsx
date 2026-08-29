"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CardModel } from "@/lib/view/workspace";
import { LANES } from "@/lib/ui/momentum";
import { Bar, Mono, Ring, Tick } from "@/components/momentum/primitives";
import NewButton from "@/components/momentum/new-button";
import TaskIdLink from "@/components/momentum/task-id";

export interface BranchTarget {
  title: string;
  by: string | null;
  done: boolean;
}

export interface BranchProject {
  slug: string;
  name: string;
  color: string;
  tint: string;
  targets: BranchTarget[];
  cards: CardModel[];
}

type View = "trunk" | "flow" | "map";

const VIEWS: { key: View; label: string }[] = [
  { key: "trunk", label: "Trunk" },
  { key: "flow", label: "Flow" },
  { key: "map", label: "Map" },
];

function useLeafToggle() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const toggle = async (card: CardModel, subId: string, next: boolean) => {
    if (pending) return;
    setPending(subId);
    try {
      const base = card.type === "project" ? "/api/projects" : "/api/areas";
      await fetch(`${base}/${card.slug}/tasks`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: subId, complete: next }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  };
  return { toggle, pending };
}

function TrunkView({ cards }: { cards: CardModel[] }) {
  const { toggle, pending } = useLeafToggle();
  return (
    <div>
      {cards.map((card, i) => {
        const meta = LANES[card.lane];
        const finished = card.pct === 100;
        const last = i === cards.length - 1;
        return (
          <div key={card.key} className="grid grid-cols-[30px_1fr] items-stretch gap-0">
            <div className="relative flex justify-center">
              <div className="w-[2px] bg-edge" style={{ height: last ? 26 : "100%" }} />
              <div
                className="absolute top-[22px] grid h-[15px] w-[15px] place-items-center rounded-full border-[2.5px]"
                style={{
                  borderColor: meta.color,
                  background: finished ? meta.color : "var(--color-surf)",
                }}
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ opacity: finished ? 1 : 0 }}
                  aria-hidden
                >
                  <path d="M4.5 12.5l5 5 10-11" />
                </svg>
              </div>
            </div>

            <div className="py-3.5 pl-4">
              <div className="rounded-[16px] border border-edge bg-surf px-[18px] py-4">
                <div className="mb-3 flex flex-wrap items-center gap-[9px]">
                  <TaskIdLink
                    type={card.type}
                    slug={card.slug}
                    id={card.id}
                    from="/branches"
                    className="text-[10px] text-faint"
                  />
                  <span className="text-[15px] font-semibold tracking-[-0.02em]">
                    {card.title}
                  </span>
                  <div className="flex-1" />
                  <Mono
                    className="rounded-md px-2 py-[3px] text-[9px] tracking-[0.08em]"
                    style={{ color: meta.ink, background: meta.tint }}
                  >
                    {meta.label.toUpperCase()}
                  </Mono>
                </div>

                <div className="mb-3.5 flex items-center gap-3">
                  <div className="flex-1">
                    <Bar pct={card.pct} color={meta.color} height={6} />
                  </div>
                  <Mono className="text-[10px] text-dim">{card.pct}%</Mono>
                </div>

                {(card.blocked || card.lane === "wait") && (
                  <div className="mb-3.5 flex items-center gap-2 rounded-[9px] bg-wait-tint px-[11px] py-[7px]">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#a06f2c"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <path d="M5 12h14M14 7l5 5-5 5" />
                    </svg>
                    <span className="text-[11.5px] text-wait-ink">
                      {card.waitsOn
                        ? `waits on ${card.blockedByTitle ?? card.waitsOn}`
                        : "waiting on something outside this project"}
                    </span>
                  </div>
                )}

                {card.subs.length === 0 ? (
                  <div className="py-1 text-[12.5px] text-faint">
                    No leaves yet. Split this into steps.
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {card.subs.map((s) => (
                      <div
                        key={s.id}
                        className="grid grid-cols-[14px_15px_50px_1fr] items-center gap-[9px] py-2"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          stroke="var(--color-edge)"
                          strokeWidth="1.6"
                          aria-hidden
                        >
                          <path d="M2 0v7a3 3 0 003 3h9" />
                        </svg>
                        <button
                          type="button"
                          disabled={pending !== null}
                          aria-label={s.done ? `Reopen ${s.id}` : `Complete ${s.id}`}
                          onClick={() => toggle(card, s.id, !s.done)}
                          className="disabled:opacity-60"
                        >
                          <Tick done={s.done} color={meta.color} size={14} />
                        </button>
                        <TaskIdLink
                          type={card.type}
                          slug={card.slug}
                          id={s.id}
                          from="/branches"
                          className="text-[9px] text-faint"
                        />
                        <button
                          type="button"
                          disabled={pending !== null}
                          onClick={() => toggle(card, s.id, !s.done)}
                          className="text-left disabled:opacity-60"
                        >
                          <span
                            className={`text-[13px] ${
                              s.done ? "text-faint line-through" : "text-ink"
                            }`}
                          >
                            {s.title}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FlowView({ cards }: { cards: CardModel[] }) {
  const { toggle, pending } = useLeafToggle();
  return (
    <div className="flex flex-col gap-3">
      {cards.map((card) => {
        const meta = LANES[card.lane];
        return (
          <div
            key={card.key}
            className="grid grid-cols-1 items-center gap-y-3.5 rounded-[18px] border border-edge bg-surf p-4 md:grid-cols-[minmax(0,230px)_34px_minmax(0,1fr)] md:gap-y-0"
          >
            <div className="pl-[13px]" style={{ borderLeft: `3px solid ${meta.color}` }}>
              <div className="mb-1.5">
                <TaskIdLink
                  type={card.type}
                  slug={card.slug}
                  id={card.id}
                  from="/branches"
                />
              </div>
              <div className="mb-2.5 text-[14.5px] font-semibold leading-[1.3] tracking-[-0.02em]">
                {card.title}
              </div>
              <div className="flex items-center gap-[9px]">
                <Mono
                  className="rounded-[5px] px-[7px] py-[3px] text-[8.5px] tracking-[0.08em]"
                  style={{ color: meta.ink, background: meta.tint }}
                >
                  {meta.label.toUpperCase()}
                </Mono>
                <Mono className="text-[9.5px] text-dim">{card.pct}%</Mono>
              </div>
              {(card.blocked || card.lane === "wait") && (
                <Mono className="mt-[9px] block text-[9px] text-wait-ink">
                  {card.waitsOn
                    ? `WAITS ON ${card.waitsOn.toUpperCase()}`
                    : "WAITING ON SOMETHING EXTERNAL"}
                </Mono>
              )}
            </div>

            <svg
              width="34"
              height="90"
              viewBox="0 0 34 90"
              fill="none"
              className="hidden overflow-visible md:block"
              aria-hidden
            >
              <path d="M0 45h12M12 45v-30M12 45v30" stroke="var(--color-edge)" strokeWidth="1.6" />
              <path d="M12 15h10M12 45h10M12 75h10" stroke="var(--color-edge)" strokeWidth="1.6" />
            </svg>

            {card.subs.length === 0 ? (
              <div className="min-w-0 text-[12.5px] text-faint">No leaves yet.</div>
            ) : (
              <div className="grid min-w-0 gap-2 grid-cols-[repeat(auto-fill,minmax(128px,1fr))]">
                {card.subs.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={pending !== null}
                    onClick={() => toggle(card, s.id, !s.done)}
                    className="flex items-center gap-[9px] rounded-[11px] border border-edge2 bg-bg px-3 py-2.5 text-left transition-colors hover:border-faint disabled:opacity-60"
                  >
                    <span
                      className="h-[11px] w-[11px] shrink-0 rounded-full border-2"
                      style={{
                        borderColor: meta.color,
                        background: s.done ? meta.color : "var(--color-surf)",
                      }}
                    />
                    <span
                      className={`text-[12.5px] leading-[1.3] ${
                        s.done ? "text-faint line-through" : "text-ink"
                      }`}
                    >
                      {s.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MapView({ project, cards }: { project: BranchProject; cards: CardModel[] }) {
  const size = 520;
  const R = size * 0.34;
  const bubbleBase = 74;
  const total = Math.max(cards.length, 1);

  const nodes = cards.map((card, i) => {
    const meta = LANES[card.lane];
    const ang = ((-90 + i * (360 / total)) * Math.PI) / 180;
    const cx = size / 2 + R * Math.cos(ang);
    const cy = size / 2 + R * Math.sin(ang);
    const fs = 11.5;
    const cpl = 15;
    const lines = Math.min(2, Math.max(1, Math.ceil(card.title.length / cpl)));
    const needH = lines * (fs * 1.25) + 26;
    const diameter = Math.max(bubbleBase + card.subs.length * 4, Math.ceil(needH / 0.66));
    return { card, meta, cx, cy, diameter, fs, titleMax: lines * fs * 1.3 };
  });

  return (
    <div className="flex justify-center overflow-x-auto rounded-[20px] border border-edge bg-surf p-3.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0"
          aria-hidden
        >
          {nodes.map((n) => (
            <line
              key={n.card.key}
              x1={size / 2}
              y1={size / 2}
              x2={n.cx}
              y2={n.cy}
              stroke="var(--color-edge)"
              strokeWidth="2"
              strokeDasharray={n.card.blocked || n.card.lane === "wait" ? "5 5" : "0"}
            />
          ))}
        </svg>

        <div
          className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 p-3 text-center"
          style={{
            left: size / 2,
            top: size / 2,
            width: 118,
            height: 118,
            background: project.tint,
            borderColor: project.color,
          }}
        >
          <div>
            <div className="text-[13.5px] font-semibold leading-[1.25] tracking-[-0.02em]">
              {project.name}
            </div>
            <Mono className="mt-[5px] block text-[9px] text-dim">
              {cards.length} branches
            </Mono>
          </div>
        </div>

        {nodes.map((n) => {
          const done = n.card.subs.filter((s) => s.done).length;
          return (
            <div
              key={n.card.key}
              className="absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 p-3 text-center"
              style={{
                left: n.cx,
                top: n.cy,
                width: n.diameter,
                height: n.diameter,
                background: n.meta.tint,
                borderColor: n.card.blocked ? "#a06f2c" : n.meta.color,
                borderStyle: n.card.blocked ? "dashed" : "solid",
              }}
            >
              <div>
                <div
                  className="overflow-hidden font-semibold leading-[1.25] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                  style={{ fontSize: n.fs, color: n.meta.ink, maxHeight: n.titleMax }}
                >
                  {n.card.title}
                </div>
                <div className="mt-[7px] flex justify-center gap-[3px]">
                  {n.card.subs.map((s) => (
                    <span
                      key={s.id}
                      className="h-[5px] w-[5px] rounded-full"
                      style={{ background: s.done ? n.meta.color : "var(--color-edge)" }}
                    />
                  ))}
                </div>
                <Mono className="mt-[5px] block text-[8.5px] text-dim">
                  {done}/{n.card.subs.length}
                </Mono>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BranchesView({
  projects,
  initialSlug,
}: {
  projects: BranchProject[];
  initialSlug?: string;
}) {
  const [slug, setSlug] = useState(initialSlug ?? projects[0]?.slug ?? "");
  const [view, setView] = useState<View>("trunk");

  const project = projects.find((p) => p.slug === slug) ?? projects[0];
  if (!project) {
    return (
      <p className="m-0 text-[13.5px] text-dim">
        No projects yet. Create one and the tree grows from there.
      </p>
    );
  }

  const cards = project.cards.filter((c) => !c.done);
  const leafCount = cards.reduce((a, c) => a + c.subs.length, 0);
  const scopeKey = `project/${project.slug}`;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <h1 className="m-0 mr-3 text-2xl font-semibold tracking-[-0.03em]">Branches</h1>
        {projects.map((p) => {
          const on = p.slug === project.slug;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => setSlug(p.slug)}
              className={`inline-flex items-center gap-[7px] rounded-[10px] border px-[11px] py-1.5 text-[12px] ${
                on ? "border-faint bg-surf text-ink" : "border-edge text-dim"
              }`}
            >
              <span className="inline-block h-[7px] w-[7px] rounded-[2px]" style={{ background: p.color }} />
              {p.name}
            </button>
          );
        })}
      </div>

      <div
        className="mb-3.5 flex flex-wrap items-center gap-[13px] rounded-[18px] border border-edge px-5 py-4"
        style={{ background: project.tint }}
      >
        <span className="h-[11px] w-[11px] shrink-0 rounded-[4px]" style={{ background: project.color }} />
        <div>
          <div className="text-[17px] font-semibold tracking-[-0.02em]">{project.name}</div>
          <Mono className="mt-1 block text-[10px] text-dim">
            {cards.length} branches · {leafCount} leaves
          </Mono>
        </div>
        <div className="flex-1" />
        <div className="flex gap-[3px] rounded-[11px] bg-[rgba(255,255,255,.6)] p-[3px]">
          {VIEWS.map((v) => {
            const on = view === v.key;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={`rounded-[9px] px-[13px] py-1.5 text-[12px] font-medium ${
                  on ? "bg-surf text-ink shadow-[0_1px_2px_rgba(46,42,38,.08)]" : "text-dim"
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
        <NewButton kind="branch" prefill={{ scopeKey }}>
          Branch
        </NewButton>
      </div>

      {project.targets.length > 0 && (
        <div className="mb-4">
          <div className="mb-[9px] flex items-center gap-2.5">
            <Mono className="text-[9.5px] tracking-[0.16em] text-faint">TARGETS</Mono>
            <div className="h-px flex-1 bg-edge" />
            <NewButton kind="target" prefill={{ scopeKey }} variant="mono">
              + ADD
            </NewButton>
          </div>
          <div className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(230px,1fr))]">
            {project.targets.map((t) => (
              <div
                key={t.title}
                className="flex items-center gap-3.5 rounded-[16px] border border-edge bg-surf p-[15px]"
              >
                <Ring pct={t.done ? 100 : 0} size={46} color={project.color} width={12} />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold leading-[1.3] tracking-[-0.01em]">
                    {t.title}
                  </div>
                  <div className="mt-[7px] flex flex-wrap gap-[9px]">
                    <Mono className="text-[9.5px] text-dim">{t.done ? "DONE" : "OPEN"}</Mono>
                    {t.by && <Mono className="text-[9.5px] text-faint">BY {t.by.toUpperCase()}</Mono>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="m-0 text-[13.5px] text-dim">No branches yet. Add the first task.</p>
      ) : view === "trunk" ? (
        <TrunkView cards={cards} />
      ) : view === "flow" ? (
        <FlowView cards={cards} />
      ) : (
        <MapView project={project} cards={cards} />
      )}
    </div>
  );
}
