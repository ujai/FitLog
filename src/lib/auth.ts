import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { admin } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { db } from "@/db";
import * as schema from "@/db/schema";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

/** Extra origins allowed by CSRF protection (comma-separated), e.g. dev ports. */
const extraOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

/** The only accounts that may ever sign in (comma-separated, exact match). */
const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

/**
 * Whether an address may ever sign in. The enforcement point is
 * `validateUserInfo` below, which also covers OAuth sign-in and account linking;
 * this is exported so the admin UI can say *why* a creation was refused instead
 * of creating a row whose owner can never get in.
 */
export function isAllowedEmail(email: string): boolean {
  return allowedEmails.has(email.trim().toLowerCase());
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  appName: "FitLog",
  baseURL: appUrl,
  trustedOrigins: [appUrl, ...extraOrigins],
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: {
    // Single source of truth for access: every user creation, OAuth sign-in,
    // and account link must hit the allowlist. Removing an email from
    // ALLOWED_EMAILS blocks that account's next sign-in (active sessions
    // still expire naturally).
    validateUserInfo: ({ user, source }) => {
      const email = user.email?.trim().toLowerCase() ?? "";
      if (!allowedEmails.has(email)) {
        return { error: "email_not_allowed" };
      }
      if (source.method === "oauth" && !user.emailVerified) {
        return { error: "email_not_verified" };
      }
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      // First Google sign-in with a matching whitelisted email links the
      // Google identity onto the existing account (keeps role/data).
      trustedProviders: ["google"],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  rateLimit: {
    // slows brute-force attempts; per-instance storage is fine at this scale
    enabled: true,
    window: 60,
    max: 10,
  },
  plugins: [
    admin({
      adminRoles: ["admin"],
      defaultRole: "member",
    }),
  ],
  hooks: {
    // Public sign-up is disabled: accounts are created by the admin only.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        throw new APIError("FORBIDDEN", {
          message: "Sign-up is disabled. Ask the admin to create your account.",
        });
      }
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
