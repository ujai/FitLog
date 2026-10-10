"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { btnSecondaryCls } from "@/components/controls";

/**
 * Reveal-in-place editing for a server-rendered row. The row stays a server
 * component; the edit form is passed in as a node (RSC children pass through a
 * client provider), so the trigger can sit inside the row's action cluster
 * while the form expands underneath the card.
 *
 * The panel unmounts the form when closed, so reopening always re-seeds from
 * the row's current values.
 */
type EditWindow = { open: boolean; toggle: () => void; close: () => void };

const EditContext = createContext<EditWindow | null>(null);

export function EditProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ open, toggle, close }), [open, toggle, close]);
  return <EditContext.Provider value={value}>{children}</EditContext.Provider>;
}

/** Used by an edit form to dismiss its own panel after a successful save. */
export function useEditPanel(): EditWindow | null {
  return useContext(EditContext);
}

export function EditTrigger({
  label = "Edit",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const ctx = useContext(EditContext);
  const ref = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Closing the panel unmounts the form without moving focus, which drops a
  // keyboard user on <body> to re-tab from the top of the page. The trigger put
  // them in; the trigger takes them back.
  useEffect(() => {
    const nowOpen = ctx?.open ?? false;
    if (wasOpen.current && !nowOpen) ref.current?.focus();
    wasOpen.current = nowOpen;
  }, [ctx?.open]);

  if (!ctx) return null;
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={ctx.open}
      onClick={ctx.toggle}
      className={`${className ?? btnSecondaryCls} print:hidden`}
    >
      {ctx.open ? "Cancel" : label}
    </button>
  );
}

export function EditPanel({ form }: { form: React.ReactNode }) {
  const ctx = useContext(EditContext);
  const open = ctx?.open ?? false;
  const close = ctx?.close;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !close) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input, textarea, select")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  return (
    <div ref={ref} className="mt-2 print:hidden">
      {form}
    </div>
  );
}
