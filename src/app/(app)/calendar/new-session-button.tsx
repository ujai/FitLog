"use client";

import { useState } from "react";
import { dateKeyInAppTz } from "@/lib/tz";
import { btnPrimaryCls } from "@/components/controls";
import { Overlay, OverlayHeader } from "@/components/overlay";
import { SessionDialogForm } from "./session-form";

/** Mobile entry point for scheduling — the month grid that hosts the desktop one is hidden below sm. */
export function NewSessionButton({
  trainerId,
  members,
}: {
  trainerId: string;
  members: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btnPrimaryCls} sm:hidden`}
      >
        Add session
      </button>
      {open && (
        <Overlay onClose={() => setOpen(false)} label="New session">
          <OverlayHeader title="New session" onClose={() => setOpen(false)} />
          <SessionDialogForm
            mode="create"
            trainerId={trainerId}
            members={members}
            initial={{ startsAt: `${dateKeyInAppTz(new Date())}T17:00` }}
            onDone={() => setOpen(false)}
          />
        </Overlay>
      )}
    </>
  );
}
