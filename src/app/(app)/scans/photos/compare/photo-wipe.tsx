"use client";

import { useState } from "react";

/**
 * Two progress photos in one frame, wiped between by a divider — for phones, where
 * side by side means each photo gets half a 390px screen.
 *
 * The divider is a native range input rather than a hand-rolled drag handle: it comes
 * with touch, mouse and arrow-key control, a label for screen readers and a focus ring,
 * all of which a div with pointer handlers would have to reimplement and would probably
 * get partly wrong. A clip-path on the earlier photo does the reveal; the mat is dark
 * (DESIGN.md's Dark Mat Rule) because a paper-toned one makes a body photo read wrong.
 */
export function PhotoWipe({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel: string;
  afterLabel: string;
}) {
  const [reveal, setReveal] = useState(50);

  return (
    <div>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-stone-200 bg-black/80">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterSrc}
          alt={afterLabel}
          className="absolute inset-0 h-full w-full object-contain"
        />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={beforeSrc}
            alt={beforeLabel}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={reveal}
        onChange={(e) => setReveal(Number(e.target.value))}
        aria-label="Reveal more of the earlier photo, or of the later one"
        className="mt-3 h-11 w-full accent-emerald-700"
      />
      <p className="mt-1 flex justify-between text-xs text-stone-600">
        <span>{beforeLabel}</span>
        <span>{afterLabel}</span>
      </p>
    </div>
  );
}
