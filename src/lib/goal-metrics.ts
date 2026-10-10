/**
 * The target-metric selection, and the direction logic that goes with it.
 *
 * Pure data and pure functions with no database import, so a client component
 * can render the settings form without pulling Postgres into the browser
 * bundle. Metric identity — key, label, unit, hint — lives in
 * `src/lib/metrics.ts`; this module only decides which metrics can be given a
 * target, and on which side of that target counts as done.
 */
import { METRICS, TAPE_METRICS, type Metric, type MetricKey, type TapeMetricKey } from "./metrics.ts";

type AnyMetricKey = MetricKey | TapeMetricKey;

/**
 * Deliberately short: the numbers that lead the app, so the settings card stays
 * a two-minute job. Adding one is a single line — `metricDelta` and the trend
 * charts read any key present in the goals map. `satisfies` makes a key that is
 * not in the catalogue a compile error rather than a silently missing row.
 */
export const GOAL_METRIC_KEYS = [
  "bodyFatPct",
  "weightKg",
  "skeletalMuscleMassKg",
  "visceralFatLevel",
  "bwiScore",
  "bioAge",
  "waistCm",
] as const satisfies readonly AnyMetricKey[];

export type GoalMetric = (typeof GOAL_METRIC_KEYS)[number];

const ANY_METRIC_BY_KEY = new Map<string, Metric>(
  [...METRICS, ...TAPE_METRICS].map((m) => [m.key, m]),
);

/**
 * The same list as catalogue entries, so the form renders the one label the
 * rest of the app uses rather than keeping a second copy. `weightKg` is carried
 * by both tables and either entry reads the same.
 */
export const GOAL_METRICS: readonly Metric[] = GOAL_METRIC_KEYS.map((key) => {
  const found = ANY_METRIC_BY_KEY.get(key);
  if (!found) throw new Error(`Unknown goal metric: ${key}`);
  return found;
});

const GOAL_KEYS = new Set<string>(GOAL_METRIC_KEYS);

export function isGoalMetric(value: string): value is GoalMetric {
  return GOAL_KEYS.has(value);
}

/** Which way to move to reach a target. */
export type GoalDirection = "up" | "down";

/** A target, plus the side of it that counts as achieved (null = unknown). */
export type MetricGoal = { target: number; direction?: GoalDirection | null };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * How far a metric has come since its first reading, toward its target, as a 0–1
 * fraction — what a progress ring fills to. The baseline is the person's own first
 * value, so the display has to say so: anything else would imply a starting point
 * the data does not have.
 *
 * Direction is the goal's, never assumed: "up" means progress raises the value,
 * "down" means it lowers it. With no direction stored — the target was set when
 * there was no reading to infer one from — distance decides, and closer counts as
 * progress.
 *
 * Returns null only when there is nothing to measure: no target. A start already
 * at the target fills the ring, which is the honest reading of having begun there.
 */
export function progressTowardTarget(
  start: number,
  current: number,
  goal: MetricGoal,
): number | null {
  const { target, direction } = goal;

  if (direction !== "up" && direction !== "down") {
    const startDistance = Math.abs(start - target);
    if (startDistance === 0) return 1;
    return clamp01((startDistance - Math.abs(current - target)) / startDistance);
  }

  const span = direction === "down" ? start - target : target - start;
  if (span === 0) return 1;
  const travelled = direction === "down" ? start - current : current - start;
  return clamp01(travelled / span);
}

/**
 * Infer the direction from where the person is now: a target above the current
 * reading means "up", below means "down". That is what lets one form serve both
 * a cut and a bulk without asking which one you meant.
 *
 * Returns null when there is no reading yet — or when the target is exactly
 * where you already are, which implies no direction at all. Callers then have
 * no basis to judge movement past the target, so they decline to.
 */
export function inferDirection(target: number, current: number | undefined): GoalDirection | null {
  if (current === undefined || !Number.isFinite(current)) return null;
  if (target > current) return "up";
  if (target < current) return "down";
  return null;
}

/**
 * The direction a goal should store after a save.
 *
 * An unchanged target keeps the direction it already had. Re-inferring there
 * would be a silent betrayal: once you have reached the goal, "where you are
 * now" sits on the achieved side, so inferring again would flip a cut into a
 * bulk and start scoring increases as progress. A *changed* target is a new
 * intent and is free to take a new direction.
 */
export function nextDirection(
  prior: { target: number; direction: GoalDirection | null } | undefined,
  target: number,
  current: number | undefined,
): GoalDirection | null {
  if (prior && prior.target === target && prior.direction) return prior.direction;
  return inferDirection(target, current);
}
