import { loadWorkspace } from "@/lib/view/workspace";
import BranchesView, {
  type BranchProject,
  type BranchTarget,
} from "@/components/momentum/branches/branches-view";

export const dynamic = "force-dynamic";

function parseTarget(line: string): BranchTarget | null {
  let rest = line.trim();
  if (!rest) return null;
  let done = false;
  const marker = /^-\s*\[( |x|X)\]\s*/.exec(rest);
  if (marker) {
    done = marker[1].toLowerCase() === "x";
    rest = rest.slice(marker[0].length);
  } else if (rest.startsWith("- ")) {
    rest = rest.slice(2);
  }
  let by: string | null = null;
  const byMatch = /\s*—\s*by\s+(.+)$/i.exec(rest);
  if (byMatch) {
    by = byMatch[1].trim();
    rest = rest.slice(0, byMatch.index);
  }
  const title = rest.trim();
  if (!title) return null;
  return { title, by, done };
}

export default async function BranchesPage() {
  const ws = await loadWorkspace();
  const projects: BranchProject[] = ws.projects.map((p) => ({
    slug: p.id,
    name: p.name,
    color: p.color,
    tint: p.tint,
    targets: p.mvpScope
      .map(parseTarget)
      .filter((t): t is BranchTarget => t !== null),
    cards: p.cards,
  }));

  return (
    <div className="mx-auto max-w-[820px] px-9 pt-[52px] pb-[90px]">
      <BranchesView projects={projects} />
    </div>
  );
}
