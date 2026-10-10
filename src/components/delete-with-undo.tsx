"use client";

import { btnPrimaryCls } from "@/components/controls";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

type Result = { ok: boolean; error?: string };

const UNDO_WINDOW_MS = 7000;

/**
 * Timed delete window: the item is shown as deleted for 7s, then the server
 * action commits. Undo cancels; navigating away commits (cleanup effect).
 */
export function useUndoWindow(action: () => Promise<Result>, onCommitted?: () => void) {
  const router = useRouter();
  const actionRef = useRef(action);
  const onCommittedRef = useRef(onCommitted);
  useEffect(() => {
    actionRef.current = action;
    onCommittedRef.current = onCommitted;
  });
  const pendingRef = useRef(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingDelete) return;
    const timer = setTimeout(() => {
      startDelete(async () => {
        const result = await actionRef.current();
        pendingRef.current = false;
        if (!result.ok) {
          setPendingDelete(false);
          setError(result.error ?? "Couldn't delete that — nothing was removed.");
          return;
        }
        onCommittedRef.current?.();
        router.refresh();
      });
    }, UNDO_WINDOW_MS);
    return () => {
      clearTimeout(timer);
      // Navigating away mid-undo-window: the item was shown as deleted, so make it
      // stick. There is nowhere to report a failure — the page is unmounting, and if
      // the delete did not land the row simply reappears on the next load — but the
      // rejection must not escape as an unhandled one.
      if (pendingRef.current) {
        actionRef.current().catch((e) => {
          console.error("[fitlog] deferred delete failed while leaving the page", e);
        });
      }
    };
  }, [pendingDelete, router]);

  const request = () => {
    setError(null);
    pendingRef.current = true;
    setPendingDelete(true);
  };
  const undo = () => {
    pendingRef.current = false;
    setPendingDelete(false);
  };

  return { pendingDelete, deleting, error, request, undo };
}

type UndoWindow = ReturnType<typeof useUndoWindow>;

const UndoContext = createContext<UndoWindow | null>(null);

const defaultButtonCls =
  "inline-flex min-h-11 items-center rounded-lg border border-red-300 px-3.5 text-sm text-red-700 transition hover:border-red-400 disabled:opacity-50 print:hidden";

/**
 * While the window is open the item is visually gone, so it has to be *gone*:
 * its controls are taken out of the tab order and the accessibility tree
 * (`inert`), focus is handed to the one control that still applies, and the
 * "Deleted" text is announced rather than only drawn. `display: contents`
 * lets the inert wrapper carry no layout of its own, so a row that was a flex
 * or grid child keeps its geometry.
 */
function UndoOverlay({ deleting, undo }: { deleting: boolean; undo: () => void }) {
  const undoRef = useRef<HTMLButtonElement>(null);

  // Rendered only when the window is open, so this is "on appear".
  useEffect(() => {
    undoRef.current?.focus();
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-paper/90 print:hidden">
      <span role="status" className="text-sm text-stone-600">
        {deleting ? "Deleting…" : "Deleted"}
      </span>
      <button
        ref={undoRef}
        type="button"
        onClick={undo}
        disabled={deleting}
        className={btnPrimaryCls}
      >
        Undo
      </button>
    </div>
  );
}

/** Cover the wrapped content in place under a "Deleted · Undo" overlay for the window. */
export function DeleteWithUndo({
  action,
  onCommitted,
  children,
  className,
}: {
  action: () => Promise<Result>;
  onCommitted?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const w = useUndoWindow(action, onCommitted);
  return (
    <UndoContext.Provider value={w}>
      {/* No `opacity` on this container: it would dim the overlay too, and the
          overlay holds the one control that still applies. The wash below already
          covers the row. */}
      <div className={`relative ${className ?? ""}`}>
        {/* Inert for the window: the row is shown as deleted, so it must not be
            reachable — a keyboard or screen-reader user could otherwise still tab
            into its Edit/Delete controls and act on it. */}
        <div className="contents" inert={w.pendingDelete}>
          {children}
        </div>
        {w.pendingDelete && <UndoOverlay deleting={w.deleting} undo={w.undo} />}
        {w.error && <p role="alert" className="mt-1 text-xs text-red-700">{w.error}</p>}
      </div>
    </UndoContext.Provider>
  );
}

/**
 * The delete trigger. Inside a DeleteWithUndo it drives the wrapper's window;
 * standalone it runs its own and swaps to an inline "Deleted · Undo" pill.
 */
export function UndoDeleteButton({
  action,
  onCommitted,
  children = "Delete",
  className,
}: {
  action?: () => Promise<Result>;
  onCommitted?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const own = useUndoWindow(
    action ?? (() => Promise.resolve({ ok: false, error: "No action provided" })),
    onCommitted,
  );
  const ctx = useContext(UndoContext);
  const w = ctx ?? own;
  const undoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Only when this button owns the window: inside a DeleteWithUndo the shared
    // overlay owns focus.
    if (!ctx && w.pendingDelete) undoRef.current?.focus();
  }, [ctx, w.pendingDelete]);

  if (w.pendingDelete) {
    return (
      <span className="inline-flex items-center gap-2 print:hidden">
        <span role="status" className="text-xs text-stone-600">
          {w.deleting ? "Deleting…" : "Deleted"}
        </span>
        <button
          ref={undoRef}
          type="button"
          onClick={w.undo}
          disabled={w.deleting}
          className="inline-flex min-h-11 items-center rounded-lg bg-emerald-700 px-3.5 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60"
        >
          Undo
        </button>
        {w.error && <span role="alert" className="text-xs text-red-700">{w.error}</span>}
      </span>
    );
  }

  return (
    <button type="button" onClick={w.request} className={className ?? defaultButtonCls}>
      {children}
    </button>
  );
}
