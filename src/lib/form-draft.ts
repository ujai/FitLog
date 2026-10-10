"use client";

import { useEffect, useRef } from "react";

/**
 * Draft persistence for long forms.
 *
 * The failure this exists to stop: on Android, a pull-down at the top of a page
 * is pull-to-refresh, which reloads the app and discards a half-typed workout.
 * There is no undo for that, so the draft is the recovery.
 *
 * Deliberately not `beforeunload`: iOS Safari does not fire it reliably and it
 * is absent entirely for a backgrounded PWA, which is exactly how this app is
 * used. localStorage is the mechanism that actually survives.
 *
 * Drafts are keyed by purpose and owner — `workout:new:<userId>` — because the
 * stored values are body and workout data and the app runs on shared household
 * devices. Every call is best-effort: private mode, a disabled store or a full
 * quota must degrade to "no draft", never to a broken form.
 */

const PREFIX = "fitlog:draft:";

/** Parsed draft, or null. The shape is the caller's to validate. */
function readDraft(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeDraft(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // quota exceeded / storage disabled — the form still works, just unsaved
  }
}

/**
 * Drop every draft belonging to one person. Called on sign-out: the next person
 * to sign in on this device must not be able to read the last one's typed data.
 */
export function clearDraftsForUser(userId: string): void {
  try {
    const suffix = `:${userId}`;
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(PREFIX) && key.endsWith(suffix)) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // storage unavailable — nothing to clear
  }
}

/**
 * Persist `value` under `key`, debounced so typing does not serialise per
 * keystroke. The returned `clear()` is final: it cancels any pending write and
 * stops future ones, so a saved entry cannot reappear on the next visit.
 */
export function useFormDraft(
  key: string,
  value: unknown,
  enabled = true,
): { clear: () => void } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const untouched = useRef(true);
  const stopped = useRef(false);

  useEffect(() => {
    if (!enabled || stopped.current) return;
    // Opening a form is not an edit: skip the initial state so a form nobody
    // typed into does not leave a draft behind.
    if (untouched.current) {
      untouched.current = false;
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => writeDraft(key, value), 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, value, enabled]);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    stopped.current = true;
    writeDraft(key, null);
  };

  return { clear };
}

/**
 * Restore a draft exactly once, after mount, handing it over as `unknown`: only
 * the form knows what a valid draft of its own state looks like, and storage is
 * not trustworthy — a stale or hand-edited value must not be able to put the
 * form into a state its own code assumes is impossible.
 *
 * The restore cannot happen during render: the server has no localStorage, so
 * seeding state from a draft on the first render would produce a hydration
 * mismatch against the server's HTML.
 */
export function useRestoreDraft(
  key: string,
  restore: (draft: unknown) => void,
  enabled = true,
): void {
  const restoreRef = useRef(restore);
  const done = useRef(false);

  useEffect(() => {
    restoreRef.current = restore;
  });

  useEffect(() => {
    if (!enabled || done.current) return;
    done.current = true;
    const draft = readDraft(key);
    if (draft !== null) restoreRef.current(draft);
  }, [key, enabled]);
}
