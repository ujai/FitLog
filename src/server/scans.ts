"use server";

import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiReviews, scanListColumns, scans, user } from "@/db/schema";
import { requireUser, canEditScanData, canBeScanTarget, role } from "@/lib/session";
import { isUuid, scanInput } from "@/lib/validation";
import { parseImageDataUrl } from "@/lib/image";
import { dateKeyInAppTz, parseWallTimeInAppTz } from "@/lib/tz";
import { rateLimit } from "@/lib/rate-limit";
import {
  reviewScanHistory,
  reviewSingleScan,
  extractScanFromImage,
  type ExtractedScan,
  type ScanPoint,
} from "@/lib/ai";

function toScanPoint(s: {
  scannedAt: Date;
  weightKg: number | null;
  bodyFatPct: number | null;
  bmr: number | null;
  leanBodyMassKg: number | null;
  skeletalMuscleMassKg: number | null;
  proteinKg: number | null;
  mineralKg: number | null;
  totalBodyWaterKg: number | null;
  bodyFatMassKg: number | null;
  subcutaneousFatMassKg: number | null;
  visceralFatMassKg: number | null;
  visceralFatAreaCm2: number | null;
  visceralFatLevel: number | null;
  icfKg: number | null;
  ecfKg: number | null;
  teeKcal: number | null;
  bioAge: number | null;
  bwiScore: number | null;
  abdominalCircumferenceCm: number | null;
  waistToHipRatio: number | null;
}): ScanPoint {
  return {
    scannedAt: dateKeyInAppTz(s.scannedAt),
    weightKg: s.weightKg,
    leanBodyMassKg: s.leanBodyMassKg,
    skeletalMuscleMassKg: s.skeletalMuscleMassKg,
    proteinKg: s.proteinKg,
    mineralKg: s.mineralKg,
    totalBodyWaterKg: s.totalBodyWaterKg,
    bodyFatMassKg: s.bodyFatMassKg,
    subcutaneousFatMassKg: s.subcutaneousFatMassKg,
    visceralFatMassKg: s.visceralFatMassKg,
    visceralFatAreaCm2: s.visceralFatAreaCm2,
    visceralFatLevel: s.visceralFatLevel,
    bodyFatPct: s.bodyFatPct,
    icfKg: s.icfKg,
    ecfKg: s.ecfKg,
    bmr: s.bmr,
    teeKcal: s.teeKcal,
    bioAge: s.bioAge,
    bwiScore: s.bwiScore,
    abdominalCircumferenceCm: s.abdominalCircumferenceCm,
    waistToHipRatio: s.waistToHipRatio,
  };
}

/** Ask Gemini to read metrics off an uploaded Evolt screenshot (for form prefill). */
export async function extractScanAction(
  imageDataUrls: string[],
): Promise<{ ok: true; data: ExtractedScan } | { ok: false; error: string }> {
  const session = await requireUser();
  if (role(session) === "trainer") return { ok: false, error: "Not allowed" };
  if (!rateLimit(`ai:${session.user.id}`, 10, 60_000)) {
    return { ok: false, error: "Too many AI requests — try again in a minute" };
  }
  const images = imageDataUrls
    .slice(0, 6)
    .map((dataUrl) => parseImageDataUrl(dataUrl))
    .filter((image) => image !== null);
  if (images.length === 0) return { ok: false, error: "Invalid image or larger than 2 MB" };
  try {
    const data = await extractScanFromImage(images);
    return { ok: true, data };
  } catch (e) {
    console.error("Scan screenshot extraction failed:", e);
    const reason =
      e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 140) : "unknown error";
    return { ok: false, error: `Could not read the screenshot (${reason})` };
  }
}

