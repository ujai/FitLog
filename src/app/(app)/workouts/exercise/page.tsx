import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { workoutExercises, workoutSessions, workoutSets } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { UserTabs } from "@/components/user-tabs";
import { VolumeChart } from "@/components/volume-chart";
import { exerciseSessionSummary } from "@/lib/analytics";
import { fmt, fmtDate, fmtShortDate } from "@/lib/format";

export const metadata: Metadata = { title: "Exercise history" };

/** Sessions shown — a year of twice-weekly training, plenty on a phone. */
const HISTORY_LIMIT = 100;

export default async function ExerciseHistoryPage({ searchParams }: PageProps<"/workouts/exercise">) {
  const session = await requireUser();
  const { user: userParam, name: nameParam } = await searchParams;
  const { selectable, target } = await resolveViewer(session, userParam);
  const name = typeof nameParam === "string" ? nameParam.trim().slice(0, 200) : "";

  const backLink = (
    <Link
      href={`/workouts${target.id !== session.user.id ? `?user=${target.id}` : ""}`}
      className="inline-flex min-h-11 items-center text-sm text-stone-600 hover:text-stone-700"
    >
      ← All workouts
    </Link>
  );

  if (!name) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Exercise history</h1>
        <p className="text-stone-600">Pick an exercise from a workout or the personal-records table.</p>
        {backLink}
      </div>
    );
  }

  // Case-insensitive, like the "last time" hint in the log form: "Bench press"
  // and "bench press" are the same lift typed twice.
  const rows = await db
    .select({
      exerciseId: workoutExercises.id,
      name: workoutExercises.name,
      sessionId: workoutSessions.id,
      date: workoutSessions.date,
      title: workoutSessions.title,
    })
    .from(workoutExercises)
    .innerJoin(workoutSessions, eq(workoutSessions.id, workoutExercises.sessionId))
    .where(and(eq(workoutSessions.userId, target.id), eq(sql`lower(${workoutExercises.name})`, name.toLowerCase())))
    .orderBy(desc(workoutSessions.date))
    .limit(HISTORY_LIMIT);

  const sets = rows.length
    ? await db
        .select()
        .from(workoutSets)
        .where(inArray(workoutSets.exerciseId, rows.map((r) => r.exerciseId)))
    : [];
  const setsByExercise = new Map<string, typeof sets>();
  for (const set of sets) {
    const list = setsByExercise.get(set.exerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.exerciseId, list);
  }

  const history = rows.map((r) => {
    const exerciseSets = (setsByExercise.get(r.exerciseId) ?? []).sort((a, b) => a.position - b.position);
    return { ...r, sets: exerciseSets, summary: exerciseSessionSummary(exerciseSets) };
  });
  const displayName = rows[0]?.name ?? name;
  const best = history.reduce<(typeof history)[number] | null>(
    (top, h) =>
      h.summary.best && (!top?.summary.best || h.summary.best.estOneRepMax > top.summary.best.estOneRepMax) ? h : top,
    null,
  );
  const chartData = [...history]
    .reverse()
    .filter((h) => h.summary.best)
    .map((h) => ({ label: fmtShortDate(h.date), volume: Math.round(h.summary.best!.estOneRepMax * 10) / 10 }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{displayName}</h1>
        {backLink}
      </div>

      <UserTabs users={selectable} activeId={target.id} />

      {history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-600">
          {target.name} hasn&apos;t logged {displayName} yet.
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-medium">Est. 1RM over time</h2>
              <p className="text-sm text-stone-600">
                {history.length} {history.length === 1 ? "session" : "sessions"}
                {best?.summary.best && (
                  <>
                    {" "}· best {fmt(best.summary.best.weightKg, "kg")} × {best.summary.best.reps} on{" "}
                    {fmtDate(best.date)}
                  </>
                )}
              </p>
            </div>
            {chartData.length >= 2 ? (
              <VolumeChart data={chartData} seriesLabel="Est. 1RM" />
            ) : (
              <p className="py-2 text-center text-sm text-stone-600">
                Two sessions with weight × reps are needed for a trend.
              </p>
            )}
            <p className="mt-2 text-xs text-stone-600">
              Est. 1RM uses the Epley formula — a rough guide, not a prescription.
            </p>
          </section>

          <ul className="space-y-3">
            {history.map((h) => (
              <li key={h.exerciseId} className="rounded-2xl border border-stone-200 bg-white/70 p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/workouts/${h.sessionId}`} className="font-medium hover:text-emerald-800">
                    {fmtDate(h.date)} · {h.title}
                  </Link>
                  <span className="text-sm text-stone-600 tabular-nums">
                    {h.summary.best && <>1RM ≈ {fmt(h.summary.best.estOneRepMax, "kg")}</>}
                    {h.summary.best && h.summary.volume > 0 && " · "}
                    {h.summary.volume > 0 && <>{fmt(Math.round(h.summary.volume), "kg")} volume</>}
                  </span>
                </div>
                <p className="text-sm tabular-nums text-stone-600">
                  {h.sets.length === 0
                    ? "No sets recorded"
                    : h.sets
                        .map((set) =>
                          set.weightKg != null
                            ? `${fmt(set.weightKg, "kg")} × ${set.reps ?? "—"}`
                            : `${set.reps ?? "—"} reps`,
                        )
                        .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
          {history.length === HISTORY_LIMIT && (
            <p className="text-center text-xs text-stone-600">Showing the latest {HISTORY_LIMIT} sessions.</p>
          )}
        </>
      )}
    </div>
  );
}
