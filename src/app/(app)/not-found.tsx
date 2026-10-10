import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-3xl">🔍</p>
      <h1 className="mt-3 text-lg font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-stone-600">
        That entry does not exist, or it belongs to someone else.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-5 font-medium text-white transition hover:bg-emerald-800"
      >
        Go home
      </Link>
    </div>
  );
}
