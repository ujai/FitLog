import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable, workoutExercises, workoutSessions, workoutSets } from "@/db/schema";
import { requireUser, canView, canLogWorkout } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { UserTabs } from "@/components/user-tabs";
import { DeleteWithUndo, UndoDeleteButton } from "@/components/delete-with-undo";
import { VolumeChart } from "@/components/volume-chart";
import { deleteWorkout } from "@/server/workouts";
import { fmt, fmtDate, fmtShortDate } from "@/lib/format";
import { exerciseHistoryHref } from "@/lib/exercise-link";
import {
  exercisePRs,
  trainingStreak,
  weeklyVolume,
  type AnalyticsExercise,
  type AnalyticsSession,
  type AnalyticsSet,
} from "@/lib/analytics";

export const metadata: Metadata = { title: "Workouts" };

export default async function WorkoutsPage({
  searchParams,
}: PageProps<"/workouts">) {
  const session = await requireUser();
  const { user: userParam } = await searchParams;
  const { selectable, target } = await resolveViewer(session, userParam);

  const [sessions, authors] = await Promise.all([
    db
      .select({
        id: workoutSessions.id,
        date: workoutSessions.date,
        title: workoutSessions.title,
        createdBy: workoutSessions.createdBy,
        userId: workoutSessions.userId,
        groupId: workoutSessions.groupId,
      })
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, target.id))
      .orderBy(desc(workoutSessions.date))
      .limit(100),
    db.select({ id: userTable.id, name: userTable.name, role: userTable.role }).from(userTable),
  ]);
  const authorName = new Map(authors.map((u) => [u.id, u.name]));
  const roleById = new Map(authors.map((u) => [u.id, u.role]));

  // Group partners for couple/group workout badges
  const groupIds = [...new Set(sessions.map((s) => s.groupId).filter((g): g is string => g != null))];
  const sessionIds = sessions.map((s) => s.id);
  const [groupSessions, exercises] = await Promise.all([
    groupIds.length
      ? db
          .select({ groupId: workoutSessions.groupId, userId: workoutSessions.userId })
          .from(workoutSessions)
          .where(inArray(workoutSessions.groupId, groupIds))
      : Promise.resolve([]),
    sessionIds.length
      ? db.select().from(workoutExercises).where(inArray(workoutExercises.sessionId, sessionIds))
      : Promise.resolve([]),
  ]);
  const partnerIdsByGroup = new Map<string, string[]>();
  for (const g of groupSessions) {
    if (!g.groupId || g.userId === target.id) continue;
    const ids = partnerIdsByGroup.get(g.groupId) ?? [];
    if (!ids.includes(g.userId)) ids.push(g.userId);
    partnerIdsByGroup.set(g.groupId, ids);
  }

  const exerciseIds = exercises.map((e) => e.id);
  const sets = exerciseIds.length
    ? await db.select().from(workoutSets).where(inArray(workoutSets.exerciseId, exerciseIds))
    : [];

  const bySession = new Map<string, { exercises: number; volume: number }>();
  for (const ex of exercises) {
    const acc = bySession.get(ex.sessionId) ?? { exercises: 0, volume: 0 };
    acc.exercises += 1;
    bySession.set(ex.sessionId, acc);
  }
  const exById = new Map(exercises.map((e) => [e.id, e]));
  for (const set of sets) {
    const ex = exById.get(set.exerciseId);
    if (!ex) continue;
    const acc = bySession.get(ex.sessionId);
    if (acc && set.reps && set.weightKg) acc.volume += set.reps * set.weightKg;
  }

  // Analytics over the same window (last 100 sessions)
  const dateById = new Map(sessions.map((s) => [s.id, s.date]));
  const setsByExercise = new Map<string, AnalyticsSet[]>();
  for (const set of sets) {
    const list = setsByExercise.get(set.exerciseId) ?? [];
    list.push({ reps: set.reps, weightKg: set.weightKg });
    setsByExercise.set(set.exerciseId, list);
  }
  const exercisesBySession = new Map<string, AnalyticsExercise[]>();
  for (const ex of exercises) {
    const list = exercisesBySession.get(ex.sessionId) ?? [];
    list.push({ name: ex.name, sets: setsByExercise.get(ex.id) ?? [] });
    exercisesBySession.set(ex.sessionId, list);
  }
  const analyticsSessions: AnalyticsSession[] = sessions
    .filter((s) => exercisesBySession.has(s.id))
    .map((s) => ({ date: dateById.get(s.id) ?? s.date, exercises: exercisesBySession.get(s.id) ?? [] }));
  const volumeData = weeklyVolume(analyticsSessions, 12).map((w) => ({
    label: fmtShortDate(w.weekStart),
    volume: Math.round(w.volume),
  }));
  const prs = exercisePRs(analyticsSessions).slice(0, 8);
  const streak = trainingStreak(analyticsSessions);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Workouts</h1>
        <Link
          href={`/workouts/new${target.id !== session.user.id ? `?user=${target.id}` : ""}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-emerald-600 px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
        >
          + Log workout
        </Link>
      </div>

      <UserTabs users={selectable} activeId={target.id} />

      {sessions.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-medium">Progress</h2>
            {streak >= 2 && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                🔥 {streak}-week streak
              </span>
            )}
          </div>
          {volumeData.some((w) => w.volume > 0) ? (
            <>
              <p className="mb-1 text-xs text-stone-600">Weekly volume (kg lifted), last 12 weeks</p>
              <VolumeChart data={volumeData} />
            </>
          ) : (
            <p className="py-2 text-center text-sm text-stone-600">
              Log sets with weight × reps to see your weekly volume.
            </p>
          )}
          {prs.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-600">
                    <th className="py-2 pr-4 font-medium">Exercise</th>
                    <th className="py-2 pr-4 font-medium">Best set</th>
                    <th className="py-2 pr-4 font-medium">Est. 1RM</th>
                    <th className="py-2 pr-4 font-medium">Achieved</th>
                  </tr>
                </thead>
                <tbody>
                  {prs.map((pr) => (
                    <tr key={pr.name} className="border-b border-stone-100 last:border-0">
                      <td className="py-2 pr-4 font-medium">
                        <Link
                          href={exerciseHistoryHref(pr.name, target.id, session.user.id)}
                          className="inline-flex min-h-11 items-center text-emerald-700 hover:underline"
                        >
                          {pr.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 tabular-nums">
                        {fmt(pr.bestSet.weightKg, "kg")} × {pr.bestSet.reps}
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{fmt(pr.estOneRepMax, "kg")}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{fmtDate(pr.achievedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-stone-600">
                Est. 1RM uses the Epley formula — a rough guide, not a prescription.
              </p>
            </div>
          )}
        </section>
      )}

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-600">
          <p className="mb-2 text-3xl">🏋️</p>
          No workouts logged for {target.name} yet.
          <br />
          <Link
            href={`/workouts/new${target.id !== session.user.id ? `?user=${target.id}` : ""}`}
            className="mt-3 inline-flex min-h-11 items-center text-emerald-700 hover:underline"
          >
            Log the first workout →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const stats = bySession.get(s.id) ?? { exercises: 0, volume: 0 };
            const partnerIds = s.groupId ? partnerIdsByGroup.get(s.groupId) ?? [] : [];
            const partnerNames = partnerIds
              .filter((id) => canView(session, id))
              .map((id) => authorName.get(id) ?? "unknown");
            return (
              <DeleteWithUndo
                key={s.id}
                action={deleteWorkout.bind(null, s.id)}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-stone-200 bg-white/70 p-4"
              >
                <Link href={`/workouts/${s.id}`} className="min-w-36 flex-1 hover:text-emerald-800">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs text-stone-600">
                    {fmtDate(s.date)} · logged by {authorName.get(s.createdBy ?? "") ?? "unknown"}
                  </p>
                </Link>
                <div className="flex items-center gap-5 text-sm text-stone-600">
                  {partnerIds.length > 0 &&
                    (partnerNames.length > 0 ? (
                      <span className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs text-stone-600">
                        👥 with {partnerNames.join(", ")}
                      </span>
                    ) : (
                      <span className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs text-stone-600">
                        👥 couple workout
                      </span>
                    ))}
                  <span>{stats.exercises} {stats.exercises === 1 ? "exercise" : "exercises"}</span>
                  {stats.volume > 0 && (
                    <span>{fmt(Math.round(stats.volume), "kg")} volume</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canLogWorkout(session, s.userId, roleById.get(s.userId) ?? "") && (
                    <Link
                      href={`/workouts/${s.id}?edit=1`}
                      className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 text-sm text-stone-600 transition hover:border-emerald-600"
                    >
                      Edit
                    </Link>
                  )}
                  <UndoDeleteButton action={deleteWorkout.bind(null, s.id)}>
                    Delete
                  </UndoDeleteButton>
                </div>
              </DeleteWithUndo>
            );
          })}
        </div>
      )}
    </div>
  );
}
