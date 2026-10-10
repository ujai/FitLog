import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth, type Session } from "@/lib/auth";
import { roleOf, type Role } from "./roles.ts";

/**
 * React cache() dedupes the session lookup per request: the (app) layout and
 * every page call requireUser(), and without this each paid its own DB round
 * trip for the same session.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  return await auth.api.getSession({ headers: await headers() });
});

export async function requireUser(): Promise<Session> {
  const session = await getSession();
  // "expired" is accurate: proxy.ts only lets a request through when a session
  // cookie is present, so arriving here without a session means the cookie is
  // stale (expired, signed out elsewhere, or its row was removed).
  if (!session) redirect("/login?expired=1");
  return session;
}

export async function requireRole(...roles: Role[]): Promise<Session> {
  const session = await requireUser();
  if (!roles.includes(role(session))) {
    throw new Error("Forbidden: insufficient role");
  }
  return session;
}

/**
 * The signed-in user's role, checked. Every `can*` helper and `requireRole` reads
 * it from here, so an unexpected value must not become a `Role` by assertion — it
 * reads as the least privileged role instead.
 */
export function role(session: Session): Role {
  return roleOf(session.user.role);
}

/** Can this viewer see the given user's private data (scans/workouts/diet)? */
export function canView(session: Session, targetUserId: string): boolean {
  if (session.user.id === targetUserId) return true;
  const r = role(session);
  return r === "admin" || r === "trainer";
}

/** Diet diary is strictly private: only the member themselves or the admin may see it (trainer has no read access). */
export function canViewDiet(session: Session, targetUserId: string): boolean {
  return session.user.id === targetUserId || role(session) === "admin";
}

/** Diet diary and progress photos are personal: members write their own, admins write anyone's, trainers write nobody's. */
export function canEditOwnData(session: Session, targetUserId: string): boolean {
  const r = role(session);
  if (r === "admin") return true;
  if (r === "trainer") return false;
  return session.user.id === targetUserId;
}

/**
 * Scans and tape measurements are strictly first-person body data: only the
 * owner ever writes them. Trainers have no scans of their own and never log
 * body data for members, and admins manage scans only for themselves too —
 * members own their body-composition history.
 */
export function canEditScanData(session: Session, targetUserId: string): boolean {
  return session.user.id === targetUserId;
}

/**
 * Scans are personal body-composition data for members (and the admin): a
 * trainer never has scans of their own, so nobody may create scan entries
 * targeted at a trainer account.
 */
export function canBeScanTarget(targetRole: string): boolean {
  return targetRole !== "trainer";
}

/**
 * Workout logging: members log their own sessions, trainers log for their
 * members (clients), and admins may log for anyone.
 */
export function canLogWorkout(
  session: Session,
  targetUserId: string,
  targetRole: string,
): boolean {
  const r = role(session);
  if (r === "admin") return true;
  if (r === "trainer") return targetRole === "member";
  return session.user.id === targetUserId;
}

/**
 * Coach notes: trainers leave check-in notes for their members, admins for
 * anyone. Members never write notes (only read their own).
 */
export function canLeaveNote(session: Session, targetRole: string): boolean {
  const r = role(session);
  if (r === "admin") return true;
  if (r === "trainer") return targetRole === "member";
  return false;
}
