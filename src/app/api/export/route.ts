import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  meals,
  measurementListColumns,
  measurements,
  scanListColumns,
  scans,
  user,
  workoutExercises,
  workoutSessions,
  workoutSets,
} from "@/db/schema";
import { getSession, canView, canViewDiet } from "@/lib/session";
import { METRICS } from "@/lib/metrics";
import { csvCell } from "@/lib/csv";

const DOMAINS = ["scans", "measurements", "workouts", "meals"] as const;
type Domain = (typeof DOMAINS)[number];

function isDomain(value: string | null): value is Domain {
  return value !== null && (DOMAINS as readonly string[]).includes(value);
}

type Exported = { headers: string[]; rows: Array<Record<string, unknown>> };

async function exportDomain(domain: Domain, userId: string): Promise<Exported> {
  switch (domain) {
    case "scans": {
      const rows = await db
        .select(scanListColumns)
        .from(scans)
        .where(eq(scans.userId, userId))
        .orderBy(asc(scans.scannedAt));
      return {
        headers: ["scannedAt", ...METRICS.map((m) => m.key), "notes", "hasImage"],
        rows: rows.map((r) => ({
          scannedAt: r.scannedAt.toISOString(),
          ...Object.fromEntries(METRICS.map((m) => [m.key, r[m.key]])),
          notes: r.notes,
          hasImage: r.imageMime != null,
        })),
      };
    }
    case "measurements": {
      const rows = await db
        .select(measurementListColumns)
        .from(measurements)
        .where(eq(measurements.userId, userId))
        .orderBy(asc(measurements.measuredAt));
      return {
        headers: [
          "measuredAt", "weightKg", "waistCm", "chestCm", "armCm", "thighCm", "hipCm", "notes",
        ],
        rows: rows.map((m) => ({
          measuredAt: m.measuredAt.toISOString(),
          weightKg: m.weightKg,
          waistCm: m.waistCm,
          chestCm: m.chestCm,
          armCm: m.armCm,
          thighCm: m.thighCm,
          hipCm: m.hipCm,
          notes: m.notes,
        })),
      };
    }
    case "meals": {
      const rows = await db
        .select({
          loggedAt: meals.loggedAt,
          mealType: meals.mealType,
          description: meals.description,
          calories: meals.calories,
          proteinG: meals.proteinG,
          carbsG: meals.carbsG,
          fatG: meals.fatG,
          notes: meals.notes,
          imageMime: meals.imageMime,
        })
        .from(meals)
        .where(eq(meals.userId, userId))
        .orderBy(asc(meals.loggedAt));
      return {
        headers: [
          "loggedAt", "mealType", "description", "calories", "proteinG", "carbsG", "fatG", "notes", "hasImage",
        ],
        rows: rows.map((m) => ({
          loggedAt: m.loggedAt.toISOString(),
          mealType: m.mealType,
          description: m.description,
          calories: m.calories,
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG,
          notes: m.notes,
          hasImage: m.imageMime != null,
        })),
      };
    }
    case "workouts": {
      const sessions = await db
        .select({
          id: workoutSessions.id,
          date: workoutSessions.date,
          title: workoutSessions.title,
          notes: workoutSessions.notes,
        })
        .from(workoutSessions)
        .where(eq(workoutSessions.userId, userId))
        .orderBy(asc(workoutSessions.date));
      const sessionIds = sessions.map((s) => s.id);
      const exercises = sessionIds.length
        ? await db.select().from(workoutExercises).where(inArray(workoutExercises.sessionId, sessionIds))
        : [];
      const exerciseIds = exercises.map((e) => e.id);
      const sets = exerciseIds.length
        ? await db.select().from(workoutSets).where(inArray(workoutSets.exerciseId, exerciseIds))
        : [];
      const setsByExercise = new Map<string, typeof sets>();
      for (const set of sets) {
        const list = setsByExercise.get(set.exerciseId) ?? [];
        list.push(set);
        setsByExercise.set(set.exerciseId, list);
      }
      const rows: Array<Record<string, unknown>> = [];
      for (const s of sessions) {
        const sessionExercises = exercises
          .filter((e) => e.sessionId === s.id)
          .sort((a, b) => a.position - b.position);
        for (const ex of sessionExercises) {
          const exerciseSets = (setsByExercise.get(ex.id) ?? []).sort((a, b) => a.position - b.position);
          for (const [i, set] of exerciseSets.entries()) {
            rows.push({
              date: s.date.toISOString(),
              title: s.title,
              exercise: ex.name,
              setNumber: i + 1,
              reps: set.reps,
              weightKg: set.weightKg,
              setNotes: set.notes,
              sessionNotes: s.notes,
            });
          }
        }
      }
      return {
        headers: ["date", "title", "exercise", "setNumber", "reps", "weightKg", "setNotes", "sessionNotes"],
        rows,
      };
    }
  }
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const domainParam = url.searchParams.get("domain");
  const requestedUser = url.searchParams.get("userId") ?? session.user.id;

  if (domainParam !== null && !isDomain(domainParam)) {
    return new NextResponse("Unknown domain", { status: 400 });
  }

  if (requestedUser !== session.user.id) {
    const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, requestedUser));
    if (!target) return new NextResponse("Not found", { status: 404 });
    // Full export and meals include diet data: trainer must never get those.
    const dietIncluded = domainParam === null || domainParam === "meals";
    const allowed = dietIncluded ? canViewDiet(session, requestedUser) : canView(session, requestedUser);
    if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    if (!domainParam) return new NextResponse("CSV export needs a domain", { status: 400 });
    const { headers, rows } = await exportDomain(domainParam, requestedUser);
    const csv = [headers, ...rows.map((row) => headers.map((h) => row[h]))]
      .map((cells) => cells.map(csvCell).join(","))
      .join("\r\n");
    return new NextResponse(csv + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fitlog-${domainParam}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const domains: Domain[] = domainParam ? [domainParam] : [...DOMAINS];
  const entries = await Promise.all(
    domains.map(async (d) => [d, (await exportDomain(d, requestedUser)).rows] as const),
  );
  const data = Object.fromEntries(entries);
  return new NextResponse(
    JSON.stringify({ exportedAt: new Date().toISOString(), user: requestedUser, data }, null, 2),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="fitlog-export-${stamp}.json"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
