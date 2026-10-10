"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { meals, measurements, scans } from "@/db/schema";
import { requireUser, role, canBeScanTarget } from "@/lib/session";
import { buildImportRows, IMPORT_DOMAINS, type ImportDomain } from "@/lib/csv-import";

const MAX_IMPORT_BYTES = 1024 * 1024;

type ImportResult = { ok: true; imported: number; skipped: number } | { ok: false; errors: string[] };

/**
 * Import the signed-in person's own history from a CSV in the export format.
 * Strictly first-person, like every body-data write: there is no target user,
 * the rows always belong to the caller. All-or-nothing: one bad line imports
 * nothing, so a half-loaded file never has to be untangled by hand. A row whose
 * timestamp is already stored is skipped, so re-importing an export is safe.
 */
export async function importCsv(domain: string, text: string): Promise<ImportResult> {
  const session = await requireUser();
  if (!(IMPORT_DOMAINS as readonly string[]).includes(domain)) return { ok: false, errors: ["Unknown data type"] };
  const kind = domain as ImportDomain;
  if (typeof text !== "string" || text.length === 0) return { ok: false, errors: ["The file is empty"] };
  if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: ["The file is larger than 1 MB"] };

  const r = role(session);
  if (kind === "scans" && !canBeScanTarget(r)) return { ok: false, errors: ["Trainers don't have scans"] };
  if (kind === "meals" && r === "trainer") return { ok: false, errors: ["Trainers don't have a diet diary"] };

  const built = buildImportRows(kind, text, session.user.id);
  if (!built.ok) return built;
  const userId = session.user.id;
  const instants = built.rows.map((row) => row.at);

  try {
    const result = await db.transaction(async (tx) => {
      const table = kind === "scans" ? scans : kind === "measurements" ? measurements : meals;
      const atColumn =
        kind === "scans" ? scans.scannedAt : kind === "measurements" ? measurements.measuredAt : meals.loggedAt;
      const existing = await tx
        .select({ at: atColumn })
        .from(table)
        .where(and(eq(table.userId, userId), inArray(atColumn, instants)));
      const present = new Set(existing.map((e) => e.at.getTime()));
      const fresh = built.rows.filter((row) => !present.has(row.at.getTime()));

      if (fresh.length > 0) {
        if (kind === "scans") {
          await tx.insert(scans).values(fresh.map((row) => ({ ...row.values, userId, scannedAt: row.at })));
        } else if (kind === "measurements") {
          await tx.insert(measurements).values(fresh.map((row) => ({ ...row.values, userId, measuredAt: row.at })));
        } else {
          await tx.insert(meals).values(
            fresh.map((row) => ({
              ...row.values,
              userId,
              loggedAt: row.at,
              mealType: row.values.mealType as string,
              description: row.values.description as string,
            })),
          );
        }
      }
      return { imported: fresh.length, skipped: built.rows.length - fresh.length };
    });

    revalidatePath(kind === "meals" ? "/diet" : kind === "measurements" ? "/scans/measurements" : "/scans");
    revalidatePath("/");
    return { ok: true, ...result };
  } catch (e) {
    console.error("[fitlog] importCsv failed", e);
    return { ok: false, errors: ["Couldn't import the file. Nothing was saved — try again in a moment."] };
  }
}
