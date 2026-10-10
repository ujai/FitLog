"use client";

import { Spinner } from "@/components/spinner";
import { focusWhenReady } from "@/lib/focus";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateScanReviewForScan } from "@/server/scans";

export function ScanReviewButton({ scanId, hasReview }: { scanId: string; hasReview: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await generateScanReviewForScan(scanId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            // The review card sits below the scan row; focus it so the finished
            // result is not written off-screen.
            router.refresh();
            focusWhenReady(`scan-review-${scanId}`);
          });
        }}
        className="inline-flex min-h-11 items-center rounded-lg border border-emerald-600 px-3.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Reviewing…
          </span>
        ) : hasReview ? (
          "↻ Re-review"
        ) : (
          "✨ Scan review"
        )}
      </button>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