export async function createScan(formData: FormData): Promise<{ ok: true; scanId: string } | { ok: false; error: string }> {
  const session = await requireUser();
  const parsed = scanInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  if (!canEditScanData(session, input.userId)) return { ok: false, error: "Not allowed" };

  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, input.userId));
  if (!target || !canBeScanTarget(target.role)) {
    return { ok: false, error: "Scans are only for members — trainers don't have scans" };
  }

  const image = formData.get("image");
  let imageMime: string | null = null;
  let imageData: Buffer | null = null;
  if (typeof image === "string" && image.length > 0) {
    const parsedImage = parseImageDataUrl(image);
    if (!parsedImage) return { ok: false, error: "Image invalid or larger than 2 MB (after compression)" };
    imageMime = parsedImage.mime;
    imageData = parsedImage.buffer;
  }

  // Zoneless datetime-local value — read as wall time in the app timezone, not
  // the server's (UTC on Vercel).
  const scannedAt = parseWallTimeInAppTz(input.scannedAt);
  if (Number.isNaN(scannedAt.getTime())) return { ok: false, error: "Invalid scan date" };

  const [created] = await db
    .insert(scans)
    .values({
      userId: input.userId,
      scannedAt,
      weightKg: input.weightKg,
      bodyFatPct: input.bodyFatPct,
      bmr: input.bmr,
      leanBodyMassKg: input.leanBodyMassKg,
      skeletalMuscleMassKg: input.skeletalMuscleMassKg,
      proteinKg: input.proteinKg,
      mineralKg: input.mineralKg,
      totalBodyWaterKg: input.totalBodyWaterKg,
      bodyFatMassKg: input.bodyFatMassKg,
      subcutaneousFatMassKg: input.subcutaneousFatMassKg,
      visceralFatMassKg: input.visceralFatMassKg,
      visceralFatAreaCm2: input.visceralFatAreaCm2,
      visceralFatLevel: input.visceralFatLevel,
      icfKg: input.icfKg,
      ecfKg: input.ecfKg,
      teeKcal: input.teeKcal,
      bioAge: input.bioAge,
      bwiScore: input.bwiScore,
      abdominalCircumferenceCm: input.abdominalCircumferenceCm,
      waistToHipRatio: input.waistToHipRatio,
      notes: input.notes ?? null,
      imageMime,
      imageData,
    })
    .returning({ id: scans.id });

  revalidatePath("/scans");
  revalidatePath("/");
  return { ok: true, scanId: created.id };
}

/**
 * Correct the numbers on an existing scan — the attached screenshot stays put,
 * so a value the AI misread can be fixed without losing the source image.
 */
export async function updateScan(
  scanId: string,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(scanId)) return { ok: false, error: "Not found" };

  const parsed = scanInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Invalid input: " + parsed.error.issues[0].message };
  const input = parsed.data;

  // Ownership comes from the stored row, never the submitted userId.
  const [row] = await db.select({ userId: scans.userId }).from(scans).where(eq(scans.id, scanId));
  if (!row) return { ok: false, error: "Not found" };
  if (!canEditScanData(session, row.userId)) return { ok: false, error: "Not allowed" };

  const scannedAt = parseWallTimeInAppTz(input.scannedAt);
  if (Number.isNaN(scannedAt.getTime())) return { ok: false, error: "Invalid scan date" };

  await db
    .update(scans)
    .set({
      scannedAt,
      weightKg: input.weightKg,
      bodyFatPct: input.bodyFatPct,
      bmr: input.bmr,
      leanBodyMassKg: input.leanBodyMassKg,
      skeletalMuscleMassKg: input.skeletalMuscleMassKg,
      proteinKg: input.proteinKg,
      mineralKg: input.mineralKg,
      totalBodyWaterKg: input.totalBodyWaterKg,
      bodyFatMassKg: input.bodyFatMassKg,
      subcutaneousFatMassKg: input.subcutaneousFatMassKg,
      visceralFatMassKg: input.visceralFatMassKg,
      visceralFatAreaCm2: input.visceralFatAreaCm2,
      visceralFatLevel: input.visceralFatLevel,
      icfKg: input.icfKg,
      ecfKg: input.ecfKg,
      teeKcal: input.teeKcal,
      bioAge: input.bioAge,
      bwiScore: input.bwiScore,
      abdominalCircumferenceCm: input.abdominalCircumferenceCm,
      waistToHipRatio: input.waistToHipRatio,
      notes: input.notes ?? null,
    })
    .where(eq(scans.id, scanId));

  revalidatePath("/scans");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteScan(scanId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireUser();
  if (!isUuid(scanId)) return { ok: false, error: "Not found" };
  // Only the owner is needed to authorise the delete — selecting the whole row
  // would pull the screenshot (up to 2 MB) out of Postgres just to throw it away.
  const [scan] = await db.select({ userId: scans.userId }).from(scans).where(eq(scans.id, scanId));
  if (!scan) return { ok: false, error: "Not found" };
  if (!canEditScanData(session, scan.userId)) return { ok: false, error: "Not allowed" };
  await db.delete(scans).where(eq(scans.id, scanId));
  revalidatePath("/scans");
  revalidatePath("/");
  return { ok: true };
}

