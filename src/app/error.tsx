"use client";

/**
 * Root boundary. `(app)/error.tsx` sits *inside* `(app)/layout.tsx`, so it
 * cannot catch a throw from that layout — a failed session/DB lookup — which
 * used to drop the whole frame and show Next's bare default error page.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
      <p className="text-3xl">📄</p>
      <h1 className="mt-3 text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-stone-600">
        The app could not load that page. Your data is safe — try again.
      </p>
      {error.digest && <p className="mt-2 text-xs text-stone-600">Error ID: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-5 font-medium text-white transition hover:bg-emerald-800"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-5 font-medium text-stone-600 transition hover:border-stone-400"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
