"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ptSessions, user } from "@/db/schema";
import { requireUser, role } from "@/lib/session";
import { isUuid, ptSessionInput } from "@/lib/validation";
import { dateKeyAddDays, parseWallTimeInAppTz } from "@/lib/tz";
import { REPEAT_WEEKS } from "@/lib/calendar-repeat";

type SessionValues = Omit<typeof ptSessions.$inferInsert, "id">;

async function validateSessionInput(
  formData: FormData,
): Promise<{ ok: true; values: SessionValues; wallTime: string } | { ok: false; error: string }> {
  const session = await requireUser();
  const r = role(session);
  if (r !== "admin" && r !== "trainer") return { ok: false, error: "Only the trainer or admin can manage sessions" };

  const parsed = ptSessionInput.safeParse({
    trainerId: formData.get("trainerId"),
    memberUserId: formData.get("memberUserId") || null,
    startsAt: formData.get("startsAt"),
    durationMin: Number(formData.get("durationMin") ?? 60),
    location: formData.get("location") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  // trainerId comes from a hidden form field — derive it server-side instead:
  // trainers always schedule as themselves; admins may schedule for any trainer.
  let trainerId = input.trainerId;
  if (r === "trainer") {
    trainerId = session.user.id;
  } else {
    const [t] = await db.select({ role: user.role }).from(user).where(eq(user.id, trainerId));
    if (!t || t.role !== "trainer") return { ok: false, error: "Invalid trainer" };
  }

  // The datetime-local value carries no zone — read it as wall time in the app
  // timezone, not the server's (UTC on Vercel).
  const startsAt = parseWallTimeInAppTz(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "Invalid date/time" };

  if (input.memberUserId) {
    const [target] = await db.select({ role: user.role }).from(user).where(eq(user.id, input.memberUserId));
    if (!target || target.role !== "member") return { ok: false, error: "Invalid participant" };
  }

  return {
    ok: true,
    values: {
      trainerId,
      memberUserId: input.memberUserId,
      startsAt,
      durationMin: input.durationMin,
      location: input.location,
      notes: input.notes,
    },
    wallTime: input.startsAt,
  };
}

export async function createPtSession(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const v = await validateSessionInput(formData);
  if (!v.ok) return v;

  const repeatWeeks = Number(formData.get("repeatWeeks") ?? 1);
  if (!(REPEAT_WEEKS as readonly number[]).includes(repeatWeeks)) return { ok: false, error: "Invalid repeat" };

  // Each week is stepped on the wall-clock date, not by adding 7×24h to the
  // instant, so a DST change in APP_TZ cannot move the session's time of day.
  const [dateKey, time] = v.wallTime.trim().split(/[T ]/);
  const rows: SessionValues[] = [];
  for (let week = 0; week < repeatWeeks; week++) {
    const startsAt = parseWallTimeInAppTz(`${dateKeyAddDays(dateKey, week * 7)}T${time}`);
    if (Number.isNaN(startsAt.getTime())) return { ok: false, error: "A repeat falls on a time that does not exist" };
    rows.push({ ...v.values, startsAt });
  }
  // One statement, so a repeat series is saved whole or not at all.
  await db.insert(ptSessions).values(rows);

  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}

export async function updatePtSession(
  sessionId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!isUuid(sessionId)) return { ok: false, error: "Not found" };
  const session = await requireUser();
  const r = role(session);
  // trainers may only manage their own sessions
  const own = r === "admin"
    ? eq(ptSessions.id, sessionId)
    : and(eq(ptSessions.id, sessionId), eq(ptSessions.trainerId, session.user.id));

  const v = await validateSessionInput(formData);
  if (!v.ok) return v;

  const updated = await db.update(ptSessions).set(v.values).where(own).returning({ id: ptSessions.id });
  if (updated.length === 0) return { ok: false, error: "Not found" };

  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}

export async function updatePtSessionStatus(
  sessionId: string,
  status: "scheduled" | "done" | "cancelled",
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  const r = role(session);
  if (r !== "admin" && r !== "trainer") return { ok: false, error: "Not allowed" };
  if (!isUuid(sessionId)) return { ok: false, error: "Not found" };
  // trainers may only manage their own sessions
  const where = r === "admin"
    ? eq(ptSessions.id, sessionId)
    : and(eq(ptSessions.id, sessionId), eq(ptSessions.trainerId, session.user.id));
  const updated = await db.update(ptSessions).set({ status }).where(where).returning({ id: ptSessions.id });
  if (updated.length === 0) return { ok: false, error: "Not found" };
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}

export async function deletePtSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  const r = role(session);
  if (r !== "admin" && r !== "trainer") return { ok: false, error: "Not allowed" };
  if (!isUuid(sessionId)) return { ok: false, error: "Not found" };
  const where = r === "admin"
    ? eq(ptSessions.id, sessionId)
    : and(eq(ptSessions.id, sessionId), eq(ptSessions.trainerId, session.user.id));
  const deleted = await db.delete(ptSessions).where(where).returning({ id: ptSessions.id });
  if (deleted.length === 0) return { ok: false, error: "Not found" };
  revalidatePath("/calendar");
  revalidatePath("/");
  return { ok: true };
}

export async function regenerateIcsToken(): Promise<{ ok: boolean; url?: string; error?: string }> {
  const session = await requireUser();
  const token = randomBytes(24).toString("base64url");
  await db.update(user).set({ icsToken: token }).where(eq(user.id, session.user.id));
  revalidatePath("/account");
  return { ok: true, url: `/api/ics/${token}` };
}
