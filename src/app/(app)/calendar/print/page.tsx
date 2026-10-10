import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import {
  ptSessions,
  scanListColumns,
  scans,
  workoutExercises,
  workoutSessions,
  workoutSets,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { UserTabs } from "@/components/user-tabs";
import { PrintButton } from "@/components/print-button";
import { deltaToneCls, microLabelCls } from "@/components/controls";
import { CARD_METRICS } from "@/lib/metrics";
import { getMetricGoals } from "@/lib/goals";
import { fmt, fmtDate, metricDelta } from "@/lib/format";
import { trainingStreakFromDates } from "@/lib/analytics";
import { monthRange } from "@/lib/month";

export const metadata: Metadata = { title: "Month in review" };

/**
 * A one-page, print-first record of a month: the PT sessions held, the training
 * logged, and how body composition moved. Made to be printed and handed over —
 * the global `@media print` block (globals.css) turns it black-on-white and
 * strips the app chrome, so this page only has to add `print:hidden` to the
 * controls and keep every number on the shared formatter.
 */
export default async function MonthInReviewPage({
  searchParams,
}: PageProps<"/calendar/print">) {
  const session = await requireUser();
  const params = await searchParams;
  const { start, end, label, key } = monthRange(params.month);

  // Same resolution as every other viewer-aware page: a member only ever gets
  // themselves (a forged `?user=` is not in their selectable set, so it falls
  // back), a trainer switches between their member clients, an admin between
  // everyone who has body data. Trainers are dropped as targets — they have no
  // scans of their own.
  const { selectable, target } = await resolveViewer(session, params.user, {
    hideTrainer: true,
  });

  // A member's month is the sessions they took part in, including the couple's
  // (a null member); a trainer's own month is the sessions they ran. Scoped in
  // SQL, matching the calendar's own rule rather than filtering afterwards.
  const scope =
    target.role === "member"
      ? or(isNull(ptSessions.memberUserId), eq(ptSessions.memberUserId, target.id))
      : eq(ptSessions.trainerId, target.id);

  const [sessions, workouts, allWorkoutDates, scanRows, goals] = await Promise.all([
    db
      .select({
        id: ptSessions.id,
        startsAt: ptSessions.startsAt,
        durationMin: ptSessions.durationMin,
        location: ptSessions.location,
        status: ptSessions.status,
        memberUserId: ptSessions.memberUserId,
      })
      .from(ptSessions)
      .where(and(gte(ptSessions.startsAt, start), lt(ptSessions.startsAt, end), scope))
      .orderBy(asc(ptSessions.startsAt)),
    db
      .select({ id: workoutSessions.id, date: workoutSessions.date, title: workoutSessions.title })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, target.id),
          gte(workoutSessions.date, start),
          lt(workoutSessions.date, end),
        ),
      )
      .orderBy(asc(workoutSessions.date)),
    // Dates only: the streak spans weeks and reads nothing else, so it costs a
    // one-column scan rather than loading every set on the handout.
    db
      .select({ date: workoutSessions.date })
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, target.id)),
    db
      .select(scanListColumns)
      .from(scans)
      .where(
        and(eq(scans.userId, target.id), gte(scans.scannedAt, start), lt(scans.scannedAt, end)),
      )
      .orderBy(asc(scans.scannedAt)),
    getMetricGoals(target.id),
  ]);

  // Volume for the month needs the sets behind it. Two extra reads rather than
  // one join, matching how the workouts page assembles the same numbers.
  const sessionIds = workouts.map((w) => w.id);
  const exercises = sessionIds.length
    ? await db
        .select({ id: workoutExercises.id })
        .from(workoutExercises)
        .where(inArray(workoutExercises.sessionId, sessionIds))
    : [];
  const exerciseIds = exercises.map((e) => e.id);
  const sets = exerciseIds.length
    ? await db
        .select({
          reps: workoutSets.reps,
          weightKg: workoutSets.weightKg,
        })
        .from(workoutSets)
        .where(inArray(workoutSets.exerciseId, exerciseIds))
    : [];
  const volume = sets.reduce(
    (sum, s) => sum + (s.reps && s.weightKg ? s.reps * s.weightKg : 0),
    0,
  );
  const streak = trainingStreakFromDates(allWorkoutDates.map((w) => w.date));

  const held = sessions.filter((s) => s.status === "done").length;
  const scheduled = sessions.filter((s) => s.status === "scheduled").length;
  const cancelled = sessions.filter((s) => s.status === "cancelled").length;

  // The month's bookends. With a single scan they are the same row, which the
  // table reports honestly as "nothing to compare" rather than a zero change.
  const firstScan = scanRows[0] ?? null;
  const lastScan = scanRows[scanRows.length - 1] ?? null;
  const hasTarget = CARD_METRICS.some((m) => goals[m.key] !== undefined);
  // One scan in the month: the bookends are the same row, so there is no change
  // to show. `metricDelta` would happily print "±0" for every metric, which
  // reads as "nothing moved" — the opposite of "there is nothing to measure".
  const singleScan = firstScan !== null && lastScan !== null && firstScan.id === lastScan.id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Controls never print. The header does: the sheet has to say what it is
          and whose month it covers. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/calendar?month=${key}`}
          className="inline-flex min-h-11 items-center text-sm text-stone-600 hover:text-stone-700"
        >
          ← Calendar
        </Link>
        <PrintButton label="🖨️ Print" />
      </div>

      <UserTabs users={selectable} activeId={target.id} />

      {/* A `div`, not a `header`: the global print block in globals.css hides every
          `header` element (that is how the app chrome disappears on paper), and it
          would take this sheet's own title with it. */}
      <div className="border-b border-stone-200 pb-4">
        <p className={microLabelCls}>Month in review</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{label}</h1>
        <p className="text-sm text-stone-600">{target.name}</p>
      </div>

      <section className="space-y-3 print:break-inside-avoid">
        <h2 className="font-medium">PT sessions</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Held" value={held} />
          <Stat label="Scheduled" value={scheduled} />
          <Stat label="Cancelled" value={cancelled} />
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-stone-600">No sessions in {label}.</p>
        ) : (
          <ul>
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-stone-200 py-1.5 text-sm last:border-0"
              >
                <span className={s.status === "cancelled" ? "text-stone-600 line-through" : ""}>
                  {fmtDate(s.startsAt)}
                  {s.memberUserId === null && (
                    <span className="ml-2 text-xs text-stone-600">both members</span>
                  )}
                </span>
                <span className="text-stone-600">
                  {[
                    `${s.durationMin} min`,
                    s.status === "done" ? null : s.status,
                    s.location,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 print:break-inside-avoid">
        <h2 className="font-medium">Training</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Workouts" value={workouts.length} />
          <Stat label="Volume" value={fmt(Math.round(volume), "kg")} />
          <Stat
            label="Streak"
            value={streak > 0 ? `${streak} ${streak === 1 ? "week" : "weeks"}` : "—"}
          />
        </div>
        {workouts.length === 0 && (
          <p className="text-sm text-stone-600">No workouts logged in {label}.</p>
        )}
      </section>

      <section className="space-y-3 print:break-inside-avoid">
        <h2 className="font-medium">Body composition</h2>
        {firstScan === null || lastScan === null ? (
          <p className="text-sm text-stone-600">
            No Evolt scan in {label}.
            <Link href="/scans/new" className="ml-1 text-emerald-700 hover:underline print:hidden">
              Add one →
            </Link>
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-stone-600">
                    <th className="py-2 pr-4 font-medium">Metric</th>
                    <th className="py-2 pr-4 font-medium">Start</th>
                    <th className="py-2 pr-4 font-medium">End</th>
                    <th className="py-2 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {CARD_METRICS.map((m) => {
                    const from = firstScan[m.key] as number | null;
                    const to = lastScan[m.key] as number | null;
                    const delta = metricDelta(to, from, goals[m.key]);
                    return (
                      <tr key={m.key} className="border-b border-stone-200">
                        <td className="py-2.5 pr-4 text-stone-600">{m.label}</td>
                        <td className="py-2.5 pr-4">{fmt(from, m.unit)}</td>
                        <td className="py-2.5 pr-4 font-medium">{fmt(to, m.unit)}</td>
                        <td className="py-2.5 font-medium">
                          {singleScan || delta.text === "" ? (
                            "—"
                          ) : (
                            <span className={`whitespace-nowrap ${deltaToneCls(delta.tone)}`}>
                              {delta.arrow ? `${delta.arrow} ` : ""}
                              {delta.text}
                              {m.unit ? ` ${m.unit}` : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-stone-600">
              {firstScan.id === lastScan.id
                ? `One scan this month (${fmtDate(firstScan.scannedAt)}) — nothing to compare it against yet.`
                : `${fmtDate(firstScan.scannedAt)} → ${fmtDate(lastScan.scannedAt)}.`}{" "}
              {hasTarget
                ? "Changes are judged against the targets on file — green is closer to the target, amber further away."
                : "No targets set, so changes are shown without a good/bad judgement."}
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/** One figure on the sheet — the same shape as the diet page's week totals. */
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <p className={microLabelCls}>{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
