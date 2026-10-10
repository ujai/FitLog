import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { ptSessions, user } from "@/db/schema";
import { roleOf } from "@/lib/roles";

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function icsDate(d: Date): string {
  return (
    d.getUTCFullYear().toString().padStart(4, "0") +
    (d.getUTCMonth() + 1).toString().padStart(2, "0") +
    d.getUTCDate().toString().padStart(2, "0") +
    "T" +
    d.getUTCHours().toString().padStart(2, "0") +
    d.getUTCMinutes().toString().padStart(2, "0") +
    "00Z"
  );
}

function fold(line: string): string {
  // RFC 5545: lines longer than 75 octets must be folded
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  return parts.join("\r\n");
}

/**
 * Personal ICS feed so each person can subscribe in Google/Apple Calendar.
 * Authenticated by an unguessable per-user token (regenerable in Account).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const [owner] = await db.select().from(user).where(eq(user.icsToken, token));
  if (!owner) return new NextResponse("Not found", { status: 404 });

  // Bound the feed window so it stays finite: half a year of history, a year ahead
  const windowStart = new Date(Date.now() - 180 * 86_400_000);
  const windowEnd = new Date(Date.now() + 365 * 86_400_000);

  // Scoped in SQL, not after the fact. The feed carries PT notes and locations, so
  // a dropped filter here would publish everyone's to whoever holds the token.
  const ownerRole = roleOf(owner.role);
  const seesAll = ownerRole === "trainer" || ownerRole === "admin";

  const sessions = await db
    .select({
      id: ptSessions.id,
      startsAt: ptSessions.startsAt,
      durationMin: ptSessions.durationMin,
      location: ptSessions.location,
      notes: ptSessions.notes,
      status: ptSessions.status,
      trainerId: ptSessions.trainerId,
      memberUserId: ptSessions.memberUserId,
    })
    .from(ptSessions)
    .where(
      and(
        gte(ptSessions.startsAt, windowStart),
        lte(ptSessions.startsAt, windowEnd),
        seesAll
          ? undefined
          : or(isNull(ptSessions.memberUserId), eq(ptSessions.memberUserId, owner.id)),
      ),
    )
    .orderBy(asc(ptSessions.startsAt));

  const allUsers = await db.select({ id: user.id, name: user.name, role: user.role }).from(user);
  const nameById = new Map(allUsers.map((u) => [u.id, u]));
  const trainer = allUsers.find((u) => u.role === "trainer");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HealthTracker//PT Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(`PT Sessions${trainer ? ` — ${trainer.name}` : ""}`)}`,
  ];

  for (const s of sessions) {
    const end = new Date(s.startsAt.getTime() + s.durationMin * 60_000);
    const memberName = s.memberUserId ? nameById.get(s.memberUserId)?.name : "Both";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@healthtracker`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(s.startsAt)}`,
      `DTEND:${icsDate(end)}`,
      fold(`SUMMARY:${icsEscape(s.status === "cancelled" ? "[Cancelled] PT session" : `PT — ${memberName ?? "Session"}`)}`),
    );
    if (s.location) lines.push(fold(`LOCATION:${icsEscape(s.location)}`));
    const descParts: string[] = [];
    if (s.notes) descParts.push(s.notes);
    if (s.status === "done") descParts.push("(completed)");
    if (descParts.length) lines.push(fold(`DESCRIPTION:${icsEscape(descParts.join(" — "))}`));
    if (s.status === "cancelled") lines.push("STATUS:CANCELLED");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="pt-sessions.ics"',
    },
  });
}
