import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { GoogleSignIn } from "./google-sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // proxy.ts deliberately does not bounce signed-in visitors (that bounce made
  // a stale cookie unrecoverable), so the real check lives here, where the DB
  // is reachable.
  const session = await getSession();
  if (session) redirect("/");

  const params = await searchParams;
  const notice = params.expired
    ? "Your session ended. Sign in again to carry on."
    : params.error
      ? "That Google account isn't on the household list. Ask the admin to add it, then try again."
      : null;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">
            🏋️
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">FitLog</h1>
          <p className="mt-1 text-sm text-stone-600">Untuk better health, one log at a time.</p>
        </div>
        {notice && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-stone-300 bg-white/70 px-3 py-2 text-sm text-stone-700"
          >
            {notice}
          </p>
        )}
        <GoogleSignIn />
      </div>
    </main>
  );
}
