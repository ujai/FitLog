"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable, workoutExercises, workoutSessions, workoutSets } from "@/db/schema";
import { requireUser, canLogWorkout } from "@/lib/session";
import { isUuid, workoutInput, type WorkoutInput } from "@/lib/validation";
import { parseWallTimeInAppTz } from "@/lib/tz";

/** A workout's date is a date-only string; anchor it to midnight in the app zone. */
function parseWorkoutDate(value: string): Date {
  return parseWallTimeInAppTz(`${value}T00:00`);
}

/** Write one participant's exercises + sets into their session row. */
async function writeExercises(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionId: string,
  userId: string,
  exercises: WorkoutInput["exercises"],
) {
  for (const [exIndex, exercise] of exercises.entries()) {
    const participant = exercise.participants.find((p) => p.userId === userId);
    if (!participant || participant.sets.length === 0) continue;
    const [ex] = await tx
      .insert(workoutExercises)
      .values({ sessionId, name: exercise.name, position: exIndex })
      .returning({ id: workoutExercises.id });
    await tx.insert(workoutSets).values(
      participant.sets.map((set, i) => ({
        exerciseId: ex.id,
        position: i,
        reps: set.reps,
        weightKg: set.weightKg,
        notes: set.notes ?? null,
      })),
    );
  }
}

export async function createWorkout(
  payload: WorkoutInput,
): Promise<{ ok: true; workoutIds: string[] } | { ok: false; error: string }> {
  const session = await requireUser();

  const parsed = workoutInput.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  const userIds = [...new Set(input.userIds)];
  const targets = await db
    .select({ id: userTable.id, role: userTable.role })
    .from(userTable)
    .where(inArray(userTable.id, userIds));
  const roleById = new Map(targets.map((u) => [u.id, u.role]));
  for (const uid of userIds) {
    if (!canLogWorkout(session, uid, roleById.get(uid) ?? "")) {
      return { ok: false, error: "Not allowed" };
    }
  }

  const date = parseWorkoutDate(input.date);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Invalid date" };

  const groupId = userIds.length > 1 ? randomUUID() : null;

  const workoutIds = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const uid of userIds) {
      const [created] = await tx
        .insert(workoutSessions)
        .values({
          userId: uid,
          createdBy: session.user.id,
          groupId,
          date,
          title: input.title,
          notes: input.notes ?? null,
        })
        .returning({ id: workoutSessions.id });
      ids.push(created.id);
      await writeExercises(tx, created.id, uid, input.exercises);
    }
    return ids;
  });

  revalidatePath("/workouts");
  revalidatePath("/");
  return { ok: true, workoutIds };
}

/**
 * Edit a logged workout. Paired sessions (one row per participant, sharing a
 * groupId) are edited as a single unit: session ids stay stable so existing
 * links and the couple pairing survive, while the exercise/set tree is rebuilt
 * from the payload.
 */
export async function updateWorkout(
  workoutId: string,
  payload: WorkoutInput,
): Promise<{ ok: true; workoutIds: string[] } | { ok: false; error: string }> {
  const session = await requireUser();
  if (!isUuid(workoutId)) return { ok: false, error: "Not found" };

  const parsed = workoutInput.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  const [target] = await db
    .select({
      id: workoutSessions.id,
      userId: workoutSessions.userId,
      groupId: workoutSessions.groupId,
    })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, workoutId));
  if (!target) return { ok: false, error: "Not found" };

  const groupSessions = target.groupId
    ? await db
        .select({ id: workoutSessions.id, userId: workoutSessions.userId })
        .from(workoutSessions)
        .where(eq(workoutSessions.groupId, target.groupId))
    : [{ id: target.id, userId: target.userId }];

  const userIds = [...new Set(input.userIds)];
  const affected = [...new Set([...groupSessions.map((s) => s.userId), ...userIds])];
  const roleRows = await db
    .select({ id: userTable.id, role: userTable.role })
    .from(userTable)
    .where(inArray(userTable.id, affected));
  const roleById = new Map(roleRows.map((u) => [u.id, u.role]));
  for (const uid of affected) {
    if (!canLogWorkout(session, uid, roleById.get(uid) ?? "")) {
      return { ok: false, error: "Not allowed" };
    }
  }

  const date = parseWorkoutDate(input.date);
  if (Number.isNaN(date.getTime())) return { ok: false, error: "Invalid date" };

  const groupId = userIds.length > 1 ? (target.groupId ?? randomUUID()) : null;
  const existingByUser = new Map(groupSessions.map((s) => [s.userId, s.id]));

  const workoutIds = await db.transaction(async (tx) => {
    // Participants dropped from the edit lose their session row (cascades to
    // their exercises and sets).
    const dropped = groupSessions.filter((s) => !userIds.includes(s.userId));
    if (dropped.length > 0) {
      await tx.delete(workoutSessions).where(
        inArray(
          workoutSessions.id,
          dropped.map((s) => s.id),
        ),
      );
    }

    const ids: string[] = [];
    for (const uid of userIds) {
      const existingId = existingByUser.get(uid);
      let sessionId: string;
      if (existingId) {
        await tx
          .update(workoutSessions)
          .set({ groupId, date, title: input.title, notes: input.notes ?? null })
          .where(eq(workoutSessions.id, existingId));
        await tx.delete(workoutExercises).where(eq(workoutExercises.sessionId, existingId));
        sessionId = existingId;
      } else {
        const [created] = await tx
          .insert(workoutSessions)
          .values({
            userId: uid,
            createdBy: session.user.id,
            groupId,
            date,
            title: input.title,
            notes: input.notes ?? null,
          })
          .returning({ id: workoutSessions.id });
        sessionId = created.id;
      }
      ids.push(sessionId);
      await writeExercises(tx, sessionId, uid, input.exercises);
    }
    return ids;
  });

  revalidatePath("/workouts");
  revalidatePath("/");
  return { ok: true, workoutIds };
}

export async function deleteWorkout(workoutId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(workoutId)) return { ok: false, error: "Not found" };
  const [workout] = await db
    .select({
      id: workoutSessions.id,
      userId: workoutSessions.userId,
      targetRole: userTable.role,
    })
    .from(workoutSessions)
    .leftJoin(userTable, eq(userTable.id, workoutSessions.userId))
    .where(eq(workoutSessions.id, workoutId));
  if (!workout) return { ok: false, error: "Not found" };
  if (!canLogWorkout(session, workout.userId, workout.targetRole ?? "")) return { ok: false, error: "Not allowed" };
  await db.delete(workoutSessions).where(eq(workoutSessions.id, workoutId));
  revalidatePath("/workouts");
  revalidatePath("/");
  return { ok: true };
}
