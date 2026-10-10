"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { metric, type MetricKey } from "@/lib/metrics";
import type { MetricGoal } from "@/lib/goal-metrics";
import { choiceCls, choiceOffCls, choiceOnCls } from "@/components/controls";
import { Sparklines, type SparklinePoint, type SparklineSeries } from "@/components/sparkline";

type TrendPoint = { date: string } & Partial<Record<MetricKey, number | null>>;

// DESIGN.md chart scheme: stone-600 for neutral metrics, amber-600 for
// "lower is better" metrics — never random hues.
const colorFor = (lowerBetter?: boolean) => (lowerBetter ? "#d97706" : "#57534e");

/** Related metrics shown one group at a time, so the section stays scannable. */
const GROUPS: Array<{ id: string; label: string; keys: MetricKey[] }> = [
  { id: "composition", label: "Composition", keys: ["weightKg", "bodyFatPct", "bodyFatMassKg", "subcutaneousFatMassKg", "bwiScore"] },
  { id: "visceral", label: "Visceral fat", keys: ["visceralFatMassKg", "visceralFatAreaCm2", "visceralFatLevel"] },
  { id: "muscle", label: "Muscle", keys: ["leanBodyMassKg", "skeletalMuscleMassKg", "proteinKg", "mineralKg"] },
  { id: "fluids", label: "Fluids", keys: ["totalBodyWaterKg", "icfKg", "ecfKg"] },
  { id: "energy", label: "Energy & age", keys: ["bmr", "teeKcal", "bioAge"] },
  { id: "girths", label: "Girths", keys: ["abdominalCircumferenceCm", "waistToHipRatio"] },
];

export function TrendChart({ data, goals }: { data: TrendPoint[]; goals?: Record<string, MetricGoal> }) {
  const [groupId, setGroupId] = useState(GROUPS[0].id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /** WAI-ARIA tabs keyboard model: arrows move focus and selection, Home/End jump. */
  function onTabKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = GROUPS.findIndex((g) => g.id === groupId);
    let next = -1;
    if (e.key === "ArrowRight") next = (current + 1) % GROUPS.length;
    else if (e.key === "ArrowLeft") next = (current - 1 + GROUPS.length) % GROUPS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = GROUPS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setGroupId(GROUPS[next].id);
    tabRefs.current[next]?.focus();
  }

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-stone-600">Add a scan to see trends.</p>
    );
  }
  if (data.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-stone-600">
        Add at least two scans to see trends.
      </p>
    );
  }

  const group = GROUPS.find((g) => g.id === groupId) ?? GROUPS[0];

  const series: SparklineSeries[] = group.keys
    .map((key) => {
      const m = metric(key);
      return {
        key,
        label: m.label,
        unit: m.unit,
        color: colorFor(m.lowerBetter),
        pad: m.pad,
        hint: m.hint,
      };
    })
    .filter((s) => data.some((d) => typeof d[s.key] === "number" && Number.isFinite(d[s.key] as number)));

  return (
    <div>
      <div
        className="mb-4 flex flex-wrap gap-1.5"
        role="tablist"
        aria-label="Metric groups"
        onKeyDown={onTabKeyDown}
      >
        {GROUPS.map((g, i) => {
          const active = g.id === group.id;
          return (
            <button
              key={g.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`trend-tab-${g.id}`}
              aria-selected={active}
              aria-controls="trend-panel"
              tabIndex={active ? 0 : -1}
              onClick={() => setGroupId(g.id)}
              className={`${choiceCls} px-3.5 text-xs ${
                active ? choiceOnCls : choiceOffCls
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>
      <div
        id="trend-panel"
        role="tabpanel"
        aria-labelledby={`trend-tab-${group.id}`}
        tabIndex={0}
        className="focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:outline-none"
      >
        {series.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-600">
            No {group.label.toLowerCase()} data yet — it will appear here once a scan records it.
          </p>
        ) : (
          <Sparklines data={data as SparklinePoint[]} series={series} goals={goals} />
        )}
      </div>
    </div>
  );
}
