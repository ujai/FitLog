"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trainerNotes, user, workoutSessions } from "@/db/schema";
import { requireUser, canLeaveNote, role } from "@/lib/session";
import { isUuid, trainerNoteInput } from "@/lib/validation";

function revalidateNoteSurfaces() {
  revalidatePath("/scans");
  revalidatePath("/");
  revalidatePath("/workouts/[id]", "page");
}

/** With `workoutSessionId`, the note is a comment on that workout of the member's. */
export async function createTrainerNote(
  memberUserId: string,
  body: string,
  workoutSessionId?: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  const parsed = trainerNoteInput.safeParse({ memberUserId, body });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, parsed.data.memberUserId));
  if (!target) return { ok: false, error: "Not found" };
  if (!canLeaveNote(session, target.role)) {
    return { ok: false, error: "Not allowed" };
  }

  if (workoutSessionId !== undefined) {
    if (!isUuid(workoutSessionId)) return { ok: false, error: "Not found" };
    // The comment shows in this member's feed, so it may only attach to one of
    // their own workouts — never borrow someone else's workout title.
    const [workout] = await db
      .select({ userId: workoutSessions.userId })
      .from(workoutSessions)
      .where(eq(workoutSessions.id, workoutSessionId));
    if (!workout || workout.userId !== parsed.data.memberUserId) return { ok: false, error: "Not found" };
  }

  await db.insert(trainerNotes).values({
    memberUserId: parsed.data.memberUserId,
    authorUserId: session.user.id,
    workoutSessionId: workoutSessionId ?? null,
    body: parsed.data.body,
  });

  revalidateNoteSurfaces();
  return { ok: true };
}

/** Edit is author-or-admin, matching delete — a coach owns their own note. */
export async function updateTrainerNote(
  noteId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(noteId)) return { ok: false, error: "Not found" };

  const [note] = await db
    .select({ authorUserId: trainerNotes.authorUserId, memberUserId: trainerNotes.memberUserId })
    .from(trainerNotes)
    .where(eq(trainerNotes.id, noteId));
  if (!note) return { ok: false, error: "Not found" };
  if (note.authorUserId !== session.user.id && role(session) !== "admin") {
    return { ok: false, error: "Not allowed" };
  }

  const parsed = trainerNoteInput.safeParse({ memberUserId: note.memberUserId, body });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await db.update(trainerNotes).set({ body: parsed.data.body }).where(eq(trainerNotes.id, noteId));

  revalidateNoteSurfaces();
  return { ok: true };
}

export async function deleteTrainerNote(noteId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(noteId)) return { ok: false, error: "Not found" };
  const [note] = await db
    .select({ authorUserId: trainerNotes.authorUserId })
    .from(trainerNotes)
    .where(eq(trainerNotes.id, noteId));
  if (!note) return { ok: false, error: "Not found" };
  if (note.authorUserId !== session.user.id && role(session) !== "admin") {
    return { ok: false, error: "Not allowed" };
  }
  await db.delete(trainerNotes).where(eq(trainerNotes.id, noteId));
  revalidateNoteSurfaces();
  return { ok: true };
}
