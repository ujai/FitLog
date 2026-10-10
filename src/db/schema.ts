import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  uuid,
  jsonb,
  customType,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

// ---------------------------------------------------------------------------
// Better Auth tables
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** 'admin' | 'member' | 'trainer' */
  role: text("role").notNull().default("member"),
  /** Unguessable token for the personal ICS calendar feed */
  icsToken: text("ics_token")
    .notNull()
    .unique()
    .$defaultFn(() => randomBytes(24).toString("base64url")),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Defence in depth: every write path validates first (Zod for our own forms,
    // src/lib/roles.ts for reads), so this only catches a future direct write.
    // "user" is Better Auth's own admin-plugin default — it writes that before our
    // update sets one of ours, so it has to be allowed here.
    check("user_role_check", sql`${t.role} in ('admin', 'trainer', 'member', 'user')`),
  ],
);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  issuer: text("issuer").notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Body composition scans (Evolt 360)
// ---------------------------------------------------------------------------

export const scans = pgTable(
  "scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull(),
    weightKg: doublePrecision("weight_kg"),
    bodyFatPct: doublePrecision("body_fat_pct"),
    bmr: doublePrecision("bmr"),
    // Evolt 360 report fields (#1-17, 19, 20)
    leanBodyMassKg: doublePrecision("lean_body_mass_kg"),
    skeletalMuscleMassKg: doublePrecision("skeletal_muscle_mass_kg"),
    proteinKg: doublePrecision("protein_kg"),
    mineralKg: doublePrecision("mineral_kg"),
    totalBodyWaterKg: doublePrecision("total_body_water_kg"),
    bodyFatMassKg: doublePrecision("body_fat_mass_kg"),
    subcutaneousFatMassKg: doublePrecision("subcutaneous_fat_mass_kg"),
    visceralFatMassKg: doublePrecision("visceral_fat_mass_kg"),
    visceralFatAreaCm2: doublePrecision("visceral_fat_area_cm2"),
    visceralFatLevel: doublePrecision("visceral_fat_level"),
    icfKg: doublePrecision("icf_kg"),
    ecfKg: doublePrecision("ecf_kg"),
    teeKcal: doublePrecision("tee_kcal"),
    bioAge: integer("bio_age"),
    bwiScore: doublePrecision("bwi_score"),
    abdominalCircumferenceCm: doublePrecision("abdominal_circumference_cm"),
    waistToHipRatio: doublePrecision("waist_to_hip_ratio"),
    notes: text("notes"),
    /** Original Evolt screenshot (stored in DB so pg_dump carries everything) */
    imageMime: text("image_mime"),
    imageData: bytea("image_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scans_user_date_idx").on(t.userId, t.scannedAt)],
);

// ---------------------------------------------------------------------------
// Progress photos (flexed/physique shots alongside scan screenshots)
// ---------------------------------------------------------------------------

