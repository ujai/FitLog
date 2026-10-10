"use client";

import { btnPrimaryCls } from "@/components/controls";
import { Spinner } from "@/components/spinner";
import { focusWhenReady } from "@/lib/focus";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateScanReview } from "@/server/scans";

/** The review renders further down the page; bring it into view when it lands. */
const REVIEW_ID = "progress-review";

export function ReviewButton({ userId }: { userId: string }) {
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
            const result = await generateScanReview(userId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            // Fires off-screen otherwise, so a tap looks like it did nothing.
            router.refresh();
            focusWhenReady(REVIEW_ID);
          });
        }}
        className={btnPrimaryCls}
      >
        {pending ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Reviewing…
          </span>
        ) : (
          "✨ Progress review"
        )}
      </button>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
