import { deltaToneCls, microLabelCls } from "@/components/controls";
import Link from "next/link";
import { and, asc, desc, eq, gte, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { ptSessions, scanListColumns, scans, trainerNotes, user as userTable, workoutSessions } from "@/db/schema";
import { requireUser, role } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import {
  fmt,
  fmtDate,
  fmtDateTime,
  fmtDaysAgo,
  metricDelta,
} from "@/lib/format";
import { CARD_METRICS, metric } from "@/lib/metrics";
import { getMetricGoals } from "@/lib/goals";
import { trainingStreakFromDates } from "@/lib/analytics";
import { TrainerRoster } from "./trainer-roster";
import { BwiRing } from "./bwi-ring";

/**
 * Body fat leads the dashboard: it carries the most signal about whether the
 * household's logging is working, and it is the metric someone actually sets a
 * target against. The rest of the numbers are supporting detail.
 */
const HERO_METRIC = metric("bodyFatPct");
const HERO_KEY = HERO_METRIC.key;
/** BWI and bio age lead the tile grid as a ring; see BwiRing. */
const BWI_KEY = metric("bwiScore").key;
const BIO_AGE_KEY = metric("bioAge").key;
const SECONDARY_METRICS = CARD_METRICS.filter(
  (m) => m.key !== HERO_KEY && m.key !== BWI_KEY && m.key !== BIO_AGE_KEY,
);

export default async function DashboardPage({
  searchParams,
}: PageProps<"/">) {
  const session = await requireUser();
  const { user: userParam } = await searchParams;
  const { selectable, target } = await resolveViewer(session, userParam);
  const r = role(session);

  const now = new Date();

  if (r === "trainer") return <TrainerRoster session={session} clients={selectable} />;

  // Members only see their own (or the couple's) sessions — the trainer's Home is a
  // different page, and now a different file (trainer-roster.tsx). Built after the
  // trainer branch: a trainer Home used to start this query and never await it.
  const upcomingPromise = db
    .select()
    .from(ptSessions)
    .where(
      and(
        gte(ptSessions.startsAt, now),
        eq(ptSessions.status, "scheduled"),
        or(isNull(ptSessions.memberUserId), eq(ptSessions.memberUserId, target.id)),
      ),
    )
    .orderBy(ptSessions.startsAt)
    .limit(20);

  const [upcoming, latestScans, firstBwiRows, recentWorkouts, latestNoteRows, workoutDates, goals] = await Promise.all([
    upcomingPromise,
    db
      .select(scanListColumns)
      .from(scans)
      .where(eq(scans.userId, target.id))
      .orderBy(desc(scans.scannedAt))
      .limit(2),
    // Where BWI started: the ring's baseline is the person's own first reading.
    db
      .select({ bwiScore: scans.bwiScore })
      .from(scans)
      .where(and(eq(scans.userId, target.id), isNotNull(scans.bwiScore)))
      .orderBy(asc(scans.scannedAt))
      .limit(1),
    db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, target.id))
      .orderBy(desc(workoutSessions.date))
      .limit(3),
    db
      .select({
        body: trainerNotes.body,
        createdAt: trainerNotes.createdAt,
        authorName: userTable.name,
      })
      .from(trainerNotes)
      .leftJoin(userTable, eq(userTable.id, trainerNotes.authorUserId))
      .where(eq(trainerNotes.memberUserId, target.id))
      .orderBy(desc(trainerNotes.createdAt))
      .limit(1),
    // Dates only: trainingStreakFromDates reads nothing else, so the streak
    // costs a one-column scan instead of loading every set on the busiest page.
    db
      .select({ date: workoutSessions.date })
      .from(workoutSessions)
      .where(eq(workoutSessions.userId, target.id)),
    getMetricGoals(target.id),
  ]);

  const [latestNote] = latestNoteRows;
  const [latest, previous] = latestScans;
  const streak = trainingStreakFromDates(workoutDates.map((w) => w.date));
  const nextSession = upcoming[0];
  const heroTarget = goals[HERO_KEY];
  const heroValue = latest ? (latest[HERO_KEY] as number | null) : null;
  const heroDelta =
    latest && previous
      ? metricDelta(heroValue, previous[HERO_KEY] as number | null, heroTarget)
      : null;
  // "to go" is wrong once the goal is behind you — say "past target" instead.
  const heroDistance =
    heroTarget && typeof heroValue === "number"
      ? Math.abs(heroValue - heroTarget.target)
      : null;
  const heroPast =
    heroTarget && typeof heroValue === "number"
      ? heroTarget.direction === "down"
        ? heroValue <= heroTarget.target
        : heroTarget.direction === "up"
          ? heroValue >= heroTarget.target
          : false
      : false;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Hi {session.user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-stone-600">
            {selectable.length > 1 ? `Viewing ${target.name}` : "Here's where things stand."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {selectable
            .filter((u) => u.id !== target.id)
            .map((u) => (
              <Link
                key={u.id}
                href={`/?user=${u.id}`}
                className="inline-flex min-h-11 items-center rounded-full border border-stone-300 px-4 text-sm text-stone-600 transition hover:border-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:outline-none"
              >
                Switch to {u.name}
              </Link>
            ))}
        </div>
      </div>

      {/* The number that leads. Body fat gets the space because it is what the
          household's logging actually moves; everything else is detail. */}
      <section className="rounded-2xl border border-stone-200 bg-white/70 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={microLabelCls}>{HERO_METRIC.label}</p>
            {latest ? (
              <>
                <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                  {fmt(latest[HERO_KEY] as number | null, HERO_METRIC.unit)}
                </p>
                {heroDelta?.text && previous && (
                  <p className={`mt-1 text-sm ${deltaToneCls(heroDelta.tone)}`}>
                    {heroDelta.arrow ? `${heroDelta.arrow} ` : ""}
                    {heroDelta.text}
                    {HERO_METRIC.unit ? ` ${HERO_METRIC.unit}` : ""} since {fmtDate(previous.scannedAt)}
                  </p>
                )}
                {heroTarget !== undefined && (
                  <p className="mt-1 text-xs text-stone-600">
                    Target {fmt(heroTarget.target, HERO_METRIC.unit)}
                    {heroDistance !== null && (
                      <>
                        {" · "}
                        {fmt(heroDistance, HERO_METRIC.unit)} {heroPast ? "past target" : "to go"}
                      </>
                    )}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-stone-600">
                No scans yet.{" "}
                <Link href="/scans/new" className="inline-flex min-h-11 items-center text-emerald-700 hover:underline">
                  Add your first Evolt scan →
                </Link>
              </p>
            )}
          </div>
          {latest && (
            <div className="text-right">
              <p className="text-xs text-stone-600">{fmtDate(latest.scannedAt)}</p>
              <Link
                href="/scans"
                className="mt-1 inline-flex min-h-11 items-center text-xs text-stone-600 hover:text-stone-700"
              >
                Trends &amp; compare →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Cadence — but only what is actually true. A strip reading "no streak
          yet · no scans yet" is nagging on day one, and absence is not news. */}
      {(streak > 0 || latest || nextSession) && (
        <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-stone-600">
            {streak > 0 && (
              <span>
                <span aria-hidden="true">🔥</span> {streak}-week workout streak
              </span>
            )}
            {latest && (
              <span>
                <span aria-hidden="true">📊</span> Last scan {fmtDaysAgo(latest.scannedAt)}
              </span>
            )}
            {nextSession && (
              <span>
                <span aria-hidden="true">📅</span> Next session {fmtDateTime(nextSession.startsAt)}
              </span>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* The rest of the scan numbers, behind the lead metric. With no scan
            the hero already carries the one useful thing — the CTA — so a
            placeholder card here would only repeat it. */}
        {latest && (
          <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
            <h2 className="mb-3 font-medium">📊 Latest scan</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <BwiRing
                score={latest.bwiScore}
                first={firstBwiRows[0]?.bwiScore ?? null}
                bioAge={latest.bioAge}
                goal={goals[BWI_KEY]}
              />
              {SECONDARY_METRICS.map((m) => {
                const delta = previous
                  ? metricDelta(
                      latest[m.key] as number | null,
                      previous[m.key] as number | null,
                      goals[m.key],
                    )
                  : null;
                return (
                  <div key={m.key} className="rounded-xl bg-stone-50 p-3">
                    <p className={microLabelCls}>{m.label}</p>
                    <p className="text-lg font-semibold tabular-nums">
                      {fmt(latest[m.key] as number | null, m.unit)}
                    </p>
                    {delta?.text && previous && (
                      <p className={`text-xs ${deltaToneCls(delta.tone)}`}>
                        {delta.arrow ? `${delta.arrow} ` : ""}
                        {delta.text}{m.unit ? ` ${m.unit}` : ""} vs {fmtDate(previous.scannedAt)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Next PT session */}
        <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
          <h2 className="mb-3 font-medium">📅 Next PT session</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-stone-600">
              Nothing scheduled.{" "}
              <Link href="/calendar" className="inline-flex min-h-11 items-center text-emerald-700 hover:underline">
                Open calendar →
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {upcoming.slice(0, 2).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-emerald-700">{fmtDateTime(s.startsAt)}</span>
                  <span className="text-stone-600">
                    {s.memberUserId === null ? "Couple session" : "Your session"}
                    {s.location ? ` · ${s.location}` : ""}
                  </span>
                </div>
              ))}
              <Link href="/calendar" className="inline-flex min-h-11 items-center text-xs text-stone-600 hover:text-stone-700">
                View calendar →
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* Latest coach note */}
      {latestNote && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-medium">💬 Coach note</h2>
            <Link href="/scans" className="inline-flex min-h-11 items-center text-xs text-stone-600 hover:text-stone-700">
              All notes →
            </Link>
          </div>
          <p className="max-w-prose text-sm leading-relaxed whitespace-pre-wrap">{latestNote.body}</p>
          <p className="mt-2 text-xs text-stone-600">
            {latestNote.authorName ?? "Your coach"} · {fmtDateTime(latestNote.createdAt)}
          </p>
        </section>
      )}

      {/* Recent workouts */}
      <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">🏋️ Recent workouts</h2>
          <Link href="/workouts" className="inline-flex min-h-11 items-center text-xs text-stone-600 hover:text-stone-700">
            All →
          </Link>
        </div>
        {recentWorkouts.length === 0 ? (
          <p className="text-sm text-stone-600">
            Nothing logged yet.{" "}
            <Link href="/workouts/new" className="inline-flex min-h-11 items-center text-emerald-700 hover:underline">
              Log the first one →
            </Link>
          </p>
        ) : (
          <div className="space-y-2">
            {recentWorkouts.map((w) => (
              <Link
                key={w.id}
                href={`/workouts/${w.id}`}
                className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm hover:bg-stone-100"
              >
                <span className="font-medium">{w.title}</span>
                <span className="text-stone-600">{fmtDate(w.date)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3 print:hidden">
        <Link
          href="/scans/new"
          className="rounded-2xl border border-stone-200 bg-white/70 p-5 text-center transition hover:border-emerald-600"
        >
          <p className="text-2xl">📸</p>
          <p className="mt-2 text-sm font-medium">Add scan</p>
        </Link>
        <Link
          href="/workouts/new"
          className="rounded-2xl border border-stone-200 bg-white/70 p-5 text-center transition hover:border-emerald-600"
        >
          <p className="text-2xl">🏋️</p>
          <p className="mt-2 text-sm font-medium">Log workout</p>
        </Link>
        <Link
          href="/diet"
          className="rounded-2xl border border-stone-200 bg-white/70 p-5 text-center transition hover:border-emerald-600"
        >
          <p className="text-2xl">🥗</p>
          <p className="mt-2 text-sm font-medium">Diet diary</p>
        </Link>
      </section>
    </div>
  );
}