export async function generateScanReview(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireUser();
  if (!canEditScanData(session, userId)) return { ok: false, error: "Not allowed" };
  if (!rateLimit(`ai:${session.user.id}`, 10, 60_000)) {
    return { ok: false, error: "Too many AI requests — try again in a minute" };
  }

  const history = await db
    .select(scanListColumns)
    .from(scans)
    .where(eq(scans.userId, userId))
    .orderBy(asc(scans.scannedAt));

  if (history.length === 0) return { ok: false, error: "No scans to review yet" };

  try {
    const review = await reviewScanHistory({
      name: userId === session.user.id ? session.user.name : "the member",
      scans: history.map(toScanPoint),
    });

    // One statement, so a failure cannot leave the person with no review at all
    // and two concurrent refreshes cannot delete each other's row. The conflict
    // target is the partial unique index on (user_id, kind) WHERE kind='progress',
    // which has to be named here for Postgres to infer it.
    await db
      .insert(aiReviews)
      .values({
        userId,
        kind: "progress",
        summary: review.summary,
        pointers: { positives: review.positives, focus: review.focus },
        model: review.model,
      })
      .onConflictDoUpdate({
        target: [aiReviews.userId, aiReviews.kind],
        targetWhere: sql`${aiReviews.kind} = 'progress'`,
        set: {
          summary: review.summary,
          pointers: { positives: review.positives, focus: review.focus },
          model: review.model,
          createdAt: new Date(),
        },
      });

    revalidatePath("/scans");
    return { ok: true };
  } catch (e) {
    console.error("AI scan review failed:", e);
    return { ok: false, error: "AI review failed — please try again" };
  }
}

/** Review a single scan in the context of its two most recent predecessors. */
export async function generateScanReviewForScan(
  scanId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireUser();
  if (!isUuid(scanId)) return { ok: false, error: "Not found" };

  const [scan] = await db.select(scanListColumns).from(scans).where(eq(scans.id, scanId));
  if (!scan) return { ok: false, error: "Not found" };
  if (!canEditScanData(session, scan.userId)) return { ok: false, error: "Not allowed" };
  if (!rateLimit(`ai:${session.user.id}`, 10, 60_000)) {
    return { ok: false, error: "Too many AI requests — try again in a minute" };
  }

  const previousRows = await db
    .select(scanListColumns)
    .from(scans)
    .where(and(eq(scans.userId, scan.userId), lt(scans.scannedAt, scan.scannedAt)))
    .orderBy(desc(scans.scannedAt))
    .limit(2);
  const previous = [...previousRows].reverse(); // oldest first

  try {
    const review = await reviewSingleScan({
      name: scan.userId === session.user.id ? session.user.name : "the member",
      scan: toScanPoint(scan),
      previous: previous.map(toScanPoint),
    });

    // Same reasoning as the progress review: refresh in one statement rather
    // than deleting the only copy first. Conflict target is the partial unique
    // index on (user_id, scan_id) WHERE kind='scan'.
    await db
      .insert(aiReviews)
      .values({
        userId: scan.userId,
        scanId,
        kind: "scan",
        summary: review.summary,
        pointers: { positives: review.positives, focus: review.focus },
        model: review.model,
      })
      .onConflictDoUpdate({
        target: [aiReviews.userId, aiReviews.scanId],
        targetWhere: sql`${aiReviews.kind} = 'scan'`,
        set: {
          summary: review.summary,
          pointers: { positives: review.positives, focus: review.focus },
          model: review.model,
          createdAt: new Date(),
        },
      });

    revalidatePath("/scans");
    return { ok: true };
  } catch (e) {
    console.error("AI per-scan review failed:", e);
    return { ok: false, error: "AI review failed — please try again" };
  }
}
