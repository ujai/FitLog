import { z } from "zod";

/** Numeric form value with sanity bounds — rejects negatives, Infinity and absurd values */
const bounded = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().min(min).max(max).nullable(),
  );

const boundedInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(min).max(max).nullable(),
  );

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guard for ids coming from URLs/actions before they reach a uuid-typed query. */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Better Auth user ids are 32-char base62 nanoids (not UUIDs) — this is only a
 * format sanity check; authorization happens in the can* helpers (lib/session).
 */
const userId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid user");

export const scanInput = z.object({
  userId,
  scannedAt: z.string().min(1), // datetime-local string
  weightKg: bounded(0, 300),
  leanBodyMassKg: bounded(0, 300),
  skeletalMuscleMassKg: bounded(0, 150),
  proteinKg: bounded(0, 100),
  mineralKg: bounded(0, 20),
  totalBodyWaterKg: bounded(0, 200),
  bodyFatMassKg: bounded(0, 200),
  subcutaneousFatMassKg: bounded(0, 200),
  visceralFatMassKg: bounded(0, 100),
  visceralFatAreaCm2: bounded(0, 1000),
  visceralFatLevel: bounded(0, 50),
  bodyFatPct: bounded(0, 80),
  icfKg: bounded(0, 150),
  ecfKg: bounded(0, 150),
  bmr: bounded(0, 10000),
  teeKcal: bounded(0, 10000),
  bioAge: boundedInt(0, 120),
  bwiScore: bounded(0, 10),
  abdominalCircumferenceCm: bounded(0, 250),
  waistToHipRatio: bounded(0, 3),
  notes: z.string().max(2000).nullable(),
});

export const workoutInput = z.object({
  userIds: z.array(userId).min(1).max(4),
  date: z.string().min(1),
  title: z.string().min(1).max(120),
  notes: z.string().max(2000).nullable(),
  exercises: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        participants: z
          .array(
            z.object({
              userId,
              sets: z
                .array(
                  z.object({
                    reps: z.number().int().min(0).max(1000).nullable(),
                    weightKg: z.number().min(0).max(1000).nullable(),
                    notes: z.string().max(200).nullable(),
                  }),
                )
                .max(20),
            }),
          )
          .min(1)
          .max(4),
      }),
    )
    .min(1)
    .max(30),
});

export const ptSessionInput = z.object({
  trainerId: userId,
  memberUserId: userId.nullable(), // null = both members
  startsAt: z.string().min(1), // datetime-local
  durationMin: z.number().int().min(15).max(300),
  location: z.string().max(200).nullable(),
  notes: z.string().max(2000).nullable(),
});

export const mealInput = z.object({
  userId,
  loggedAt: z.string().min(1), // datetime-local
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  description: z.string().min(1).max(2000),
  calories: boundedInt(0, 10000),
  proteinG: bounded(0, 2000),
  carbsG: bounded(0, 2000),
  fatG: bounded(0, 2000),
  notes: z.string().max(1000).nullable(),
});

export const photoInput = z.object({
  userId,
  takenAt: z.string().min(1), // datetime-local
  notes: z.string().max(1000).nullable(),
});

export const measurementInput = z.object({
  userId,
  measuredAt: z.string().min(1), // datetime-local
  weightKg: bounded(0, 300),
  waistCm: bounded(0, 200),
  chestCm: bounded(0, 200),
  armCm: bounded(0, 100),
  thighCm: bounded(0, 150),
  hipCm: bounded(0, 200),
  notes: z.string().max(1000).nullable(),
});

export const trainerNoteInput = z.object({
  memberUserId: userId,
  body: z.string().trim().min(1, "Write a note first").max(2000),
});

export const userInput = z.object({
  name: z.string().trim().min(1, "Give them a name").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("That doesn't look like an email address")),
  // Written straight into the user row, so only the three roles the app knows
  // about may arrive.
  role: z.enum(["admin", "member", "trainer"]),
});

export type WorkoutInput = z.infer<typeof workoutInput>;
