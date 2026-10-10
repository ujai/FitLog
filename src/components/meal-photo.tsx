"use client";

import { useState } from "react";
import { LightboxClose, Overlay } from "@/components/overlay";

export function MealPhoto({
  src,
  alt,
  fullSrc,
}: {
  src: string;
  alt: string;
  /** Original-size URL for the lightbox when `src` is a thumbnail variant. */
  fullSrc?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="View photo larger"
        aria-label="View photo larger"
        className="block cursor-zoom-in rounded-xl transition hover:opacity-85 print:cursor-auto"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="h-20 w-20 rounded-xl border border-stone-300 object-cover print:h-28 print:w-auto print:max-w-[8rem] print:object-contain"
        />
      </button>

      {open && (
        <Overlay tone="dark" label={alt} onClose={() => setOpen(false)} className="print:hidden">
          <LightboxClose onClose={() => setOpen(false)} label="Close photo" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullSrc ?? src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-full rounded-2xl border border-stone-200 object-contain"
          />
        </Overlay>
      )}
    </>
  );
}
