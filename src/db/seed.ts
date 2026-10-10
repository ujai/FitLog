/**
 * Seeds the household accounts. Run once after migrations:
 *   pnpm db:migrate && pnpm db:seed
 *
 * This builds a standalone auth instance (no sign-up-blocking hook) and
 * creates the three accounts. Names and emails come from SEED_ADMIN_NAME /
 * SEED_ADMIN_EMAIL (and the MEMBER / TRAINER equivalents).
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import * as schema from "./schema.ts";
import { user } from "./schema.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const client = postgres(connectionString, { max: 1, ssl: "prefer", prepare: false });
const db = drizzle(client, { schema });

const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
});

const SEED_USERS = [
  {
    name: process.env.SEED_ADMIN_NAME || "Admin",
    email: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
    role: "admin" as const,
  },
  {
    name: process.env.SEED_MEMBER_NAME || "Member",
    email: process.env.SEED_MEMBER_EMAIL || "member@example.com",
    role: "member" as const,
  },
  {
    name: process.env.SEED_TRAINER_NAME || "Trainer",
    email: process.env.SEED_TRAINER_EMAIL || "trainer@example.com",
    role: "trainer" as const,
  },
];

function generatePassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const values = randomBytes(18);
  return Array.from(values, (v) => chars[v % chars.length]).join("");
}

async function main() {
  const created: Array<{ email: string; role: string }> = [];

  for (const u of SEED_USERS) {
    const [existing] = await db.select().from(user).where(eq(user.email, u.email));
    if (existing) {
      console.log(`= ${u.role.padEnd(8)} ${u.email} already exists — skipped`);
      continue;
    }

    // signUpEmail is the standalone instance's only create path and it demands
    // a password; the app disables password login, so this one is never used.
    await auth.api.signUpEmail({
      body: { name: u.name, email: u.email, password: generatePassword(), callbackURL: "/" },
    });

    await db
      .update(user)
      .set({
        role: u.role,
        icsToken: randomBytes(24).toString("base64url"),
        // Required for Better Auth to implicitly link the Google login to
        // this account on first sign-in (email match + verified proof).
        emailVerified: true,
      })
      .where(eq(user.email, u.email));

    created.push({ email: u.email, role: u.role });
  }

  console.log(
    "\nSeeded accounts. Sign-in is Google-only — make sure each email below is in ALLOWED_EMAILS",
    "and matches the user's Google account.",
  );
  if (created.length === 0) console.log("  (nothing new created)");
  for (const c of created) {
    console.log(`  ${c.role.padEnd(8)} ${c.email}`);
  }

  await client.end();
}

void main();
