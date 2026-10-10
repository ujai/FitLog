"use client";

export function PrintButton({ label = "🖨️ Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-sm transition hover:border-emerald-600 print:hidden"
    >
      {label}
    </button>
  );
}
