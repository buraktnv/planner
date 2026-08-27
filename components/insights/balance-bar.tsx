"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { Insights } from "@/lib/core/insights";

export default function BalanceBar({ balance }: { balance: Insights["balance"] }) {
  const data = [
    { name: "Projects", value: balance.projects, fill: "#38bdf8" },
    { name: "Areas", value: balance.areas, fill: "#a78bfa" },
  ];
  return (
    <div className="h-48 w-full rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#737373", fontSize: 11 }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "#d4d4d4", fontSize: 12 }}
            width={64}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={28}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              fill="#e5e5e5"
              fontSize={12}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
