import { getDaily } from "@/lib/core/daily";
import { buildDaily } from "@/lib/view/daily";
import DailyView from "@/components/momentum/daily/daily-view";

export const dynamic = "force-dynamic";

export default async function DailyPage() {
  const data = await getDaily();
  return <DailyView model={buildDaily(data)} />;
}
