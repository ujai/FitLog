/**
 * QA smoke + authz suite. Creates temporary qa-*@test.local accounts with
 * known passwords (standalone auth instance, bypassing the sign-up-blocking
 * hook and the email allowlist), mints real session cookies for them,
 * seeds one scan + one meal (with images) and one PT session owned by the
 * QA member, then runs HTTP checks against the running app. Afterwards
 * every created row is deleted — the QA users' foreign keys all cascade,
 * so real users' data is never touched.
 *
 *   pnpm qa                 # fixtures -> checks -> cleanup
 *   pnpm qa -- --keep       # keep fixtures + accounts for debugging
 *   pnpm qa -- --base-url http://localhost:3000
 *
 * Requires the app to be running (systemd service on :3457 or pnpm dev)
 * and DATABASE_URL / BETTER_AUTH_SECRET in .env.local.
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "../src/db/schema.ts";
import {
  user,
  scans,
  meals,
  ptSessions,
  workoutExercises,
  workoutSessions,
  workoutSets,
  workoutTemplateExercises,
  workoutTemplates,
} from "../src/db/schema.ts";

const args = process.argv.slice(2);
const keep = args.includes("--keep");
const baseUrl =
  (args.includes("--base-url") ? args[args.indexOf("--base-url") + 1] : undefined) ??
  process.env.QA_BASE_URL ??
  "http://localhost:3457";

const QA_PASSWORD = "qa-temp-Passw0rd12";

const QA_USERS = [
  { name: "QA Admin", email: "qa-admin@test.local", role: "admin" },
  { name: "QA Trainer", email: "qa-trainer@test.local", role: "trainer" },
  { name: "QA Member", email: "qa-member@test.local", role: "member" },
];

// 1x1 transparent PNG so image routes have real bytes to serve
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} — run with --env-file=.env.local (pnpm qa does this)`);
    process.exit(1);
  }
  return value;
}

const connectionString = requireEnv("DATABASE_URL");
const client = postgres(connectionString, { max: 1, ssl: "prefer", prepare: false });
const db = drizzle(client, { schema });

/**
 * Standalone auth instance against the same DB with the same secret, but
 * without the app's hooks (sign-up block, allowlist). Only used to create
 * QA accounts and mint sessions; the running app accepts the cookies
 * because the session rows and signing secret are shared.
 */
const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: requireEnv("BETTER_AUTH_SECRET"),
  baseURL: "http://qa.local",
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
});

