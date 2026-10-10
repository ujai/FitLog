import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { aiReviews, scanListColumns, scans, trainerNotes, user as userTable, workoutSessions } from "@/db/schema";
import { requireUser, role, canLeaveNote, canEditScanData } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { UserTabs } from "@/components/user-tabs";
import { TrendChart } from "@/components/trend-chart";
import { ReviewButton } from "@/components/review-button";
import { ProgressReview } from "./progress-review";
import { ScanList } from "./scan-list";
import { CoachNotes } from "@/components/coach-notes";
import { getMetricGoals } from "@/lib/goals";
import { METRICS } from "@/lib/metrics";
import { dateKeyInAppTz } from "@/lib/tz";

export const metadata: Metadata = { title: "Scans" };

export default async function ScansPage({
  searchParams,
}: PageProps<"/scans">) {
  const session = await requireUser();
  const { user: userParam } = await searchParams;
  const { selectable, target } = await resolveViewer(session, userParam, { hideTrainer: true });
  const isTrainer = role(session) === "trainer";
  // Scans and tape measurements are first-person data: write controls only on
  // your own page — never when viewing a member's scans.
  const canEdit = canEditScanData(session, target.id);

  const [history, reviewRows, notes, scanReviews, goals] = await Promise.all([
    db
      .select(scanListColumns)
      .from(scans)
      .where(eq(scans.userId, target.id))
      .orderBy(desc(scans.scannedAt)),
    db
      .select()
      .from(aiReviews)
      .where(and(eq(aiReviews.userId, target.id), eq(aiReviews.kind, "progress")))
      .limit(1),
    db
      .select({
        id: trainerNotes.id,
        body: trainerNotes.body,
        createdAt: trainerNotes.createdAt,
        authorId: trainerNotes.authorUserId,
        authorName: userTable.name,
        workoutId: workoutSessions.id,
        workoutTitle: workoutSessions.title,
      })
      .from(trainerNotes)
      .leftJoin(userTable, eq(userTable.id, trainerNotes.authorUserId))
      .leftJoin(workoutSessions, eq(workoutSessions.id, trainerNotes.workoutSessionId))
      .where(eq(trainerNotes.memberUserId, target.id))
      .orderBy(desc(trainerNotes.createdAt)),
    db
      .select()
      .from(aiReviews)
      .where(and(eq(aiReviews.userId, target.id), eq(aiReviews.kind, "scan"))),
    getMetricGoals(target.id),
  ]);
  const [review] = reviewRows;
  const canNote = canLeaveNote(session, target.role);

  const chartData = [...history]
    .sort((a, b) => a.scannedAt.getTime() - b.scannedAt.getTime())
    .map((s) => ({
      date: dateKeyInAppTz(s.scannedAt),
      // Numeric timestamp for the time-scaled axis — see Sparklines.
      ts: s.scannedAt.getTime(),
      ...Object.fromEntries(METRICS.map((m) => [m.key, s[m.key]])),
    }));

  // The progress review's pointers are narrowed inside ProgressReview, and each
  // scan's inside ScanList — both own the shape of that json column where it is
  // rendered, so this route no longer carries either.

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Body composition scans</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/scans/measurements${target.id !== session.user.id ? `?user=${target.id}` : ""}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 transition hover:border-emerald-600"
          >
            📏 Measurements
          </Link>
          <Link
            href={`/scans/photos${target.id !== session.user.id ? `?user=${target.id}` : ""}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-600 transition hover:border-emerald-600"
          >
            📷 Photos
          </Link>
          {history.length > 0 && canEdit && <ReviewButton userId={target.id} />}
          {canEdit && (
            <Link
              href={`/scans/new${target.id !== session.user.id ? `?user=${target.id}` : ""}`}
              className="inline-flex min-h-11 items-center rounded-lg border border-emerald-600 px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              + New scan
            </Link>
          )}
        </div>
      </div>

      <UserTabs users={selectable} activeId={target.id} />

      {history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-600">
          <p className="mb-2 text-3xl">📊</p>
          No scans yet for {target.name}.
          <br />
          Upload an Evolt screenshot and let AI fill in the numbers.
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
            <h2 className="mb-2 font-medium">Trends</h2>
            <TrendChart data={chartData} goals={goals} />
          </section>

          {review && <ProgressReview review={review} name={target.name} />}

          <ScanList
            history={history}
            reviews={scanReviews}
            userIds={selectable}
            targetId={target.id}
            canEdit={canEdit}
            isTrainer={isTrainer}
          />
        </>
      )}

      <CoachNotes
        notes={notes}
        targetId={target.id}
        targetName={target.name}
        canNote={canNote}
        viewerId={session.user.id}
        isAdmin={role(session) === "admin"}
      />
    </div>
  );
}
