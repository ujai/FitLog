"use client";

import {
  LineChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fmt, fmtShortDate, metricDelta } from "@/lib/format";
import type { MetricGoal } from "@/lib/goal-metrics";
import { deltaToneCls } from "@/components/controls";

export type SparklinePoint = { date: string } & {
  [metric: string]: string | number | null | undefined;
};

export type SparklineSeries = {
  key: string;
  label: string;
  unit: string;
  color: string;
  /** one unit of vertical padding around the data range */
  pad?: number;
  /** plain-language gloss for jargon metrics (BWI, ICF/ECF, TEE) */
  hint?: string;
};

/**
 * Row of labelled mini trend lines — the shared core behind the scan TrendChart
 * and the measurement chart. Values come pre-sorted oldest to newest.
 */
export function Sparklines({
  data,
  series,
  goals,
}: {
  data: SparklinePoint[];
  series: SparklineSeries[];
  /** per-metric targets keyed by metric: draws a reference line and scores the delta */
  goals?: Record<string, MetricGoal>;
}) {
  const from = fmtShortDate(data[0].date);
  const to = fmtShortDate(data[data.length - 1].date);

  return (
    <div className="grid gap-x-6 gap-y-8 sm:grid-cols-3">
      {series.map((s) => {
        const values = data
          .map((d) => d[s.key])
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        if (values.length === 0) return null;
        const pad = s.pad ?? 1;
        const latest = values[values.length - 1];
        const previous = values[values.length - 2];
        const target = goals?.[s.key];
        const delta = metricDelta(latest, previous, target);
        return (
          <div key={s.key}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-medium text-stone-600">{s.label}</h3>
              <p className="text-lg font-semibold tabular-nums">
                {fmt(latest, s.unit)}
                {delta.text && (
                  <span className={`ml-1.5 text-xs font-normal tabular-nums ${deltaToneCls(delta.tone)}`}>
                    {delta.arrow ? `${delta.arrow} ` : ""}
                    {delta.text}{s.unit ? ` ${s.unit}` : ""}
                  </span>
                )}
              </p>
            </div>
            {s.hint && <p className="mt-0.5 text-xs leading-tight text-stone-600">{s.hint}</p>}
            <div className="mt-2 h-20 w-full">
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                  {/* A real time axis, so a six-week gap and a six-month gap no
                      longer draw the same width — the spacing is the trend. */}
                  <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} scale="time" hide />
                  <YAxis
                    hide
                    domain={[
                      (dataMin: number) => dataMin - pad,
                      (dataMax: number) => dataMax + pad,
                    ]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #d6d3d1",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#292524",
                    }}
                    formatter={(v) => [fmt(v as number, s.unit), s.label]}
                    labelFormatter={(label) => fmtShortDate(new Date(label as number))}
                  />
                  {target !== undefined && (
                    <ReferenceLine y={target.target} stroke="#d6d3d1" strokeDasharray="4 4" />
                  )}
                  <Line
                    type="monotone"
                    dataKey={s.key}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-xs text-stone-600 tabular-nums">
              {from} – {to} · {values.length} entries
              {target !== undefined ? ` · target ${fmt(target.target, s.unit)}` : ""}
            </p>
            <span className="sr-only">
              {s.label} trend: latest {fmt(latest, s.unit)}, measured {values.length} times
              between {from} and {to}.
              {target !== undefined ? ` Target ${fmt(target.target, s.unit)}.` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
