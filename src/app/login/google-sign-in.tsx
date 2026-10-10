"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";

export function GoogleSignIn() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onGoogle() {
    setError(null);
    setPending(true);
    try {
      const { error } = await signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/login?error=google",
      });
      if (error) {
        setError("Google sign-in failed. Try again or ask the admin.");
        setPending(false);
      }
      // On success the browser is navigating to Google, so `pending` stays true —
      // that is what "Redirecting…" is for.
    } catch {
      // A rejected call means the request never left (offline, blocked); without
      // this the button would sit on "Redirecting…" forever with nothing said.
      setError("Couldn't reach Google. Check your connection and try again.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white/70 p-6">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <button
        type="button"
        onClick={onGoogle}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-stone-300 bg-white/70 px-3 py-2.5 font-medium text-stone-800 transition hover:bg-stone-50 disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
          <path
            fill="#4285F4"
            d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.86 11.86 0 0 0 0 10.76l3.98-3.09Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
          />
        </svg>
        {pending ? "Redirecting…" : "Sign in with Google"}
      </button>
      <p className="text-center text-xs text-stone-600">
        Members only lah!
      </p>
    </div>
  );
}
