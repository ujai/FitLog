import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <p className="text-3xl">🔍</p>
      <h1 className="mt-3 text-lg font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-stone-600">
        That page does not exist. It may have been moved or deleted.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-5 font-medium text-white transition hover:bg-emerald-800"
      >
        Go home
      </Link>
    </main>
  );
}
