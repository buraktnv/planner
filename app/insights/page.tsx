import { getInsights } from "@/lib/core/insights";
import WeeklyChart from "@/components/insights/weekly-chart";
import PerProjectTable from "@/components/insights/per-project-table";
import StalledList from "@/components/insights/stalled-list";
import BalanceBar from "@/components/insights/balance-bar";
import WeeklyAnalysis from "@/components/insights/weekly-analysis";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const insights = await getInsights();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-100">Insights</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Progress over time and where attention is needed.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Done vs created — last 8 weeks
        </h2>
        <WeeklyChart weeks={insights.weeks} />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Tasks done (last 30 days)
          </h2>
          <BalanceBar balance={insights.balance} />
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Stalled (no activity &gt; 14 days)
          </h2>
          <StalledList rows={insights.stalled} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Per project / area
        </h2>
        <PerProjectTable rows={insights.perProject} />
      </section>

      <section className="space-y-3">
        <WeeklyAnalysis />
      </section>
    </div>
  );
}
