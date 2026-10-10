"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { measurements } from "@/db/schema";
import { requireUser, canEditScanData } from "@/lib/session";
import { isUuid, measurementInput } from "@/lib/validation";
import { parseWallTimeInAppTz } from "@/lib/tz";

export async function createMeasurement(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  const parsed = measurementInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  if (!canEditScanData(session, input.userId)) return { ok: false, error: "Not allowed" };

  // Zoneless datetime-local value — read as wall time in the app timezone, not
  // the server's (UTC on Vercel).
  const measuredAt = parseWallTimeInAppTz(input.measuredAt);
  if (Number.isNaN(measuredAt.getTime())) return { ok: false, error: "Invalid date" };

  await db.insert(measurements).values({
    userId: input.userId,
    measuredAt,
    weightKg: input.weightKg,
    waistCm: input.waistCm,
    chestCm: input.chestCm,
    armCm: input.armCm,
    thighCm: input.thighCm,
    hipCm: input.hipCm,
    notes: input.notes ?? null,
  });

  revalidatePath("/scans");
  revalidatePath("/");
  return { ok: true };
}

export async function updateMeasurement(
  measurementId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(measurementId)) return { ok: false, error: "Not found" };

  const parsed = measurementInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  // Ownership comes from the stored row, never the submitted userId.
  const [row] = await db
    .select({ userId: measurements.userId })
    .from(measurements)
    .where(eq(measurements.id, measurementId));
  if (!row) return { ok: false, error: "Not found" };
  if (!canEditScanData(session, row.userId)) return { ok: false, error: "Not allowed" };

  const measuredAt = parseWallTimeInAppTz(input.measuredAt);
  if (Number.isNaN(measuredAt.getTime())) return { ok: false, error: "Invalid date" };

  await db
    .update(measurements)
    .set({
      measuredAt,
      weightKg: input.weightKg,
      waistCm: input.waistCm,
      chestCm: input.chestCm,
      armCm: input.armCm,
      thighCm: input.thighCm,
      hipCm: input.hipCm,
      notes: input.notes ?? null,
    })
    .where(eq(measurements.id, measurementId));

  revalidatePath("/scans");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteMeasurement(measurementId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(measurementId)) return { ok: false, error: "Not found" };
  const [row] = await db
    .select({ userId: measurements.userId })
    .from(measurements)
    .where(eq(measurements.id, measurementId));
  if (!row) return { ok: false, error: "Not found" };
  if (!canEditScanData(session, row.userId)) return { ok: false, error: "Not allowed" };
  await db.delete(measurements).where(eq(measurements.id, measurementId));
  revalidatePath("/scans");
  return { ok: true };
}
