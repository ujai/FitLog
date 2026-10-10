"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { metricGoals } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getMetricGoals, getLatestMetricValues } from "@/lib/goals";
import { nextDirection, isGoalMetric, type GoalDirection, type GoalMetric } from "@/lib/goal-metrics";

function revalidateGoalSurfaces() {
  // Every surface that scores a delta against a target.
  revalidatePath("/account");
  revalidatePath("/");
  revalidatePath("/scans");
  revalidatePath("/scans/compare");
  revalidatePath("/scans/measurements");
}

/**
 * Replace this person's targets in one go: a number sets or updates a target,
 * `null` clears it (so emptying a field in the settings form removes the goal).
 *
 * Targets are strictly first-person, like scans and tape measurements — you set
 * your own, and nobody sets yours. A trainer steers progress through coach
 * notes, not by writing a member's body goals.
 */
export async function saveMetricGoals(
  entries: Array<{ metric: string; target: number | null }>,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();

  const toSet: Array<{ metric: GoalMetric; target: number; direction: GoalDirection | null }> = [];
  const toClear: GoalMetric[] = [];
  for (const entry of entries) {
    if (!isGoalMetric(entry.metric)) return { ok: false, error: "Unknown metric" };
    if (entry.target === null) {
      toClear.push(entry.metric);
      continue;
    }
    if (!Number.isFinite(entry.target)) return { ok: false, error: "Every target has to be a number" };
    if (Math.abs(entry.target) > 1_000_000) return { ok: false, error: "That number looks wrong" };
    toSet.push({ metric: entry.metric, target: entry.target, direction: null });
  }

  // Two things shape a new goal's direction: where the person is now (so one
  // form serves a cut and a bulk alike), and what the goal already meant.
  const [existing, current] = await Promise.all([
    getMetricGoals(session.user.id),
    getLatestMetricValues(
      session.user.id,
      toSet.map((entry) => entry.metric),
    ),
  ]);

  for (const entry of toSet) {
    entry.direction = nextDirection(existing[entry.metric], entry.target, current[entry.metric]);
  }

  try {
    // One transaction: a failure part-way through must not leave a mix of the
    // old and new target sets committed.
    await db.transaction(async (tx) => {
      for (const entry of toSet) {
        await tx
          .insert(metricGoals)
          .values({
            userId: session.user.id,
            metric: entry.metric,
            target: entry.target,
            direction: entry.direction,
          })
          .onConflictDoUpdate({
            target: [metricGoals.userId, metricGoals.metric],
            set: { target: entry.target, direction: entry.direction, updatedAt: new Date() },
          });
      }
      if (toClear.length > 0) {
        await tx
          .delete(metricGoals)
          .where(
            and(eq(metricGoals.userId, session.user.id), inArray(metricGoals.metric, toClear)),
          );
      }
    });
    revalidateGoalSurfaces();
    return { ok: true };
  } catch (e) {
    // The raw message would be Postgres gibberish to a household member and
    // names our tables. The operator gets it in the service log instead.
    console.error("[fitlog] saveMetricGoals failed", e);
    return { ok: false, error: "Couldn't save your targets. Try again in a moment." };
  }
}
