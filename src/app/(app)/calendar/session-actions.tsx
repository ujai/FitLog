"use client";

import { useState, useTransition } from "react";
import { UndoDeleteButton } from "@/components/delete-with-undo";
import { deletePtSession, updatePtSessionStatus } from "@/server/calendar";
import { toLocalInputInTz } from "@/lib/tz";
import { Overlay, OverlayHeader } from "@/components/overlay";
import { SessionDialogForm } from "./session-form";

export type Status = "scheduled" | "done" | "cancelled";

/**
 * The session status, checked rather than assumed: the column is plain text, so
 * anything unrecognised behaves as a scheduled session — the treatment the month
 * grid's chip already gave it.
 */
export function sessionStatus(value: string): Status {
  if (value === "done" || value === "cancelled") return value;
  return "scheduled";
}

const secondaryCls =
  "inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 text-sm text-stone-600 transition hover:border-stone-400 disabled:opacity-60";
const doneCls =
  "inline-flex min-h-11 items-center rounded-lg border border-emerald-500 px-3.5 text-sm text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60";
const deleteCls =
  "inline-flex min-h-11 items-center rounded-lg border border-red-300 px-3.5 text-sm text-red-700 transition hover:border-red-400 disabled:opacity-50";

/**
 * The buttons that change a session's status, and the state behind them. Both the
 * agenda list and the month grid's day dialog used to carry their own copy of this
 * — the transition, the error, and a separately spelled set of classes — so a
 * change here had to be made twice and stayed consistent only by hand.
 *
 * The delete stays the caller's to own: the list passes its action, while the grid
 * wraps this in `DeleteWithUndo`, whose context supplies the one to use.
 */
export function SessionStatusActions({
  id,
  status,
  action,
}: {
  id: string;
  /** a stored value; narrowed here, never cast at the call site */
  status: string;
  action?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const state = sessionStatus(status);
  const [pending, startStatus] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Not fire-and-forget: these used to leave the buttons looking broken on a slow
  // connection while silently swallowing failures.
  function setStatus(next: Status) {
    setError(null);
    startStatus(async () => {
      const result = await updatePtSessionStatus(id, next);
      if (!result.ok) setError(result.error ?? "Couldn't change the session status. Try again.");
    });
  }

  return (
    <>
      {state === "scheduled" && (
        <>
          <button type="button" disabled={pending} onClick={() => setStatus("done")} className={doneCls}>
            Mark as Done
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("cancelled")}
            className={secondaryCls}
          >
            Cancel
          </button>
        </>
      )}
      {state === "cancelled" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setStatus("scheduled")}
          className={secondaryCls}
        >
          Reinstate
        </button>
      )}
      <UndoDeleteButton action={action} className={deleteCls}>
        Delete
      </UndoDeleteButton>
      {error && (
        <p role="alert" className="w-full text-xs text-red-700">
          {error}
        </p>
      )}
    </>
  );
}

export type SessionActionsProps = {
  id: string;
  status: string;
  startsAt: Date;
  durationMin: number;
  memberUserId: string | null;
  location: string | null;
  notes: string | null;
  trainerId: string;
  members: { id: string; name: string }[];
};

/** The agenda list's row of controls: an edit trigger plus the status actions. */
export function SessionActions({
  id,
  status,
  startsAt,
  durationMin,
  memberUserId,
  location,
  notes,
  trainerId,
  members,
}: SessionActionsProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setEditing(true)} className={secondaryCls}>
        Edit
      </button>
      <SessionStatusActions id={id} status={status} action={() => deletePtSession(id)} />
      {editing && (
        <Overlay onClose={() => setEditing(false)} label="Edit session">
          <OverlayHeader title="Edit session" onClose={() => setEditing(false)} />
          <SessionDialogForm
            mode="edit"
            sessionId={id}
            trainerId={trainerId}
            members={members}
            initial={{
              startsAt: toLocalInputInTz(startsAt),
              durationMin,
              memberUserId,
              location,
              notes,
            }}
            onDone={() => setEditing(false)}
          />
        </Overlay>
      )}
    </div>
  );
}
