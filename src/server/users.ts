"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth, isAllowedEmail } from "@/lib/auth";
import { requireRole } from "@/lib/session";
import { userInput } from "@/lib/validation";

/** Better Auth's error code, whatever shape the thrown value happens to have. */
function authErrorCode(e: unknown): string | undefined {
  const body = (e as { body?: { code?: unknown } } | null)?.body;
  if (body && typeof body.code === "string") return body.code;
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Remove a user that was created but never finished being set up. Best effort:
 * if this fails too, the caller says so rather than pretending it is clean.
 */
async function removeHalfCreatedUser(userId: string): Promise<boolean> {
  try {
    await db.delete(user).where(eq(user.id, userId));
    return true;
  } catch (e) {
    console.error("[fitlog] adminCreateUser: could not roll back the half-created user", e);
    return false;
  }
}

export async function adminCreateUser(input: {
  name: string;
  email: string;
  role: "admin" | "member" | "trainer";
}): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");

  const parsed = userInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, email, role } = parsed.data;

  // Checked here rather than left to Better Auth's own gate, which refuses with a
  // bare `email_not_allowed` that the admin can do nothing with — and which the
  // generic catch below used to report as "check the email isn't already in use".
  // The allowlist is the one refusal worth reporting before any row exists.
  if (!isAllowedEmail(email)) {
    return {
      ok: false,
      error: `${email} isn't in ALLOWED_EMAILS, so they would never be able to sign in. Add it to the allowlist and restart the app, then create the account.`,
    };
  }

  let createdId: string | null = null;
  try {
    const result = await auth.api.createUser({
      headers: await headers(),
      body: { name, email },
    });
    createdId = result.user.id;
    // admin plugin's role field only accepts its built-in roles; set ours directly.
    // emailVerified lets Better Auth link the person's Google login to this row
    // on first sign-in (email match + Google's verified-email proof).
    await db.update(user).set({ role, emailVerified: true }).where(eq(user.id, createdId));
  } catch (e) {
    console.error("[fitlog] adminCreateUser failed", e);
    // A row left with the default role and an unverified email is unusable: its
    // owner is refused at sign-in, and a retry only hits "email already in use".
    // Drop it so the admin can just try again.
    if (createdId) {
      const rolledBack = await removeHalfCreatedUser(createdId);
      return {
        ok: false,
        error: rolledBack
          ? "Couldn't finish setting that account up, so it wasn't kept. Try again."
          : `That account was created but its role and email verification were not set, so ${email} cannot sign in yet. Remove it under Users, then create it again.`,
      };
    }
    if (authErrorCode(e) === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      return { ok: false, error: "That email already has an account." };
    }
    return {
      ok: false,
      error: "Couldn't create that user. Check the details and try again.",
    };
  }

  revalidatePath("/users");
  return { ok: true };
}

export async function adminRemoveUser(userId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireRole("admin");
  if (userId === session.user.id) return { ok: false, error: "You cannot remove yourself" };
  try {
    await auth.api.removeUser({
      headers: await headers(),
      body: { userId },
    });
    revalidatePath("/users");
    return { ok: true };
  } catch (e) {
    console.error("[fitlog] adminRemoveUser failed", e);
    return { ok: false, error: "Couldn't remove that user. Try again in a moment." };
  }
}
