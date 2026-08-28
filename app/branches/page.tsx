import { loadWorkspace } from "@/lib/view/workspace";
import BranchesView, { type BranchProject } from "@/components/momentum/branches/branches-view";
import { targetsOf } from "@/lib/view/targets";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const ws = await loadWorkspace();
  const projects: BranchProject[] = ws.projects.map((p) => ({
    slug: p.id,
    name: p.name,
    color: p.color,
    tint: p.tint,
    targets: targetsOf(p.mvpScope),
    cards: p.cards,
  }));

  return (
    <div className="mx-auto max-w-[820px] px-9 pt-[52px] pb-[90px]">
      <BranchesView projects={projects} />
    </div>
  );
}
