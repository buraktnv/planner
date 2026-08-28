import { loadWorkspace } from "@/lib/view/workspace";
import BoardView from "@/components/momentum/board/board-view";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const ws = await loadWorkspace();
  const cards = ws.cards.filter((c) => !c.done && c.section !== "done");
  const filters = [
    { key: "all", label: "All", dot: "linear-gradient(90deg,#63b894,#7d95dd)" },
    ...ws.charters
      .filter((c) => c.cards.some((t) => !t.done))
      .map((c) => ({ key: `${c.type}/${c.id}`, label: c.name, dot: c.color })),
  ];
  return <BoardView cards={cards} filters={filters} />;
}
