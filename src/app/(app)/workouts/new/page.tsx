import type { Metadata } from "next";
import { asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  user,
  workoutExercises,
  workoutSessions,
  workoutSets,
  workoutTemplateExercises,
  workoutTemplates,
} from "@/db/schema";
import { requireUser, canLogWorkout, role } from "@/lib/session";
import { WorkoutForm } from "@/components/workout-form";
import type { LastSets } from "@/lib/workout-draft";

export const metadata: Metadata = { title: "Log workout" };

/** Per user: most recent logged sets for each exercise name (lowercased) */
async function lastSetsForUser(uid: string): Promise<LastSets[string]> {
  const sessions = await db
    .select({ id: workoutSessions.id, date: workoutSessions.date })
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, uid))
    .orderBy(desc(workoutSessions.date))
    .limit(15);

  const map: LastSets[string] = {};
  if (sessions.length > 0) {
    const exercises = await db
      .select({
        id: workoutExercises.id,
        sessionId: workoutExercises.sessionId,
        name: workoutExercises.name,
      })
      .from(workoutExercises)
      .where(inArray(workoutExercises.sessionId, sessions.map((s) => s.id)));

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

    // sessions are ordered most recent first; first hit per name wins
    for (const session of sessions) {
      for (const ex of exercises.filter((e) => e.sessionId === session.id)) {
        const key = ex.name.toLowerCase();
        if (!map[key]) {
          map[key] = {
            date: session.date,
            sets: (setsByExercise.get(ex.id) ?? [])
              .sort((a, b) => a.position - b.position)
              .map((s) => ({ reps: s.reps, weightKg: s.weightKg })),
          };
        }
      }
    }
  }
  return map;
}

/** Same, for several users — each user's history loads in parallel. */
async function lastSetsFor(userIds: string[]): Promise<LastSets> {
  const result: LastSets = {};
  await Promise.all(
    userIds.map(async (uid) => {
      result[uid] = await lastSetsForUser(uid);
    }),
  );
  return result;
}

export default async function NewWorkoutPage({
  searchParams,
}: PageProps<"/workouts/new">) {
  const session = await requireUser();
  const { user: userParam } = await searchParams;

  const users = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .orderBy(asc(user.name));

  const editable = users.filter((u) => canLogWorkout(session, u.id, u.role));

  // A trainer logs only for members, so a trainer with no member clients has
  // nobody to log for. Every page dereferences its default target; this one has
  // to say so rather than read `editable[0].id` off an empty list.
  if (editable.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Log workout</h1>
        <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-600">
          No members to log for yet — their workouts will be loggable here once a member
          account exists.
        </div>
      </div>
    );
  }

  const defaultUserId =
    editable.find((u) => u.id === userParam)?.id ??
    editable.find((u) => u.id === session.user.id)?.id ??
    editable[0].id;

  const members = editable.filter((u) => u.role === "member");
  const viewerRole = role(session);
  // Couple default: trainer/admin landing on the form fresh → preselect both members
  const preselectIds =
    !userParam && (viewerRole === "admin" || viewerRole === "trainer") && members.length === 2
      ? members.map((m) => m.id)
      : undefined;

  const [lastSets, templates] = await Promise.all([
    lastSetsFor(editable.map((u) => u.id)),
    db
      .select({
        id: workoutTemplates.id,
        name: workoutTemplates.name,
        shared: workoutTemplates.shared,
        ownerUserId: workoutTemplates.ownerUserId,
        ownerName: user.name,
      })
      .from(workoutTemplates)
      .innerJoin(user, eq(user.id, workoutTemplates.ownerUserId))
      .where(or(eq(workoutTemplates.ownerUserId, session.user.id), eq(workoutTemplates.shared, true)))
      .orderBy(desc(workoutTemplates.createdAt)),
  ]);
  const templateExercises = templates.length
    ? await db
        .select({
          templateId: workoutTemplateExercises.templateId,
          name: workoutTemplateExercises.name,
        })
        .from(workoutTemplateExercises)
        .where(inArray(workoutTemplateExercises.templateId, templates.map((t) => t.id)))
        .orderBy(asc(workoutTemplateExercises.position))
    : [];
  const templatesWithData = templates
    .map((t) => ({
      id: t.id,
      name: t.name,
      from: t.ownerUserId === session.user.id ? undefined : t.ownerName,
      exercises: templateExercises.filter((e) => e.templateId === t.id).map((e) => e.name),
    }))
    .filter((t) => t.exercises.length > 0);
  // The manager lists every template the viewer owns, including ones the picker
  // hides for having no exercises — otherwise they could never be renamed or
  // deleted. Someone else's shared template is pick-only.
  const allTemplates = templates
    .filter((t) => t.ownerUserId === session.user.id)
    .map((t) => ({
      id: t.id,
      name: t.name,
      shared: t.shared,
      exerciseCount: templateExercises.filter((e) => e.templateId === t.id).length,
    }));
  const canShare = viewerRole === "trainer" || viewerRole === "admin";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Log workout</h1>
      <WorkoutForm
        participants={editable.map(({ id, name }) => ({ id, name }))}
        defaultUserId={defaultUserId}
        preselectIds={preselectIds}
        lastSets={lastSets}
        templates={templatesWithData}
        allTemplates={allTemplates}
        canShareTemplates={canShare}
      />
    </div>
  );
}
