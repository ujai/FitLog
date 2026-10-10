"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ptPackages, user } from "@/db/schema";
import { requireUser, role } from "@/lib/session";
import { isUuid } from "@/lib/validation";
import { parseWallTimeInAppTz } from "@/lib/tz";

const packageInput = z.object({
  memberUserId: z.string().min(1).max(100).nullable(),
  sessions: z.number().int().min(1, "At least 1 session").max(200, "At most 200 sessions"),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
  notes: z.string().trim().max(500).nullable(),
});

function revalidatePackageSurfaces() {
  revalidatePath("/calendar");
  revalidatePath("/");
}

/** Packages are the trainer's books: only a trainer or admin records them. */
export async function createPtPackage(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  const r = role(session);
  if (r !== "trainer" && r !== "admin") return { ok: false, error: "Not allowed" };

  const parsed = packageInput.safeParse({
    memberUserId: formData.get("memberUserId") || null,
    sessions: Number(formData.get("sessions")),
    startsOn: formData.get("startsOn"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const input = parsed.data;

  if (input.memberUserId) {
    const [target] = await db.select({ role: user.role }).from(user).where(eq(user.id, input.memberUserId));
    if (!target || target.role !== "member") return { ok: false, error: "Invalid participant" };
  }
  const startsOn = parseWallTimeInAppTz(`${input.startsOn}T00:00`);
  if (Number.isNaN(startsOn.getTime())) return { ok: false, error: "Invalid start date" };

  await db.insert(ptPackages).values({
    memberUserId: input.memberUserId,
    createdBy: session.user.id,
    sessions: input.sessions,
    startsOn,
    notes: input.notes || null,
  });
  revalidatePackageSurfaces();
  return { ok: true };
}

export async function deletePtPackage(packageId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  const r = role(session);
  if (r !== "trainer" && r !== "admin") return { ok: false, error: "Not allowed" };
  if (!isUuid(packageId)) return { ok: false, error: "Not found" };
  const deleted = await db.delete(ptPackages).where(eq(ptPackages.id, packageId)).returning({ id: ptPackages.id });
  if (deleted.length === 0) return { ok: false, error: "Not found" };
  revalidatePackageSurfaces();
  return { ok: true };
}
