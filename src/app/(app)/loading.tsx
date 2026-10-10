export default function Loading() {
  return (
    <div className="space-y-6">
      {/* The live region has to sit outside the aria-hidden skeleton: a
          role="status" inside an aria-hidden wrapper is removed from the
          accessibility tree and can never announce. */}
      <span className="sr-only" role="status">
        Loading…
      </span>
      <div aria-hidden="true" className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-stone-200/70 motion-reduce:animate-none" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-40 animate-pulse rounded-2xl border border-stone-200 bg-white/70 motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-2xl border border-stone-200 bg-white/70 motion-reduce:animate-none" />
        </div>
        <div className="h-64 animate-pulse rounded-2xl border border-stone-200 bg-white/70 motion-reduce:animate-none" />
      </div>
    </div>
  );
}
