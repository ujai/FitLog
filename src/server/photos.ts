"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { progressPhotos } from "@/db/schema";
import { requireUser, canEditOwnData } from "@/lib/session";
import { isUuid, photoInput } from "@/lib/validation";
import { parseImageDataUrl } from "@/lib/image";
import { parseWallTimeInAppTz } from "@/lib/tz";

export async function createProgressPhoto(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  const parsed = photoInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  if (!canEditOwnData(session, input.userId)) return { ok: false, error: "Not allowed" };

  const image = formData.get("image");
  if (typeof image !== "string" || image.length === 0) {
    return { ok: false, error: "Photo is required" };
  }
  const parsedImage = parseImageDataUrl(image);
  if (!parsedImage) return { ok: false, error: "Image invalid or larger than 2 MB (after compression)" };

  // Zoneless datetime-local value — read as wall time in the app timezone.
  const takenAt = parseWallTimeInAppTz(input.takenAt);
  if (Number.isNaN(takenAt.getTime())) return { ok: false, error: "Invalid date" };

  await db.insert(progressPhotos).values({
    userId: input.userId,
    takenAt,
    notes: input.notes ?? null,
    imageMime: parsedImage.mime,
    imageData: parsedImage.buffer,
  });

  revalidatePath("/scans/photos");
  return { ok: true };
}

/** The image itself is immutable — editing changes only its date and note. */
export async function updateProgressPhoto(
  photoId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(photoId)) return { ok: false, error: "Not found" };

  const parsed = photoInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  const [row] = await db
    .select({ userId: progressPhotos.userId })
    .from(progressPhotos)
    .where(eq(progressPhotos.id, photoId));
  if (!row) return { ok: false, error: "Not found" };
  if (!canEditOwnData(session, row.userId)) return { ok: false, error: "Not allowed" };

  const takenAt = parseWallTimeInAppTz(input.takenAt);
  if (Number.isNaN(takenAt.getTime())) return { ok: false, error: "Invalid date" };

  await db
    .update(progressPhotos)
    .set({ takenAt, notes: input.notes ?? null })
    .where(eq(progressPhotos.id, photoId));

  revalidatePath("/scans/photos");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteProgressPhoto(photoId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(photoId)) return { ok: false, error: "Not found" };
  const [photo] = await db
    .select({ userId: progressPhotos.userId })
    .from(progressPhotos)
    .where(eq(progressPhotos.id, photoId));
  if (!photo) return { ok: false, error: "Not found" };
  if (!canEditOwnData(session, photo.userId)) return { ok: false, error: "Not allowed" };
  await db.delete(progressPhotos).where(eq(progressPhotos.id, photoId));
  revalidatePath("/scans/photos");
  return { ok: true };
}
