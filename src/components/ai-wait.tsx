"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/spinner";

/**
 * Visible wait state for the AI calls, which run 5–30 seconds. A bare text swap
 * reads as a frozen app and gives no sense of whether it is still working, so
 * this shows a spinner and a running count.
 *
 * The seconds are aria-hidden: they change every second and would otherwise
 * make the live region announce itself over and over.
 */
export function AiWait({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-emerald-700">
      <Spinner />
      {label}
      {seconds > 0 && (
        <span aria-hidden="true" className="tabular-nums text-stone-600">
          {seconds}s
        </span>
      )}
    </span>
  );
}
