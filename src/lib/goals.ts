import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  measurementListColumns,
  measurements,
  metricGoals,
  scanListColumns,
  scans,
} from "@/db/schema";
import type { GoalDirection } from "@/lib/goal-metrics";

/**
 * Data access for a person's per-metric targets. Server-only (it reaches the
 * database), which is why the metric catalogue lives separately in
 * `src/lib/goal-metrics.ts` for client components to import.
 */

type Goal = {
  target: number;
  /** null when the direction is unknown; never a value the DB can't be trusted with */
  direction: GoalDirection | null;
};

/** Only the two values the scorer understands — anything else reads as unknown. */
function asDirection(value: string | null): GoalDirection | null {
  return value === "up" || value === "down" ? value : null;
}

/**
 * A person's targets keyed by metric, e.g. `{ bodyFatPct: { target: 18, direction: "down" } }`.
 * Empty when none are set — and an absent key is what keeps a delta unscored.
 *
 * `direction` is a plain text column, so it is narrowed here rather than cast:
 * an unexpected value must not be able to invert a verdict.
 */
export async function getMetricGoals(userId: string): Promise<Record<string, Goal>> {
  const rows = await db
    .select({
      metric: metricGoals.metric,
      target: metricGoals.target,
      direction: metricGoals.direction,
    })
    .from(metricGoals)
    .where(eq(metricGoals.userId, userId));

  return Object.fromEntries(
    rows.map((r) => [r.metric, { target: r.target, direction: asDirection(r.direction) }]),
  );
}

/**
 * How far back to look for a metric's most recent reading. Scans arrive monthly
 * at most, so 25 rows is roughly two years of history; a metric missing from
 * every one of them has never been recorded.
 */
const READING_LOOKBACK = 25;

/**
 * The most recent reading of each requested metric, so a newly set target can
 * work out which way it points.
 *
 * Deliberately per metric and not per row: taking the newest scan whole would
 * treat a metric that happens to be null on that scan as never measured, and
 * store an unknown direction for good. Tape measurements contribute the metrics
 * they carry (weight and waist), and the newest of the two sources wins.
 */
export async function getLatestMetricValues(
  userId: string,
  metrics: readonly string[],
): Promise<Record<string, number>> {
  const wanted = new Set(metrics);
  if (wanted.size === 0) return {};

  const [scanRows, measurementRows] = await Promise.all([
    db
      .select(scanListColumns)
      .from(scans)
      .where(eq(scans.userId, userId))
      .orderBy(desc(scans.scannedAt))
      .limit(READING_LOOKBACK),
    db
      .select(measurementListColumns)
      .from(measurements)
      .where(eq(measurements.userId, userId))
      .orderBy(desc(measurements.measuredAt))
      .limit(READING_LOOKBACK),
  ]);

  // Every (metric, instant) pair either source can offer for the metrics asked
  // about, newest first once sorted.
  const readings: Record<string, Array<{ at: number; value: number }>> = {};
  const add = (metric: string, at: number, value: unknown) => {
    if (!wanted.has(metric) || typeof value !== "number") return;
    (readings[metric] ??= []).push({ at, value });
  };

  for (const row of scanRows) {
    for (const [key, value] of Object.entries(row)) add(key, row.scannedAt.getTime(), value);
  }
  for (const row of measurementRows) {
    add("weightKg", row.measuredAt.getTime(), row.weightKg);
    add("waistCm", row.measuredAt.getTime(), row.waistCm);
  }

  return Object.fromEntries(
    Object.entries(readings).map(([metric, list]) => [
      metric,
      list.reduce((newest, r) => (r.at > newest.at ? r : newest)).value,
    ]),
  );
}