export const progressPhotos = pgTable(
  "progress_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    imageMime: text("image_mime"),
    imageData: bytea("image_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("progress_photos_user_date_idx").on(t.userId, t.takenAt)],
);

// ---------------------------------------------------------------------------
// Tape measurements between Evolt scans
// ---------------------------------------------------------------------------

export const measurements = pgTable(
  "measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    weightKg: doublePrecision("weight_kg"),
    waistCm: doublePrecision("waist_cm"),
    chestCm: doublePrecision("chest_cm"),
    armCm: doublePrecision("arm_cm"),
    thighCm: doublePrecision("thigh_cm"),
    hipCm: doublePrecision("hip_cm"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("measurements_user_date_idx").on(t.userId, t.measuredAt)],
);

/**
 * Column projection for measurement list/read queries — measurements carry no
 * blob, but mirroring scanListColumns keeps read shapes consistent.
 */
export const measurementListColumns = {
  id: measurements.id,
  userId: measurements.userId,
  measuredAt: measurements.measuredAt,
  weightKg: measurements.weightKg,
  waistCm: measurements.waistCm,
  chestCm: measurements.chestCm,
  armCm: measurements.armCm,
  thighCm: measurements.thighCm,
  hipCm: measurements.hipCm,
  notes: measurements.notes,
};

// ---------------------------------------------------------------------------
// Per-metric targets — what "good" means for one person's own numbers
// ---------------------------------------------------------------------------

/**
 * A target is what makes a change scoreable. Without one a rising weight is
 * not good or bad, only different — which is why deltas are shown unscored
 * until a metric has a target to judge against.
 *
 * Strictly first-person: only the owner sets their own targets (nobody sets a
 * member's body goals for them), so rows are keyed by owner.
 *
 * `metric` is a MetricKey from `src/lib/format.ts`, or a measurement metric key
 * such as "waistCm". Validated in the server action, not by the database — this
 * project uses plain text with documented values rather than native enums.
 */
export const metricGoals = pgTable(
  "metric_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    target: doublePrecision("target").notNull(),
    /**
     * 'up' | 'down' — which side of the target counts as achieved. Inferred
     * from the person's reading when the target was set (a target above where
     * you are means "up"), so cutting and bulking both work without asking.
     * Null when there was no reading to infer from, and the app then declines
     * to score movement past the target.
     */
    direction: text("direction"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("metric_goals_user_metric_uniq").on(t.userId, t.metric),
    // null is "no direction known"; anything else must be one the scorer reads.
    check(
      "metric_goals_direction_check",
      sql`${t.direction} is null or ${t.direction} in ('up', 'down')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Who logged it (trainer or the member themselves); null if that user was later deleted */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    /** Links paired sessions logged together (couple/group workouts); null = solo */
    groupId: uuid("group_id"),
    date: timestamp("date", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workouts_user_date_idx").on(t.userId, t.date), index("workouts_group_idx").on(t.groupId)],
);

export const workoutExercises = pgTable(
  "workout_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => workoutSessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("workout_exercises_session_idx").on(t.sessionId)],
);

export const workoutSets = pgTable(
  "workout_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => workoutExercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    reps: integer("reps"),
    weightKg: doublePrecision("weight_kg"),
    notes: text("notes"),
  },
  (t) => [index("workout_sets_exercise_idx").on(t.exerciseId)],
);

// ---------------------------------------------------------------------------
// Workout templates (saved exercise lists to start a new session from)
// ---------------------------------------------------------------------------

export const workoutTemplates = pgTable(
  "workout_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    notes: text("notes"),
    /** A trainer/admin template offered to everyone's picker, not just the owner's. */
    shared: boolean("shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workout_templates_owner_idx").on(t.ownerUserId, t.createdAt)],
);

export const workoutTemplateExercises = pgTable(
  "workout_template_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => workoutTemplates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("workout_template_exercises_template_idx").on(t.templateId)],
);

// ---------------------------------------------------------------------------
// PT calendar
// ---------------------------------------------------------------------------

export const ptSessions = pgTable(
  "pt_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerId: text("trainer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** null = session with both members (couple training) */
    memberUserId: text("member_user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull().default(60),
    location: text("location"),
    notes: text("notes"),
    /** 'scheduled' | 'done' | 'cancelled' */
    status: text("status").notNull().default("scheduled"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pt_sessions_start_idx").on(t.startsAt),
    check("pt_sessions_status_check", sql`${t.status} in ('scheduled', 'done', 'cancelled')`),
  ],
);

// ---------------------------------------------------------------------------
// Trainer check-in notes (coach feedback visible to the member)
// ---------------------------------------------------------------------------

export const trainerNotes = pgTable(
  "trainer_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberUserId: text("member_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Trainer or admin who wrote the note. Nullable with `set null`: the note is
     * the *member's* record, so removing the author must not erase it — the same
     * rule `workout_sessions.created_by` follows (#3). The reads already tolerate
     * a missing author (`?? "Unknown"` / `?? "Your coach"`).
     */
    authorUserId: text("author_user_id").references(() => user.id, { onDelete: "set null" }),
    /**
     * Set when the note is a comment on one workout. `set null` for the same
     * reason as the author: deleting the workout must not erase the feedback.
     */
    workoutSessionId: uuid("workout_session_id").references(() => workoutSessions.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trainer_notes_member_date_idx").on(t.memberUserId, t.createdAt),
    index("trainer_notes_workout_idx").on(t.workoutSessionId),
  ],
);

// ---------------------------------------------------------------------------
// PT session packages (prepaid sessions, counted down by sessions held)
// ---------------------------------------------------------------------------

export const ptPackages = pgTable(
  "pt_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = a couple package, used up by couple sessions — same rule as pt_sessions */
    memberUserId: text("member_user_id").references(() => user.id, { onDelete: "cascade" }),
    /** Which trainer/admin recorded it; null on rows written before this column, or if that user was deleted */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    sessions: integer("sessions").notNull(),
    /** Sessions held on or after this instant count against the package. */
    startsOn: timestamp("starts_on", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pt_packages_member_idx").on(t.memberUserId, t.startsOn),
    check("pt_packages_sessions_check", sql`${t.sessions} between 1 and 200`),
  ],
);

// ---------------------------------------------------------------------------
// Daily diet targets (one row per person, first-person like metric goals)
// ---------------------------------------------------------------------------

export const dietTargets = pgTable("diet_targets", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  calories: integer("calories"),
  proteinG: doublePrecision("protein_g"),
  carbsG: doublePrecision("carbs_g"),
  fatG: doublePrecision("fat_g"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Diet diary
// ---------------------------------------------------------------------------

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
    /** 'breakfast' | 'lunch' | 'dinner' | 'snack' */
    mealType: text("meal_type").notNull(),
    description: text("description").notNull(),
    calories: integer("calories"),
    proteinG: doublePrecision("protein_g"),
    carbsG: doublePrecision("carbs_g"),
    fatG: doublePrecision("fat_g"),
    notes: text("notes"),
    imageMime: text("image_mime"),
    imageData: bytea("image_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("meals_user_date_idx").on(t.userId, t.loggedAt),
    check(
      "meals_meal_type_check",
      sql`${t.mealType} in ('breakfast', 'lunch', 'dinner', 'snack')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// AI reviews (stored output of Gemini analysis)
// ---------------------------------------------------------------------------

export const aiReviews = pgTable(
  "ai_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id").references(() => scans.id, { onDelete: "cascade" }),
    /** 'scan' | 'progress' */
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    /** stored shape: { positives: string[], focus: Array<{ area, observation, suggestion }> } */
    pointers: jsonb("pointers").notNull().default(sql`'{}'::jsonb`),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One "progress" review per user; one "scan" review per (user, scan) —
    // makes the delete-then-insert refresh pattern race-safe.
    uniqueIndex("ai_reviews_progress_uniq")
      .on(t.userId, t.kind)
      .where(sql`kind = 'progress'`),
    uniqueIndex("ai_reviews_scan_uniq")
      .on(t.userId, t.scanId)
      .where(sql`kind = 'scan'`),
    check("ai_reviews_kind_check", sql`${t.kind} in ('progress', 'scan')`),
  ],
);

export type Scan = typeof scans.$inferSelect;
export type AiReview = typeof aiReviews.$inferSelect;

/**
 * Column projection for list/read queries — everything except the heavy
 * image_data bytea blob, so history/dashboard queries don't drag MBs of
 * image bytes out of Postgres. Full-row selects stay in the /image routes.
 */
export const scanListColumns = {
  id: scans.id,
  userId: scans.userId,
  scannedAt: scans.scannedAt,
  weightKg: scans.weightKg,
  bodyFatPct: scans.bodyFatPct,
  bmr: scans.bmr,
  leanBodyMassKg: scans.leanBodyMassKg,
  skeletalMuscleMassKg: scans.skeletalMuscleMassKg,
  proteinKg: scans.proteinKg,
  mineralKg: scans.mineralKg,
  totalBodyWaterKg: scans.totalBodyWaterKg,
  bodyFatMassKg: scans.bodyFatMassKg,
  subcutaneousFatMassKg: scans.subcutaneousFatMassKg,
  visceralFatMassKg: scans.visceralFatMassKg,
  visceralFatAreaCm2: scans.visceralFatAreaCm2,
  visceralFatLevel: scans.visceralFatLevel,
  icfKg: scans.icfKg,
  ecfKg: scans.ecfKg,
  teeKcal: scans.teeKcal,
  bioAge: scans.bioAge,
  bwiScore: scans.bwiScore,
  abdominalCircumferenceCm: scans.abdominalCircumferenceCm,
  waistToHipRatio: scans.waistToHipRatio,
  notes: scans.notes,
  imageMime: scans.imageMime,
};
