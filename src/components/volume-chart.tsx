"use client";

import {
  BarChart,
  Bar,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { fmt } from "@/lib/format";

export function VolumeChart({
  data,
  seriesLabel = "Volume",
}: {
  data: Array<{ label: string; volume: number }>;
  seriesLabel?: string;
}) {
  return (
    <div className="w-full min-w-0">
      {/* Explicit height: a 100%-height measure can collapse to 0 inside
          streaming/deferred layouts, which blanks the chart. */}
      <ResponsiveContainer width="100%" height={176}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke="#e7e5e4" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#78716c", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#e7e5e4" }}
            interval="preserveStartEnd"
          />
          <YAxis hide />
          <Tooltip
            cursor={{ fill: "#f5f4f0" }}
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #d6d3d1",
              borderRadius: 8,
              fontSize: 13,
              color: "#292524",
            }}
            formatter={(v) => [fmt(Number(v), "kg"), seriesLabel]}
          />
          <Bar dataKey="volume" fill="#57534e" radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
