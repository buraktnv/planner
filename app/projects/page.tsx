import Link from "next/link";
import { loadWorkspace } from "@/lib/view/workspace";
import { isQuiet, relativeLabel } from "@/lib/ui/momentum";
import { Mono, Ring } from "@/components/momentum/primitives";
import NewButton from "@/components/momentum/new-button";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const ws = await loadWorkspace();

  return (
    <div className="mx-auto max-w-[880px] px-9 pt-[52px] pb-20">
      <div className="mb-[26px] flex items-center gap-3.5">
        <h1 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Projects</h1>
        <div className="flex-1" />
        <NewButton kind="project">New project</NewButton>
      </div>

      {ws.projects.length === 0 ? (
        <p className="m-0 text-[13.5px] text-dim">
          No projects yet. Create one and give it a reason.
        </p>
      ) : (
        <div className="grid gap-[11px] grid-cols-[repeat(auto-fit,minmax(330px,1fr))]">
          {ws.projects.map((p) => {
            const quiet = isQuiet(p.status);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="relative min-w-0 cursor-pointer overflow-hidden rounded-[20px] border border-edge bg-surf p-5 transition-colors hover:border-[var(--hover-edge)]"
                style={{ "--hover-edge": p.color } as React.CSSProperties}
              >
                <div
                  className="absolute top-0 left-0 h-[3px] w-full"
                  style={{ background: p.color }}
                />
                <div className="flex items-center gap-[17px]">
                  <Ring pct={p.pct} size={58} color={p.color} width={13} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-[9px] flex flex-wrap items-baseline gap-[9px]">
                      <span className="text-[17px] font-semibold tracking-[-0.02em]">
                        {p.name}
                      </span>
                      <Mono
                        className="rounded-md px-[7px] py-[3px] text-[9px] tracking-[0.1em]"
                        style={{
                          color: quiet ? "var(--color-dim)" : "#ffffff",
                          background: quiet ? "var(--color-soft)" : p.color,
                        }}
                      >
                        {p.statusLabel}
                      </Mono>
                    </div>
                    <div className="flex gap-3.5 font-mono text-[10.5px] text-faint">
                      <span className="text-ink">{p.pct}%</span>
                      <span>{p.open} OPEN</span>
                      <span>{p.lastActivity ? relativeLabel(p.lastActivity) : "—"}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
