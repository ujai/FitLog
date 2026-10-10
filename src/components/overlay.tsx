"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The one dialog shell, built on a native `<dialog>` opened with `showModal()`.
 *
 * Native modality is the point: the browser makes the rest of the document
 * inert, contains focus, handles Escape, renders above everything in the top
 * layer, and returns focus to the invoking control on close. The previous
 * hand-rolled version promised `aria-modal="true"` while leaving the page
 * operable behind it and only trapping Tab between the first and last child.
 *
 * Two tones, because the two jobs differ:
 * - `paper` (default): the app's dialog sheet — translucent card on a flat
 *   paper scrim, no dark wash and no viewport-sized backdrop-blur (which would
 *   repaint on every scroll frame).
 * - `dark`: the image lightbox mat. A photo has to read true, so this is the
 *   one sanctioned dark surface; it is never used for chrome or layout.
 *
 * Render it when the dialog should be visible — mounting is the open state.
 */
export function Overlay({
  onClose,
  label,
  children,
  className,
  tone = "paper",
}: {
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  tone?: "paper" | "dark";
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  /** Set while we close the element ourselves, so its `close` event does not
   *  call back into a component that is already going away. */
  const closingRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    const onNativeClose = () => {
      if (!closingRef.current) onCloseRef.current();
    };
    dialog.addEventListener("close", onNativeClose);

    return () => {
      dialog.removeEventListener("close", onNativeClose);
      closingRef.current = true;
      if (dialog.open) dialog.close();
    };
  }, []);

  const dark = tone === "dark";

  return (
    <dialog
      ref={dialogRef}
      aria-label={label}
      onClick={(e) => {
        // The dialog fills the viewport, so a click that lands on the element
        // itself — not on a child — is a click on the backdrop.
        if (e.target === dialogRef.current) onClose();
      }}
      className={`m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-4 text-left text-inherit outline-none open:flex open:items-center open:justify-center ${
        dark ? "backdrop:bg-black/80" : "backdrop:bg-stone-600/25"
      } ${className ?? ""}`}
    >
      {dark ? (
        children
      ) : (
        <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white/70 p-5 outline-none backdrop-blur-sm">
          {children}
        </div>
      )}
    </dialog>
  );
}

/** Header row for a dialog sheet: title on the left, close control on the right. */
export function OverlayHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <h2 className="font-medium">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-stone-200 text-stone-600 transition hover:border-stone-400"
      >
        ×
      </button>
    </div>
  );
}

/** Close control for the dark lightbox tone, floating over the image. */
export function LightboxClose({
  onClose,
  label,
}: {
  onClose: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      aria-label={label}
      className="absolute right-4 top-4 inline-flex min-h-11 items-center rounded-lg bg-white/90 px-4 text-sm font-medium text-stone-700 transition hover:bg-white"
    >
      ✕ Close
    </button>
  );
}