async function authPost(path: string, body: Record<string, unknown>) {
  const res = await auth.handler(
    new Request(`http://qa.local${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, cookies: res.headers.getSetCookie() };
}

async function request(
  path: string,
  opts: { method?: string; cookie?: string; origin?: string; body?: Record<string, unknown> } = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      origin: opts.origin ?? baseUrl,
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  return {
    status: res.status,
    location: res.headers.get("location"),
    contentType: res.headers.get("content-type") ?? "",
    body: Buffer.from(await res.arrayBuffer()),
  };
}

// ---------------------------------------------------------------------------
// Check plumbing
// ---------------------------------------------------------------------------

type Pending = { name: string; fn: () => Promise<void> };
const pending: Pending[] = [];
const failures: string[] = [];

function check(name: string, fn: () => Promise<void>) {
  pending.push({ name, fn });
}

function expect(cond: boolean, detail: string): void {
  if (!cond) throw new Error(detail);
}

const expectStatus = (status: number, want: number) =>
  expect(status === want, `expected ${want}, got ${status}`);

const expectRedirectTo = (status: number, location: string | null, target: string) =>
  expect(
    status >= 300 && status < 400 && (location ?? "").includes(target),
    `expected a redirect to ${target}, got status ${status} (location: ${location ?? "none"})`,
  );

/**
 * Role-gated pages redirect() during render. Next streams the shell, so the
 * result is either a hard 3xx or a 200 whose RSC payload carries a soft
 * redirect — either way the restricted content must never render.
 */
const expectRedirectedAway = (
  r: { status: number; location: string | null; body: Buffer },
  contentMarker: string,
) => {
  if (r.status >= 300 && r.status < 400) {
    expect((r.location ?? "").includes("/"), `expected redirect to /, got ${r.status} -> ${r.location}`);
    return;
  }
  expect(r.status === 200, `expected redirect or streamed soft-redirect, got ${r.status}`);
  const html = r.body.toString("utf8");
  expect(
    html.includes("NEXT_REDIRECT;replace;/"),
    "no redirect and no soft-redirect payload in the streamed response",
  );
  expect(!html.includes(contentMarker), `restricted content "${contentMarker}" was rendered`);
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const state = {
  memberUserId: "",
  trainerUserId: "",
  memberIcsToken: "",
  memberScanId: "",
  memberMealId: "",
  memberWorkoutId: "",
};

const cookies: Record<string, string> = {};

async function createFixtures(): Promise<void> {
  // Clean slate: cascade deletes remove last run's fixtures and sessions.
  await db
    .delete(user)
    .where(
      inArray(
        user.email,
        QA_USERS.map((u) => u.email),
      ),
    );

  for (const u of QA_USERS) {
    const signUp = await authPost("/api/auth/sign-up/email", {
      name: u.name,
      email: u.email,
      password: QA_PASSWORD,
    });
    expect(signUp.status === 200, `sign-up for ${u.email} failed (${signUp.status})`);

    // Admin plugin roles only allow user/admin — real roles go via direct update.
    await db.update(user).set({ role: u.role, emailVerified: true }).where(eq(user.email, u.email));

    const [row] = await db.select().from(user).where(eq(user.email, u.email));
    if (u.role === "member") {
      state.memberUserId = row.id;
      state.memberIcsToken = row.icsToken;
    }
    if (u.role === "trainer") state.trainerUserId = row.id;

    const signIn = await authPost("/api/auth/sign-in/email", {
      email: u.email,
      password: QA_PASSWORD,
    });
    expect(signIn.cookies.length > 0, `sign-in for ${u.email} produced no session cookie`);
    cookies[u.role] = signIn.cookies
      .map((c) => c.split(";")[0])
      .join("; ");
  }

  const [scan] = await db
    .insert(scans)
    .values({
      userId: state.memberUserId,
      scannedAt: new Date(),
      weightKg: 75,
      bodyFatPct: 20,
      imageMime: "image/png",
      imageData: PNG_1PX,
    })
    .returning({ id: scans.id });
  state.memberScanId = scan.id;

  const [meal] = await db
    .insert(meals)
    .values({
      userId: state.memberUserId,
      loggedAt: new Date(),
      mealType: "lunch",
      description: "QA fixture meal",
      calories: 550,
      imageMime: "image/png",
      imageData: PNG_1PX,
    })
    .returning({ id: meals.id });
  state.memberMealId = meal.id;

  await db.insert(ptSessions).values({
    trainerId: state.trainerUserId,
    memberUserId: state.memberUserId,
    startsAt: new Date(Date.now() + 86_400_000),
    durationMin: 60,
    location: "QA Gym",
    status: "scheduled",
  });

  // A template so the inline manager on /workouts/new has something to render.
  const [template] = await db
    .insert(workoutTemplates)
    .values({ ownerUserId: state.memberUserId, name: "QA template" })
    .returning({ id: workoutTemplates.id });
  await db
    .insert(workoutTemplateExercises)
    .values({ templateId: template.id, name: "QA squat", position: 0 });

  // A logged workout so the edit form has a real record to open.
  const [workout] = await db
    .insert(workoutSessions)
    .values({
      userId: state.memberUserId,
      createdBy: state.memberUserId,
      date: new Date(),
      title: "QA fixture workout",
    })
    .returning({ id: workoutSessions.id });
  state.memberWorkoutId = workout.id;
  const [exercise] = await db
    .insert(workoutExercises)
    .values({ sessionId: workout.id, name: "QA squat", position: 0 })
    .returning({ id: workoutExercises.id });
  await db.insert(workoutSets).values({
    exerciseId: exercise.id,
    position: 0,
    reps: 5,
    weightKg: 100,
  });
}

async function cleanup(): Promise<void> {
  await db
    .delete(user)
    .where(
      inArray(
        user.email,
        QA_USERS.map((u) => u.email),
      ),
    );
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function addChecks(): void {
  // Unauthenticated
  check("unauthed / redirects to /login", async () => {
    const r = await request("/");
    expectRedirectTo(r.status, r.location, "/login");
  });
  check("unauthed /scans redirects to /login", async () => {
    const r = await request("/scans");
    expectRedirectTo(r.status, r.location, "/login");
  });
  check("unauthed /calendar/print redirects to /login", async () => {
    const r = await request("/calendar/print");
    expectRedirectTo(r.status, r.location, "/login");
  });
  check("unauthed /login renders", async () => {
    const r = await request("/login");
    expectStatus(r.status, 200);
  });
  check("unauthed scan image -> 401", async () => {
    const r = await request(`/api/scans/${state.memberScanId}/image`);
    expectStatus(r.status, 401);
  });
  check("unauthed meal image -> 401", async () => {
    const r = await request(`/api/meals/${state.memberMealId}/image`);
    expectStatus(r.status, 401);
  });
  check("ICS feed (token auth) works unauthed", async () => {
    const r = await request(`/api/ics/${state.memberIcsToken}`);
    expectStatus(r.status, 200);
    expect(r.contentType.startsWith("text/calendar"), `content-type ${r.contentType}`);
    expect(r.body.toString("utf8").includes("BEGIN:VCALENDAR"), "no VCALENDAR in body");
  });
  check("ICS feed lists the QA PT session", async () => {
    const r = await request(`/api/ics/${state.memberIcsToken}`);
    expect(r.body.toString("utf8").includes("BEGIN:VEVENT"), "QA PT session missing from feed");
  });
  check("ICS feed rejects a bad token", async () => {
    const r = await request("/api/ics/notatoken");
    expectStatus(r.status, 404);
  });
  check("public sign-up is blocked", async () => {
    const r = await request("/api/auth/sign-up/email", {
      method: "POST",
      body: { name: "Nope", email: "nope@example.com", password: "longenoughpassword1" },
    });
    expectStatus(r.status, 403);
  });
  check("sign-in rejects a foreign origin (CSRF)", async () => {
    const r = await request("/api/auth/sign-in/email", {
      method: "POST",
      origin: "http://evil.example.com",
      body: { email: "nope@example.com", password: "longenoughpassword1" },
    });
    expectStatus(r.status, 403);
  });

  // Member (own data)
  check("member: /scans renders", async () => {
    const r = await request("/scans", { cookie: cookies.member });
    expectStatus(r.status, 200);
  });
  check("member: /workouts renders", async () => {
    const r = await request("/workouts", { cookie: cookies.member });
    expectStatus(r.status, 200);
  });
  check("member: /calendar renders", async () => {
    const r = await request("/calendar", { cookie: cookies.member });
    expectStatus(r.status, 200);
  });
  // The month handout reads the resolved target's sessions, workouts and scans.
  // The target comes from ?user=, so what matters is that it cannot be forged:
  // resolveViewer only ever returns someone the viewer may see.
  check("member: /calendar/print renders their own month", async () => {
    const r = await request("/calendar/print", { cookie: cookies.member });
    expectStatus(r.status, 200);
    const html = r.body.toString("utf8");
    expect(html.includes("Month in review"), "handout header missing");
    expect(html.includes("QA Member"), "handout did not render the member's own name");
  });
  check("member: /calendar/print ignores a forged ?user=", async () => {
    const r = await request(`/calendar/print?user=${state.trainerUserId}`, {
      cookie: cookies.member,
    });
    expectStatus(r.status, 200);
    expect(
      !r.body.toString("utf8").includes("QA Trainer"),
      "handout rendered another user's month",
    );
  });
  check("trainer: /calendar/print renders a member's month", async () => {
    const r = await request(`/calendar/print?user=${state.memberUserId}`, {
      cookie: cookies.trainer,
    });
    expectStatus(r.status, 200);
    expect(r.body.toString("utf8").includes("QA Member"), "handout did not render the member");
  });
  check("member: /diet renders", async () => {
    const r = await request("/diet", { cookie: cookies.member });
    expectStatus(r.status, 200);
  });
  check("member: /account renders", async () => {
    const r = await request("/account", { cookie: cookies.member });
    expectStatus(r.status, 200);
  });
  check("member: /users redirected away (admin-only)", async () => {
    const r = await request("/users", { cookie: cookies.member });
    expectRedirectedAway(r, "Only the admin");
  });
  check("member: own scan image served", async () => {
    const r = await request(`/api/scans/${state.memberScanId}/image`, { cookie: cookies.member });
    expectStatus(r.status, 200);
    expect(r.contentType === "image/png", `content-type ${r.contentType}`);
  });
  check("member: own meal image served", async () => {
    const r = await request(`/api/meals/${state.memberMealId}/image`, { cookie: cookies.member });
    expectStatus(r.status, 200);
  });
  check("member: scan image bad uuid -> 404", async () => {
    const r = await request("/api/scans/not-a-uuid/image", { cookie: cookies.member });
    expectStatus(r.status, 404);
  });
  check("member: meal image bad uuid -> 404", async () => {
    const r = await request("/api/meals/not-a-uuid/image", { cookie: cookies.member });
    expectStatus(r.status, 404);
  });
  check("member: scan image unknown uuid -> 404", async () => {
    const r = await request("/api/scans/00000000-0000-4000-8000-000000000000/image", {
      cookie: cookies.member,
    });
    expectStatus(r.status, 404);
  });
  check("member: meal image unknown uuid -> 404", async () => {
    const r = await request("/api/meals/00000000-0000-4000-8000-000000000000/image", {
      cookie: cookies.member,
    });
    expectStatus(r.status, 404);
  });

  // Trainer
  check("trainer: /users redirected away (admin-only)", async () => {
    const r = await request("/users", { cookie: cookies.trainer });
    expectRedirectedAway(r, "Only the admin");
  });
  check("trainer: /diet redirected away", async () => {
    const r = await request("/diet", { cookie: cookies.trainer });
    expectRedirectedAway(r, "Only the admin");
  });
  check("trainer: /scans/new redirected away (no trainer scans)", async () => {
    const r = await request("/scans/new", { cookie: cookies.trainer });
    expectRedirectedAway(r, "New body scan");
  });
  check("trainer: /scans is read-only (no add/delete/AI controls)", async () => {
    const r = await request(`/scans?user=${state.memberUserId}`, { cookie: cookies.trainer });
    expectStatus(r.status, 200);
    const body = r.body.toString("utf8");
    expect(!body.includes("New scan"), "trainer sees the New scan button");
    expect(
      !body.includes("Progress review") && !body.includes("Scan review"),
      "trainer sees a review button",
    );
    expect(!body.includes(">Delete<") && !body.includes('"Delete"'), "trainer sees a Delete button");
    // Tape measurements moved to their own route; keep this meaningful there too.
    const m = await request(`/scans/measurements?user=${state.memberUserId}`, { cookie: cookies.trainer });
    expectStatus(m.status, 200);
    expect(!m.body.toString("utf8").includes("Add measurement"), "trainer sees the Add measurement form");
  });
  check("trainer: can view member scan image", async () => {
    const r = await request(`/api/scans/${state.memberScanId}/image`, { cookie: cookies.trainer });
    expectStatus(r.status, 200);
  });
  check("trainer: denied member meal image (diet privacy)", async () => {
    const r = await request(`/api/meals/${state.memberMealId}/image`, { cookie: cookies.trainer });
    expectStatus(r.status, 403);
  });

  // Admin
  check("admin: /users renders the user list", async () => {
    const r = await request("/users", { cookie: cookies.admin });
    expectStatus(r.status, 200);
    expect(
      r.body.toString("utf8").includes("Only the admin"),
      "200 but the users page content did not render",
    );
  });
  check("admin: member scans page is read-only (scans are first-person)", async () => {
    const r = await request(`/scans?user=${state.memberUserId}`, { cookie: cookies.admin });
    expectStatus(r.status, 200);
    const body = r.body.toString("utf8");
    expect(!body.includes("New scan"), "admin sees the New scan button for a member");
    expect(
      !body.includes("Progress review") && !body.includes("Scan review"),
      "admin sees a review button for a member",
    );
    const m = await request(`/scans/measurements?user=${state.memberUserId}`, { cookie: cookies.admin });
    expectStatus(m.status, 200);
    expect(!m.body.toString("utf8").includes("Add measurement"), "admin sees the member's Add measurement form");
  });
  check("admin: own scans pages keep write controls", async () => {
    const r = await request("/scans", { cookie: cookies.admin });
    expectStatus(r.status, 200);
    expect(
      r.body.toString("utf8").includes("New scan"),
      "admin lost the New scan control on their own page",
    );
    const m = await request("/scans/measurements", { cookie: cookies.admin });
    expectStatus(m.status, 200);
    expect(
      m.body.toString("utf8").includes("Add measurement"),
      "admin lost the Add measurement form on their own page",
    );
  });
  check("admin: can view member scan image", async () => {
    const r = await request(`/api/scans/${state.memberScanId}/image`, { cookie: cookies.admin });
    expectStatus(r.status, 200);
  });
  check("admin: can view member meal image", async () => {
    const r = await request(`/api/meals/${state.memberMealId}/image`, { cookie: cookies.admin });
    expectStatus(r.status, 200);
  });
  check("admin: can view member diet page", async () => {
    const r = await request(`/diet?user=${state.memberUserId}`, { cookie: cookies.admin });
    expectStatus(r.status, 200);
    expect(
      r.body.toString("utf8").includes("QA fixture meal"),
      "200 but the member's fixture meal did not render",
    );
  });

  // Edit affordances — every write control is gated by the same ownership
  // helper its server action enforces, so a missing button is a real signal.
  check("member: own /scans offers Edit", async () => {
    const r = await request("/scans", { cookie: cookies.member });
    expectStatus(r.status, 200);
    expect(r.body.toString("utf8").includes(">Edit<"), "no Edit control on the member's own scans");
  });
  check("trainer: member /scans has no Edit control", async () => {
    const r = await request(`/scans?user=${state.memberUserId}`, { cookie: cookies.trainer });
    expectStatus(r.status, 200);
    expect(!r.body.toString("utf8").includes(">Edit<"), "trainer sees an Edit control on member scans");
  });
  check("admin: member /scans has no Edit control (first-person data)", async () => {
    const r = await request(`/scans?user=${state.memberUserId}`, { cookie: cookies.admin });
    expectStatus(r.status, 200);
    expect(!r.body.toString("utf8").includes(">Edit<"), "admin sees an Edit control on member scans");
  });
  check("admin: member /scans/measurements has no Edit control", async () => {
    const r = await request(`/scans/measurements?user=${state.memberUserId}`, { cookie: cookies.admin });
    expectStatus(r.status, 200);
    expect(
      !r.body.toString("utf8").includes(">Edit<"),
      "admin sees an Edit control on member measurements",
    );
  });
  check("member: /diet offers Repeat", async () => {
    const r = await request("/diet", { cookie: cookies.member });
    expectStatus(r.status, 200);
    expect(r.body.toString("utf8").includes(">Repeat<"), "no Repeat control on the member's diet page");
  });
  check("admin: member /diet offers Repeat (admin may write diet)", async () => {
    const r = await request(`/diet?user=${state.memberUserId}`, { cookie: cookies.admin });
    expectStatus(r.status, 200);
    expect(
      r.body.toString("utf8").includes(">Repeat<"),
      "admin lost Repeat on the member's diet page",
    );
  });
  check("member: /workouts/new renders the inline template manager", async () => {
    const r = await request("/workouts/new", { cookie: cookies.member });
    expectStatus(r.status, 200);
    expect(r.body.toString("utf8").includes("Manage templates"), "template manager missing");
  });
  check("member: /workouts list offers Edit", async () => {
    const r = await request("/workouts", { cookie: cookies.member });
    expectStatus(r.status, 200);
    expect(r.body.toString("utf8").includes(">Edit<"), "no Edit control in the workout list");
  });
  check("member: workout detail ?edit=1 renders the edit form", async () => {
    const r = await request(`/workouts/${state.memberWorkoutId}?edit=1`, { cookie: cookies.member });
    expectStatus(r.status, 200);
    expect(r.body.toString("utf8").includes("Edit this workout"), "edit form did not render");
  });
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`QA suite against ${baseUrl}\n`);

  // Fail fast (before touching the DB) if the app is not reachable.
  try {
    const up = await request("/login");
    expect(up.status === 200, `got ${up.status}`);
  } catch (err) {
    console.error(
      `App is not reachable at ${baseUrl} — start it with "systemctl --user start health-tracker" (or pnpm dev) first.`,
    );
    throw err;
  }

  await createFixtures();

  // Everything below depends on session minting; verify it once up front.
  const session = await request("/api/auth/get-session", { cookie: cookies.member });
  if (
    session.status !== 200 ||
    !session.body.toString("utf8").includes("qa-member@test.local")
  ) {
    throw new Error(
      `Session minting failed — running app rejected the QA cookie (status ${session.status})`,
    );
  }

  addChecks();
  for (const { name, fn } of pending) {
    try {
      await fn();
      console.log(`  \u2713 ${name}`);
    } catch (err) {
      failures.push(name);
      console.log(`  \u2717 ${name}\n      ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n${pending.length - failures.length}/${pending.length} checks passed`);

  if (keep) {
    console.log(
      "\n--keep set: QA accounts and fixtures left in the DB. Re-run without --keep to clean them up.",
    );
  }
}

try {
  await main();
} finally {
  if (!keep) {
    try {
      await cleanup();
    } catch (cleanupErr) {
      console.error("Cleanup failed — delete qa-*@test.local users manually:", cleanupErr);
      process.exitCode = 1;
    }
  }
  await client.end();
}

if (failures.length > 0) process.exitCode = 1;
