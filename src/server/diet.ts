"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meals } from "@/db/schema";
import { requireUser, canEditOwnData } from "@/lib/session";
import { isUuid, mealInput } from "@/lib/validation";
import { parseImageDataUrl } from "@/lib/image";
import { parseWallTimeInAppTz } from "@/lib/tz";
import { rateLimit } from "@/lib/rate-limit";
import { extractMealFromImage, type ExtractedMeal } from "@/lib/ai";

/** Ask Gemini to estimate macros from a meal photo (for form prefill). */
export async function extractMealAction(
  imageDataUrl: string,
): Promise<{ ok: true; data: ExtractedMeal } | { ok: false; error: string }> {
  const session = await requireUser();
  if (!rateLimit(`ai:${session.user.id}`, 10, 60_000)) {
    return { ok: false, error: "Too many AI requests — try again in a minute" };
  }
  const image = parseImageDataUrl(imageDataUrl);
  if (!image) return { ok: false, error: "Invalid image or larger than 2 MB" };
  try {
    const data = await extractMealFromImage(image.base64, image.mime);
    return { ok: true, data };
  } catch (e) {
    console.error("Meal photo analysis failed:", e);
    return { ok: false, error: "Could not analyse the photo — you can fill in the details manually" };
  }
}

export async function createMeal(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  const parsed = mealInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  if (!canEditOwnData(session, input.userId)) return { ok: false, error: "Not allowed" };

  // Zoneless datetime-local value — read as wall time in the app timezone, not
  // the server's (UTC on Vercel).
  const loggedAt = parseWallTimeInAppTz(input.loggedAt);
  if (Number.isNaN(loggedAt.getTime())) return { ok: false, error: "Invalid date/time" };

  const image = formData.get("image");
  let imageMime: string | null = null;
  let imageData: Buffer | null = null;
  if (typeof image === "string" && image.length > 0) {
    const parsedImage = parseImageDataUrl(image);
    if (!parsedImage) return { ok: false, error: "Image invalid or larger than 2 MB (after compression)" };
    imageMime = parsedImage.mime;
    imageData = parsedImage.buffer;
  }

  await db.insert(meals).values({
    userId: input.userId,
    loggedAt,
    mealType: input.mealType,
    description: input.description,
    calories: input.calories,
    proteinG: input.proteinG,
    carbsG: input.carbsG,
    fatG: input.fatG,
    notes: input.notes ?? null,
    imageMime,
    imageData,
  });

  revalidatePath("/diet");
  return { ok: true };
}

/**
 * Editing a meal must never drop its photo: the stored bytes are only replaced
 * when a new image is posted with the form.
 */
export async function updateMeal(
  mealId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(mealId)) return { ok: false, error: "Not found" };

  const parsed = mealInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  // Ownership comes from the stored row, never the submitted userId.
  const [row] = await db.select({ userId: meals.userId }).from(meals).where(eq(meals.id, mealId));
  if (!row) return { ok: false, error: "Not found" };
  if (!canEditOwnData(session, row.userId)) return { ok: false, error: "Not allowed" };

  const loggedAt = parseWallTimeInAppTz(input.loggedAt);
  if (Number.isNaN(loggedAt.getTime())) return { ok: false, error: "Invalid date/time" };

  const values: {
    loggedAt: Date;
    mealType: "breakfast" | "lunch" | "dinner" | "snack";
    description: string;
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    notes: string | null;
    imageMime?: string;
    imageData?: Buffer;
  } = {
    loggedAt,
    mealType: input.mealType,
    description: input.description,
    calories: input.calories,
    proteinG: input.proteinG,
    carbsG: input.carbsG,
    fatG: input.fatG,
    notes: input.notes ?? null,
  };

  const image = formData.get("image");
  if (typeof image === "string" && image.length > 0) {
    const parsedImage = parseImageDataUrl(image);
    if (!parsedImage) return { ok: false, error: "Image invalid or larger than 2 MB (after compression)" };
    values.imageMime = parsedImage.mime;
    values.imageData = parsedImage.buffer;
  }

  await db.update(meals).set(values).where(eq(meals.id, mealId));

  revalidatePath("/diet");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Log the same meal again now — the fast path for a repeated breakfast or a
 * standard lunch. The photo comes along with it.
 */
export async function repeatMeal(mealId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(mealId)) return { ok: false, error: "Not found" };

  const [row] = await db.select().from(meals).where(eq(meals.id, mealId));
  if (!row) return { ok: false, error: "Not found" };
  if (!canEditOwnData(session, row.userId)) return { ok: false, error: "Not allowed" };

  await db.insert(meals).values({
    userId: row.userId,
    loggedAt: new Date(),
    mealType: row.mealType,
    description: row.description,
    calories: row.calories,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    notes: row.notes,
    imageMime: row.imageMime,
    imageData: row.imageData,
  });

  revalidatePath("/diet");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteMeal(mealId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(mealId)) return { ok: false, error: "Not found" };
  // Only the owner is needed to authorise the delete — selecting the whole row
  // would pull the meal photo out of Postgres just to throw it away.
  const [meal] = await db.select({ userId: meals.userId }).from(meals).where(eq(meals.id, mealId));
  if (!meal) return { ok: false, error: "Not found" };
  if (!canEditOwnData(session, meal.userId)) return { ok: false, error: "Not allowed" };
  await db.delete(meals).where(eq(meals.id, mealId));
  revalidatePath("/diet");
  revalidatePath("/");
  return { ok: true };
}
