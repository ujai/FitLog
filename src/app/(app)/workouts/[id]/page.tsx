import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { trainerNotes, user as userTable, workoutExercises, workoutSessions, workoutSets } from "@/db/schema";
import { requireUser, canView, canLogWorkout, canLeaveNote, role } from "@/lib/session";
import { CoachNotes } from "@/components/coach-notes";
import { SaveTemplateButton } from "@/components/save-template-button";
import { WorkoutForm } from "@/components/workout-form";
import { btnSecondaryCls } from "@/components/controls";
import { fmt, fmtDate } from "@/lib/format";
import { exerciseHistoryHref } from "@/lib/exercise-link";
import { dateKeyInAppTz } from "@/lib/tz";
import type { WorkoutExerciseDraft, WorkoutSetRow } from "@/lib/workout-draft";

export const metadata: Metadata = { title: "Workout detail" };

export default async function WorkoutDetailPage({
  params,
  searchParams,
}: PageProps<"/workouts/[id]">) {
  const session = await requireUser();
  const { id } = await params;
  const { edit } = await searchParams;
  const isEditing = edit === "1" || edit === "true";

  const [workout] = await db.select().from(workoutSessions).where(eq(workoutSessions.id, id));
  if (!workout) notFound();
  if (!canView(session, workout.userId)) notFound();

  const [allUsers, siblingRows] = await Promise.all([
    db.select({ id: userTable.id, name: userTable.name, role: userTable.role }).from(userTable),
    workout.groupId
      ? db
          .select({ id: workoutSessions.id, userId: workoutSessions.userId, date: workoutSessions.date })
          .from(workoutSessions)
          .where(and(eq(workoutSessions.groupId, workout.groupId), ne(workoutSessions.id, workout.id)))
      : Promise.resolve([]),
  ]);
  const nameById = new Map(allUsers.map((u) => [u.id, u.name]));
  const roleById = new Map(allUsers.map((u) => [u.id, u.role]));
  const ownerName = nameById.get(workout.userId);
  const authorName = workout.createdBy ? nameById.get(workout.createdBy) : undefined;

  const siblings = siblingRows.filter((s) => canView(session, s.userId));

  // Paired sessions are edited as one unit, so the whole group has to be
  // writable by this viewer for the edit form to be offered at all.
  const groupSessionIds = [workout.id, ...siblingRows.map((s) => s.id)];
  const canEditWorkout = [workout.userId, ...siblingRows.map((s) => s.userId)].every((uid) =>
    canLogWorkout(session, uid, roleById.get(uid) ?? ""),
  );

  const ownerRole = roleById.get(workout.userId) ?? "";
  const [exercises, comments] = await Promise.all([
    db
      .select()
      .from(workoutExercises)
      .where(inArray(workoutExercises.sessionId, groupSessionIds))
      .orderBy(asc(workoutExercises.position)),
    db
      .select({
        id: trainerNotes.id,
        body: trainerNotes.body,
        createdAt: trainerNotes.createdAt,
        authorId: trainerNotes.authorUserId,
        authorName: userTable.name,
      })
      .from(trainerNotes)
      .leftJoin(userTable, eq(userTable.id, trainerNotes.authorUserId))
      .where(eq(trainerNotes.workoutSessionId, workout.id))
      .orderBy(asc(trainerNotes.createdAt)),
  ]);
  const canComment = canLeaveNote(session, ownerRole);

  const exerciseIds = exercises.map((e) => e.id);
  const sets = exerciseIds.length
    ? await db.select().from(workoutSets).where(inArray(workoutSets.exerciseId, exerciseIds))
    : [];

  const setsByExercise = new Map<string, typeof sets>();
  for (const s of sets) {
    const list = setsByExercise.get(s.exerciseId) ?? [];
    list.push(s);
    setsByExercise.set(s.exerciseId, list);
  }
  for (const list of setsByExercise.values()) {
    list.sort((a, b) => a.position - b.position);
  }

  const sessionExercises = exercises.filter((e) => e.sessionId === workout.id);

  /** Merge the group's per-participant exercise rows back into draft set rows. */
  function buildInitial(): {
    userIds: string[];
    date: string;
    title: string;
    notes: string;
    exercises: WorkoutExerciseDraft[];
  } {
    const sessionUser = new Map(groupSessionIds.map((sid) => [sid, sessionUserId(sid)]));
    const byPosition = new Map<number, WorkoutExerciseDraft>();
    for (const ex of exercises) {
      const uid = sessionUser.get(ex.sessionId);
      if (!uid) continue;
      const draft = byPosition.get(ex.position) ?? { name: ex.name, sets: [] };
      (setsByExercise.get(ex.id) ?? []).forEach((set, i) => {
        const row: WorkoutSetRow = draft.sets[i] ?? {};
        row[uid] = {
          reps: set.reps != null ? String(set.reps) : "",
          weightKg: set.weightKg != null ? String(set.weightKg) : "",
          notes: set.notes ?? "",
        };
        draft.sets[i] = row;
      });
      byPosition.set(ex.position, draft);
    }
    return {
      userIds: [workout.userId, ...siblingRows.map((s) => s.userId)],
      date: dateKeyInAppTz(workout.date),
      title: workout.title,
      notes: workout.notes ?? "",
      exercises: [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, draft]) => draft),
    };
  }

  function sessionUserId(sessionId: string): string | undefined {
    if (sessionId === workout.id) return workout.userId;
    return siblingRows.find((s) => s.id === sessionId)?.userId;
  }

  const editableUsers = allUsers.filter((u) => canLogWorkout(session, u.id, u.role));
  const initial = canEditWorkout ? buildInitial() : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{workout.title}</h1>
        <div className="flex items-center gap-3">
          <SaveTemplateButton workoutId={workout.id} />
          <Link href="/workouts" className="inline-flex min-h-11 items-center text-sm text-stone-600 hover:text-stone-700">
            ← All workouts
          </Link>
        </div>
      </div>
      <p className="text-sm text-stone-600">
        {ownerName ?? "unknown"} · {fmtDate(workout.date)} · logged by {authorName ?? "unknown"}
      </p>

      {canEditWorkout && !isEditing && (
        <Link href={`/workouts/${workout.id}?edit=1`} className={btnSecondaryCls}>
          Edit
        </Link>
      )}

      {isEditing && canEditWorkout && initial && (
        <section className="rounded-2xl border border-emerald-200 bg-white/70 p-4">
          <h2 className="mb-3 font-medium">Edit this workout</h2>
          <WorkoutForm
            mode="edit"
            workoutId={workout.id}
            participants={editableUsers.map(({ id: uid, name }) => ({ id: uid, name }))}
            defaultUserId={workout.userId}
            lastSets={{}}
            initial={initial}
          />
        </section>
      )}

      {siblings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-stone-600">Paired with:</span>
          {siblings.map((s) => (
            <Link
              key={s.id}
              href={`/workouts/${s.id}`}
              className="inline-flex min-h-11 items-center rounded-full border border-stone-300 bg-white/70 px-3.5 text-sm text-stone-600 transition hover:border-emerald-500 hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:outline-none"
            >
              {nameById.get(s.userId) ?? "unknown"} · {fmtDate(s.date)} →
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {sessionExercises.map((ex) => (
          <div key={ex.id} className="rounded-2xl border border-stone-200 bg-white/70 p-4">
            <h2 className="mb-2 font-medium">
              <Link
                href={exerciseHistoryHref(ex.name, workout.userId, session.user.id)}
                className="inline-flex min-h-11 items-center hover:text-emerald-800"
              >
                {ex.name} <span className="ml-2 text-sm font-normal text-emerald-700">history →</span>
              </Link>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-stone-600">
                    <th className="py-1.5 pr-4 font-medium">Set</th>
                    <th className="py-1.5 pr-4 font-medium">Reps</th>
                    <th className="py-1.5 pr-4 font-medium">Weight</th>
                    <th className="py-1.5 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(setsByExercise.get(ex.id) ?? []).map((set, i) => (
                    <tr key={set.id} className="border-b border-stone-200">
                      <td className="py-2 pr-4 text-stone-600">{i + 1}</td>
                      <td className="py-2 pr-4">{set.reps ?? "—"}</td>
                      <td className="py-2 pr-4">{fmt(set.weightKg, "kg")}</td>
                      <td className="py-2 text-stone-600">{set.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {workout.notes && (
        <div className="rounded-2xl border border-stone-200 bg-white/70 p-4">
          <h2 className="mb-1 text-sm font-medium text-stone-600">Session notes</h2>
          <p className="text-sm">{workout.notes}</p>
        </div>
      )}

      {/* Coach comments belong to a member's workout; a trainer's own log has none. */}
      {ownerRole === "member" && (canComment || comments.length > 0) && (
        <CoachNotes
          notes={comments}
          targetId={workout.userId}
          targetName={ownerName ?? "this member"}
          canNote={canComment}
          viewerId={session.user.id}
          isAdmin={role(session) === "admin"}
          workoutSessionId={workout.id}
        />
      )}
    </div>
  );
}
