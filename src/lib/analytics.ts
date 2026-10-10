/**
 * Pure analysis over logged sessions. Weeks are *app-timezone* weeks — Monday
 * 00:00 in APP_TZ, via `weekKeyInAppTz` — never the runtime's. On a UTC server
 * the runtime's week would put every early-Monday session in the app's zone
 * into the previous week, splitting one training week across two buckets.
 */
import { dateKeyAddDays, parseWallTimeInAppTz, weekKeyInAppTz } from "./tz.ts";

export type AnalyticsSet = { reps: number | null; weightKg: number | null };

export type AnalyticsExercise = {
  name: string;
  sets: AnalyticsSet[];
};

export type AnalyticsSession = {
  date: Date;
  exercises: AnalyticsExercise[];
};

type ExercisePR = {
  name: string;
  bestSet: { reps: number; weightKg: number };
  estOneRepMax: number;
  achievedAt: Date;
};

/** Monday 00:00 APP_TZ of the week whose Monday is `mondayKey`, as an instant. */
function weekStartFromKey(mondayKey: string): Date {
  return parseWallTimeInAppTz(`${mondayKey}T00:00`);
}

function setVolume(set: AnalyticsSet): number {
  return set.reps && set.weightKg ? set.reps * set.weightKg : 0;
}

/** Σ reps × weight per Mon-start week for the last `weeks` weeks, oldest first. */
export function weeklyVolume(
  sessions: AnalyticsSession[],
  weeks = 12,
): Array<{ weekStart: Date; volume: number }> {
  if (sessions.length === 0) return [];
  const buckets = new Map<string, number>();
  for (const s of sessions) {
    const key = weekKeyInAppTz(s.date);
    const volume = s.exercises.reduce((sum, ex) => sum + ex.sets.reduce((a, set) => a + setVolume(set), 0), 0);
    buckets.set(key, (buckets.get(key) ?? 0) + volume);
  }
  const current = weekKeyInAppTz(new Date());
  const out: Array<{ weekStart: Date; volume: number }> = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const key = dateKeyAddDays(current, -7 * i);
    out.push({ weekStart: weekStartFromKey(key), volume: buckets.get(key) ?? 0 });
  }
  return out;
}

/**
 * Estimated 1RM (Epley: w × (1 + reps/30)), or null for a set without both a
 * positive weight and reps. Reps are capped at 12 for the formula — beyond
 * that Epley wildly overestimates.
 */
function estimatedOneRepMax({ reps, weightKg }: AnalyticsSet): number | null {
  if (!reps || !weightKg || reps <= 0 || weightKg <= 0) return null;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}

/**
 * One session's work on one exercise: the set with the top 1RM estimate, that
 * estimate, and the volume. `best` is null for bodyweight or reps-only work,
 * which still has a set count worth showing.
 */
export function exerciseSessionSummary(sets: AnalyticsSet[]): {
  best: { reps: number; weightKg: number; estOneRepMax: number } | null;
  volume: number;
  setCount: number;
} {
  let best: { reps: number; weightKg: number; estOneRepMax: number } | null = null;
  for (const set of sets) {
    const estOneRepMax = estimatedOneRepMax(set);
    if (estOneRepMax !== null && (!best || estOneRepMax > best.estOneRepMax)) {
      best = { reps: set.reps!, weightKg: set.weightKg!, estOneRepMax };
    }
  }
  return { best, volume: sets.reduce((sum, set) => sum + setVolume(set), 0), setCount: sets.length };
}

/**
 * Best estimated 1RM per exercise. The "bestSet" is the set that produced the
 * top estimate.
 */
export function exercisePRs(sessions: AnalyticsSession[]): ExercisePR[] {
  const byName = new Map<string, ExercisePR>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        const { reps, weightKg } = set;
        const estOneRepMax = estimatedOneRepMax(set);
        if (estOneRepMax === null || !reps || !weightKg) continue;
        const current = byName.get(ex.name);
        if (!current || estOneRepMax > current.estOneRepMax) {
          byName.set(ex.name, {
            name: ex.name,
            bestSet: { reps, weightKg },
            estOneRepMax,
            achievedAt: s.date,
          });
        }
      }
    }
  }
  return [...byName.values()].sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime());
}

/**
 * Consecutive Mon-start weeks with at least one workout. The current week
 * counts once it has a session; if it's still empty, the streak continues
 * from last week.
 */
export function trainingStreakFromDates(dates: Date[]): number {
  if (dates.length === 0) return 0;
  const weeks = new Set(dates.map(weekKeyInAppTz));
  const thisWeek = weekKeyInAppTz(new Date());
  // The current week counts once it has a session; if it is still empty, the
  // streak continues from last week.
  let cursor = weeks.has(thisWeek) ? thisWeek : dateKeyAddDays(thisWeek, -7);
  if (!weeks.has(cursor)) return 0;
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = dateKeyAddDays(cursor, -7);
  }
  return streak;
}

export function trainingStreak(sessions: AnalyticsSession[]): number {
  return trainingStreakFromDates(sessions.map((s) => s.date));
}

/**
 * The reading to show beside a progress photo: the one nearest the day it was taken,
 * and only when it is near enough to describe that day. A weight logged three weeks
 * away is not "that day's numbers", so callers fall back to the date alone rather
 * than implying a measurement that was never taken.
 *
 * Ties go to the earlier reading, so the answer does not depend on array order.
 */
export function nearestReading<T extends { at: Date }>(
  readings: readonly T[],
  day: Date,
  withinDays = 7,
): T | undefined {
  const limit = withinDays * 86_400_000;
  let best: T | undefined;
  let bestGap = Infinity;
  for (const reading of readings) {
    const gap = Math.abs(reading.at.getTime() - day.getTime());
    if (gap > limit) continue;
    const closer = gap < bestGap;
    const sameGapButEarlier = gap === bestGap && best !== undefined && reading.at < best.at;
    if (closer || sameGapButEarlier) {
      best = reading;
      bestGap = gap;
    }
  }
  return best;
}
