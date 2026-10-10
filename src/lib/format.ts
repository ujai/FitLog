/**
 * Rendering only. Metric identity — keys, labels, units, hints, chart padding —
 * lives in `src/lib/metrics.ts`, and the target selection in
 * `src/lib/goal-metrics.ts`.
 */
import { APP_TZ, calendarDaysBetween, dateKeyInAppTz } from "./tz.ts";
import type { MetricGoal } from "./goal-metrics.ts";

/** Pinned so server and client render identical dates (no hydration mismatches). */
export const LOCALE = "en-US";

// All display formatting happens in the app timezone (not the runtime's zone,
// which is UTC on Vercel) so server-rendered and client-rendered times agree.
const TZ_OPTS = { timeZone: APP_TZ } as const;

export function fmt(value: number | null | undefined, unit = ""): string {
  if (value === null || value === undefined) return "—";
  // Small magnitudes (waist-to-hip ratio, BWI score) need 2 decimals to stay meaningful.
  const rounded =
    Math.abs(value) < 10 ? Math.round(value * 100) / 100 : Math.round(value * 10) / 10;
  // One formatter for screen and print: locale-pinned separators everywhere, so
  // the dietician handout never mixes "4500 kcal" with "1,410 kcal".
  const text = rounded.toLocaleString(LOCALE);
  return unit ? `${text} ${unit}` : text;
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString(LOCALE, {
    ...TZ_OPTS,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date | string): string {
  return new Date(d).toLocaleString(LOCALE, {
    ...TZ_OPTS,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Date + time including the year. Used where two entries can be a year apart
 * and otherwise read identically — the scan comparison header and its pickers.
 */
export function fmtDateTimeWithYear(d: Date | string): string {
  return new Date(d).toLocaleString(LOCALE, {
    ...TZ_OPTS,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtShortDate(d: Date | string): string {
  return new Date(d).toLocaleDateString(LOCALE, {
    ...TZ_OPTS,
    month: "short",
    day: "numeric",
  });
}

export function fmtTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString(LOCALE, {
    ...TZ_OPTS,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString(LOCALE, { ...TZ_OPTS, month: "long", year: "numeric" });
}

/**
 * Long weekday + date, for a heading where the day of the week is load-bearing
 * ("Thursday, October 2" — a date alone still has to be counted). Matches the
 * calendar's day dialog, which labels days the same way.
 */
export function fmtWeekdayDate(d: Date | string): string {
  return new Date(d).toLocaleDateString(LOCALE, {
    ...TZ_OPTS,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * "today" / "yesterday" / "N days ago", counted in calendar days in the app
 * timezone — a scan at 11pm and a look at 1am are different days, not minutes
 * apart. Anything in the future reads as "today" rather than a negative count.
 */
export function fmtDaysAgo(d: Date | string, now: Date = new Date()): string {
  const days = calendarDaysBetween(dateKeyInAppTz(new Date(d)), dateKeyInAppTz(now));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/**
 * The mirror of `fmtDaysAgo`: "today" / "tomorrow" / "in N days". Same
 * calendar-day rule, so a session at 00:30 reads "tomorrow" at 23:00 the night
 * before — not "today" because it is only ninety minutes away. A start that has
 * already passed clamps to "today" for the same reason `fmtDaysAgo` clamps the
 * future; labelling a session under way is the caller's job, not this
 * formatter's.
 */
export function fmtUntil(d: Date | string, now: Date = new Date()): string {
  const days = calendarDaysBetween(dateKeyInAppTz(now), dateKeyInAppTz(new Date(d)));
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * How much time passed, at a precision that means something: minutes under an
 * hour, hours under a day, then days. `earlier` must not be later than `later` —
 * callers order the pair. Two scans the same morning are six hours apart, not
 * "0 days".
 */
export function fmtElapsed(earlier: Date | string, later: Date | string): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const ms = new Date(later).getTime() - new Date(earlier).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return plural(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return plural(hours, "hour");
  return plural(Math.round(hours / 24), "day");
}

type MetricDelta = {
  /**
   * Change magnitude, unsigned ("2.4", "0.03"), or "±0" when nothing moved;
   * empty when it cannot be computed. The sign is deliberately absent because
   * the arrow beside it carries direction.
   */
  text: string;
  /** Direction glyph, so direction never depends on colour alone. */
  arrow: string;
  /**
   * Whether the change is good. "neutral" unless the metric has a target:
   * without one, an increase is not "good" or "bad", only different. Direction
   * of good is a property of the person's goal, not of the metric — assuming
   * it is why the app used to celebrate gaining weight in the accent colour.
   */
  tone: "neutral" | "good" | "bad";
};

/** Closer to the target is good, further is bad. */
function closerTo(target: number, current: number, previous: number): MetricDelta["tone"] {
  const before = Math.abs(previous - target);
  const now = Math.abs(current - target);
  if (now === before) return "neutral";
  return now < before ? "good" : "bad";
}

/**
 * Score a change against a target.
 *
 * With a known direction, "achieved" means at or past the target *that way*:
 * crossing it is good, and once you are past it, holding or going further is
 * not a failure — only falling back across it is. Falling back to distance
 * alone would read someone who hit their body-fat goal and kept going as
 * "moving away", which is the opposite of what happened.
 *
 * Without a direction (no reading existed when the target was set) distance is
 * the only safe reading: closer is good.
 */
function scoreAgainstGoal(
  current: number,
  previous: number,
  goal: MetricGoal,
): MetricDelta["tone"] {
  const { target, direction } = goal;
  // A direction the scorer does not recognise is not a direction. Reading it as
  // "down" would silently invert every verdict for that metric, so fall back to
  // distance instead — the same as having no target direction at all.
  if (direction !== "up" && direction !== "down") return closerTo(target, current, previous);

  const atOrPast = (value: number) => (direction === "up" ? value >= target : value <= target);
  const wasPast = atOrPast(previous);
  const isPast = atOrPast(current);

  if (!wasPast && isPast) return "good";
  if (!wasPast && !isPast) return closerTo(target, current, previous);
  // Already at or past the goal: holding or pushing further is fine, dropping
  // back across it is not. Neutral rather than "good" because having passed a
  // target is not itself a new achievement.
  return isPast ? "neutral" : "bad";
}

/** Delta between two values, scored only when a `goal` is known. */
export function metricDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  goal?: MetricGoal,
): MetricDelta {
  if (current == null || previous == null) return { text: "", arrow: "", tone: "neutral" };
  // Small-magnitude metrics (BWI, waist-to-hip) need 2 decimals — 1 decimal
  // rounds real changes into a dishonest "±0".
  const raw = current - previous;
  const diff = Math.abs(raw) < 10 ? Math.round(raw * 100) / 100 : Math.round(raw * 10) / 10;
  // Rounding is for display only. A change too small to show is still a change,
  // so the tone is scored on the raw values — otherwise a metric could cross its
  // target and be reported as "±0" with no verdict at all.
  const shown = diff !== 0;
  return {
    text: shown ? `${Math.abs(diff)}` : "±0",
    arrow: shown ? (raw > 0 ? "▲" : "▼") : "",
    tone: goal ? scoreAgainstGoal(current, previous, goal) : "neutral",
  };
}
