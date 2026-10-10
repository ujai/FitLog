"use client";

import { useState } from "react";
import { LightboxClose, Overlay } from "@/components/overlay";

/**
 * An Evolt screenshot at a glance, opening full-size on click. Used by the scan
 * form beside the fields it filled and again in the review strip above them.
 */
export function ScreenshotPreview({ src }: { src: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="View screenshot larger"
        aria-label="View screenshot larger"
        className="block cursor-zoom-in rounded-xl transition hover:opacity-85"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Evolt screenshot"
          className="max-h-32 rounded-xl border border-stone-300 object-contain"
        />
      </button>
      {open && (
        <Overlay tone="dark" label="Evolt screenshot" onClose={() => setOpen(false)}>
          <LightboxClose onClose={() => setOpen(false)} label="Close screenshot" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Evolt screenshot"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-full rounded-2xl border border-stone-200 object-contain"
          />
        </Overlay>
      )}
    </>
  );
}
