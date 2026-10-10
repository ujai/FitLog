"use client";

import { btnPrimaryCls, inputCls } from "@/components/controls";
import { GOAL_METRICS, type MetricGoal } from "@/lib/goal-metrics";
import { metricLabel } from "@/lib/metrics";
import { Spinner } from "@/components/spinner";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMetricGoals } from "@/server/goals";

/**
 * A target is what lets a change be scored: with one, a fall or rise can show
 * as on-track or off-track; without one the app only reports what moved.
 * Leaving a field empty means "no target" and clears it.
 */
export function GoalsForm({ goals }: { goals: Record<string, MetricGoal> }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      GOAL_METRICS.map((m) => {
        const goal = goals[m.key];
        return [m.key, goal ? String(goal.target) : ""];
      }),
    ),
  );

  function setDraft(metric: string, value: string) {
    setSaved(false);
    setDrafts((d) => ({ ...d, [metric]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const entries = GOAL_METRICS.map((m) => {
      const raw = (drafts[m.key] ?? "").trim();
      return { metric: m.key, target: raw === "" ? null : Number(raw) };
    });
    if (entries.some((entry) => entry.target !== null && !Number.isFinite(entry.target))) {
      setError("Every target has to be a number");
      return;
    }

    startSave(async () => {
      const result = await saveMetricGoals(entries);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save your targets. Try again in a moment.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-stone-200 bg-white/70 p-5">
      <div>
        <h2 className="font-medium">My targets</h2>
        <p className="mt-1 text-sm text-stone-600">
          Optional. A target turns a change into a judgement — until then the app only tells you
          what moved, not whether it is good. Leave a field empty for no target.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {GOAL_METRICS.map((m) => {
          const id = `goal-${m.key}`;
          const goal = goals[m.key];
          return (
            <div key={m.key}>
              <label htmlFor={id} className="mb-1 block text-xs font-medium text-stone-600">
                {metricLabel(m)}
              </label>
              <input
                id={id}
                type="number"
                step="any"
                inputMode="decimal"
                value={drafts[m.key] ?? ""}
                onChange={(e) => setDraft(m.key, e.target.value)}
                placeholder="no target"
                className={inputCls}
              />
              {goal && (
                <p className="mt-1 text-xs text-stone-600">
                  {goal.direction === "down"
                    ? "Aiming lower"
                    : goal.direction === "up"
                      ? "Aiming higher"
                      : "Direction not set yet — save again to work it out"}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Targets saved ✓
        </p>
      )}

      <button type="submit" disabled={saving} className={btnPrimaryCls}>
        {saving ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Saving…
          </span>
        ) : (
          "Save targets"
        )}
      </button>
    </form>
  );
}
