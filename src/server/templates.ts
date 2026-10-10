"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  workoutExercises,
  workoutSessions,
  workoutTemplateExercises,
  workoutTemplates,
} from "@/db/schema";
import { requireUser, canView, role } from "@/lib/session";
import { isUuid } from "@/lib/validation";

export async function createTemplateFromWorkout(
  workoutId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(workoutId)) return { ok: false, error: "Not found" };
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return { ok: false, error: "Give the template a name (max 120 characters)" };
  }

  const [workout] = await db
    .select({ id: workoutSessions.id, userId: workoutSessions.userId })
    .from(workoutSessions)
    .where(eq(workoutSessions.id, workoutId));
  if (!workout) return { ok: false, error: "Not found" };
  if (!canView(session, workout.userId)) return { ok: false, error: "Not allowed" };

  const exercises = await db
    .select({ name: workoutExercises.name })
    .from(workoutExercises)
    .where(eq(workoutExercises.sessionId, workoutId))
    .orderBy(asc(workoutExercises.position));
  if (exercises.length === 0) return { ok: false, error: "This workout has no exercises to save" };

  await db.transaction(async (tx) => {
    const [template] = await tx
      .insert(workoutTemplates)
      .values({ ownerUserId: session.user.id, name: trimmed })
      .returning({ id: workoutTemplates.id });
    await tx.insert(workoutTemplateExercises).values(
      exercises.map((ex, i) => ({ templateId: template.id, name: ex.name, position: i })),
    );
  });

  revalidatePath("/workouts/new");
  return { ok: true };
}

/** Rename is owner-or-admin, matching delete. */
export async function renameTemplate(
  templateId: string,
  name: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(templateId)) return { ok: false, error: "Not found" };
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return { ok: false, error: "Give the template a name (max 120 characters)" };
  }
  const [template] = await db
    .select({ ownerUserId: workoutTemplates.ownerUserId })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, templateId));
  if (!template) return { ok: false, error: "Not found" };
  if (template.ownerUserId !== session.user.id && role(session) !== "admin") {
    return { ok: false, error: "Not allowed" };
  }
  await db.update(workoutTemplates).set({ name: trimmed }).where(eq(workoutTemplates.id, templateId));
  revalidatePath("/workouts/new");
  return { ok: true };
}

/**
 * Offer a template to every member's picker. Only a trainer or admin shares —
 * it is how the coach hands a program over — and only their own template.
 */
export async function setTemplateShared(
  templateId: string,
  shared: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(templateId)) return { ok: false, error: "Not found" };
  const r = role(session);
  if (r !== "trainer" && r !== "admin") return { ok: false, error: "Not allowed" };
  const updated = await db
    .update(workoutTemplates)
    .set({ shared })
    .where(and(eq(workoutTemplates.id, templateId), eq(workoutTemplates.ownerUserId, session.user.id)))
    .returning({ id: workoutTemplates.id });
  if (updated.length === 0) return { ok: false, error: "Not found" };
  revalidatePath("/workouts/new");
  return { ok: true };
}

export async function deleteTemplate(templateId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(templateId)) return { ok: false, error: "Not found" };
  const [template] = await db
    .select({ ownerUserId: workoutTemplates.ownerUserId })
    .from(workoutTemplates)
    .where(eq(workoutTemplates.id, templateId));
  if (!template) return { ok: false, error: "Not found" };
  if (template.ownerUserId !== session.user.id && role(session) !== "admin") {
    return { ok: false, error: "Not allowed" };
  }
  await db.delete(workoutTemplates).where(eq(workoutTemplates.id, templateId));
  revalidatePath("/workouts/new");
  return { ok: true };
}
