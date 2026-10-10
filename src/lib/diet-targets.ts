import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dietTargets } from "@/db/schema";
import { DIET_TARGET_FIELDS, type DietTargets } from "@/lib/diet-target-fields";

/** A person's daily targets, or null when none is set. */
export async function getDietTargets(userId: string): Promise<DietTargets | null> {
  const [row] = await db
    .select({
      calories: dietTargets.calories,
      proteinG: dietTargets.proteinG,
      carbsG: dietTargets.carbsG,
      fatG: dietTargets.fatG,
    })
    .from(dietTargets)
    .where(eq(dietTargets.userId, userId));
  if (!row) return null;
  return DIET_TARGET_FIELDS.some((f) => row[f.key] !== null) ? row : null;
}
