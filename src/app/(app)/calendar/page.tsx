import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { ptPackages, ptSessions, user as userTable } from "@/db/schema";
import { packageBalances } from "@/lib/packages";
import { PackagesPanel } from "./packages-panel";
import { requireUser, role } from "@/lib/session";
import { btnSecondaryCls } from "@/components/controls";
import { CalendarGrid, type GridDay } from "./calendar-grid";
import { NewSessionButton } from "./new-session-button";
import { NextSession } from "./next-session";
import { SessionActions } from "./session-actions";
import { fmtDateTime } from "@/lib/format";
import { dateKeyInAppTz } from "@/lib/tz";
import { monthRange } from "@/lib/month";

export const metadata: Metadata = { title: "PT Calendar" };

export default async function CalendarPage({
  searchParams,
}: PageProps<"/calendar">) {
  const session = await requireUser();
  const params = await searchParams;
  const r = role(session);
  const canManage = r === "admin" || r === "trainer";

  const { start, end, label, prev, next, year, month, key } = monthRange(params.month);

  const now = new Date();
  // Scoped in SQL, never in JavaScript afterwards: a member may see their own
  // sessions and the couple's (a null member), trainers and admins everything.
  // The dashboard already queries this way. Loading the month unscoped and
  // dropping rows later made this page one forgotten filter away from showing
  // everyone's PT notes and locations.
  const visible = canManage
    ? undefined
    : or(isNull(ptSessions.memberUserId), eq(ptSessions.memberUserId, session.user.id));

  // The lead is the next session from *now*, not from the month on screen, so it
  // stays the answer while somebody browses history. A session already under way
  // counts as next: it started in the past but its duration has not run out, and
  // without that clause the card would count down to the following week while the
  // household is mid-session. Ordering ascending puts the running one first.
  const nextUp = db
    .select({
      id: ptSessions.id,
      startsAt: ptSessions.startsAt,
      durationMin: ptSessions.durationMin,
      location: ptSessions.location,
      notes: ptSessions.notes,
      memberUserId: ptSessions.memberUserId,
    })
    .from(ptSessions)
    .where(
      and(
        eq(ptSessions.status, "scheduled"),
        or(
          gte(ptSessions.startsAt, now),
          // `now.toISOString()`, not `now`: a raw sql fragment is not a typed
          // column, so nothing converts a Date for postgres-js, which rejects it.
          sql`${ptSessions.startsAt} + ${ptSessions.durationMin} * interval '1 minute' > ${now.toISOString()}::timestamptz`,
        ),
        visible,
      ),
    )
    .orderBy(asc(ptSessions.startsAt))
    .limit(1);

  const visiblePackages = canManage
    ? undefined
    : or(isNull(ptPackages.memberUserId), eq(ptPackages.memberUserId, session.user.id));

  const [sessions, users, nextRows, packages, held] = await Promise.all([
    db
      .select({
        id: ptSessions.id,
        startsAt: ptSessions.startsAt,
        durationMin: ptSessions.durationMin,
        location: ptSessions.location,
        notes: ptSessions.notes,
        status: ptSessions.status,
        memberUserId: ptSessions.memberUserId,
        trainerId: ptSessions.trainerId,
      })
      .from(ptSessions)
      .where(and(gte(ptSessions.startsAt, start), lt(ptSessions.startsAt, end), visible))
      .orderBy(asc(ptSessions.startsAt)),
    db
      .select({ id: userTable.id, name: userTable.name, role: userTable.role })
      .from(userTable)
      .orderBy(asc(userTable.name)),
    nextUp,
    db
      .select({
        id: ptPackages.id,
        memberUserId: ptPackages.memberUserId,
        createdBy: ptPackages.createdBy,
        sessions: ptPackages.sessions,
        startsOn: ptPackages.startsOn,
        notes: ptPackages.notes,
      })
      .from(ptPackages)
      .where(visiblePackages)
      .orderBy(desc(ptPackages.startsOn)),
    // Only done sessions use a package up; a cancelled one costs nothing.
    db
      .select({ memberUserId: ptSessions.memberUserId, startsAt: ptSessions.startsAt })
      .from(ptSessions)
      .where(and(eq(ptSessions.status, "done"), visible)),
  ]);
  const balances = packageBalances(packages, held);
  const nameById = new Map(users.map((u) => [u.id, u]));
  const trainer = users.find((u) => u.role === "trainer");

  // Grid cells are calendar dates in the app timezone. Weekday math runs in UTC
  // on the calendar date itself — a date has the same weekday in every zone.
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday=0

  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = dateKeyInAppTz(s.startsAt);
    const list = byDay.get(key) ?? [];
    list.push(s);
    byDay.set(key, list);
  }

  const todayKey = dateKeyInAppTz(now);

  const pad = (n: number) => String(n).padStart(2, "0");
  const days: GridDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month, 1 - firstWeekday + i));
    const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    days.push({
      key,
      dayNumber: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month,
      isToday: key === todayKey,
      sessions: byDay.get(key) ?? [],
    });
  }

  const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const members = users.filter((u) => u.role === "member");

  const nextSession = nextRows[0] ?? null;
  // The same row reads from two sides: a member's own session is "Your session",
  // while the trainer reading it wants to know whose it is. A couple session has
  // no member to name — the grid's own word for it is "Both".
  const nextWho =
    nextSession === null
      ? ""
      : nextSession.memberUserId === null
        ? canManage
          ? "Both"
          : "Couple session"
        : canManage
          ? (nameById.get(nextSession.memberUserId)?.name ?? "Member")
          : "Your session";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">PT Calendar</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* The month's own handout, so it carries the month you are looking at
              rather than the current one. */}
          <Link href={`/calendar/print?month=${key}`} className={btnSecondaryCls}>
            In review
          </Link>
          {canManage && (
            <NewSessionButton
              trainerId={trainer?.id ?? session.user.id}
              members={members}
            />
          )}
        </div>
      </div>

      {/* The lead answers the page's question before the month does. */}
      <NextSession session={nextSession} who={nextWho} canManage={canManage} now={now} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <Link
            href={`/calendar?month=${prev}`}
            aria-label="Previous month"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-300 transition hover:border-stone-400"
          >
            ←
          </Link>
          <span className="min-w-36 text-center font-medium">{label}</span>
          <Link
            href={`/calendar?month=${next}`}
            aria-label="Next month"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-300 transition hover:border-stone-400"
          >
            →
          </Link>
        </div>

        <CalendarGrid
          days={days}
          names={names}
          canManage={canManage}
          trainerId={trainer?.id ?? session.user.id}
          members={members}
        />
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Sessions in {label}</h2>
        {sessions.length === 0 && <p className="text-sm text-stone-600">Nothing scheduled this month.</p>}
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white/70 p-4"
          >
            <div>
              <p className={`text-sm font-medium ${s.status === "cancelled" ? "text-stone-600 line-through" : ""}`}>
                {fmtDateTime(s.startsAt)} · {s.memberUserId ? nameById.get(s.memberUserId)?.name : "Both"} · {s.durationMin} min
              </p>
              {(s.location || s.notes) && (
                <p className="text-xs text-stone-600">
                  {[s.location, s.notes].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
            {canManage && (
              <SessionActions
                id={s.id}
                status={s.status}
                startsAt={s.startsAt}
                durationMin={s.durationMin}
                memberUserId={s.memberUserId}
                location={s.location}
                notes={s.notes}
                trainerId={trainer?.id ?? session.user.id}
                members={members}
              />
            )}
          </div>
        ))}
      </section>

      <PackagesPanel
        balances={balances}
        packages={packages.map((p) => ({
          ...p,
          addedByName: p.createdBy ? (nameById.get(p.createdBy)?.name ?? null) : null,
        }))}
        canManage={canManage}
        members={members}
        nameOf={(memberUserId) =>
          memberUserId === null
            ? "Both (couple)"
            : !canManage && memberUserId === session.user.id
              ? "You"
              : (nameById.get(memberUserId)?.name ?? "Member")
        }
        today={todayKey}
      />
    </div>
  );
}
