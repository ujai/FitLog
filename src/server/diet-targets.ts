"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { dietTargets } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { DIET_TARGET_FIELDS, type DietTargets } from "@/lib/diet-target-fields";

/**
 * Save this person's daily food targets. First-person like body targets: you
 * set your own (usually what the dietician agreed with you), nobody sets yours.
 * A null clears that target.
 */
export async function saveDietTargets(input: DietTargets): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();

  const values: DietTargets = { calories: null, proteinG: null, carbsG: null, fatG: null };
  for (const field of DIET_TARGET_FIELDS) {
    const raw = input[field.key];
    if (raw === null) continue;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0 || raw > field.max) {
      return { ok: false, error: `${field.label} target must be between 1 and ${field.max} ${field.unit}` };
    }
    if (field.integer && !Number.isInteger(raw)) {
      return { ok: false, error: `${field.label} target must be a whole number` };
    }
    values[field.key] = raw;
  }

  await db
    .insert(dietTargets)
    .values({ userId: session.user.id, ...values })
    .onConflictDoUpdate({ target: dietTargets.userId, set: { ...values, updatedAt: new Date() } });

  revalidatePath("/account");
  revalidatePath("/diet");
  return { ok: true };
}
