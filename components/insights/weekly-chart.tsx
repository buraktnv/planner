"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Insights } from "@/lib/core/insights";

function label(weekStart: string): string {
  const [, m, d] = weekStart.split("-");
  return `${m}/${d}`;
}

export default function WeeklyChart({ weeks }: { weeks: Insights["weeks"] }) {
  const data = weeks.map((w) => ({ week: label(w.weekStart), done: w.done, created: w.created }));
  return (
    <div className="h-64 w-full rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
          <XAxis dataKey="week" tick={{ fill: "#737373", fontSize: 11 }} />
          <YAxis tick={{ fill: "#737373", fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: "#171717",
              border: "1px solid #262626",
              borderRadius: 8,
              color: "#e5e5e5",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="created" name="Created" fill="#38bdf8" radius={[3, 3, 0, 0]} />
          <Bar dataKey="done" name="Done" fill="#34d399" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
