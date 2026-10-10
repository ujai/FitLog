"use client";

import { inputCls, chipCls, btnPrimaryCls, btnSecondaryCls } from "@/components/controls";
import { useActionState } from "react";
import { createPtSession, updatePtSession } from "@/server/calendar";
import { REPEAT_WEEKS } from "@/lib/calendar-repeat";

type Member = { id: string; name: string };
type Result = { ok: boolean; error?: string } | null;

export function SessionDialogForm({
  mode,
  sessionId,
  trainerId,
  members,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  sessionId?: string;
  trainerId: string;
  members: Member[];
  initial: {
    startsAt: string;
    durationMin?: number;
    memberUserId?: string | null;
    location?: string | null;
    notes?: string | null;
  };
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: Result, formData: FormData): Promise<Result> => {
      const result =
        mode === "edit" && sessionId
          ? await updatePtSession(sessionId, formData)
          : await createPtSession(formData);
      if (result.ok) onDone();
      return result;
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="trainerId" value={trainerId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="dialog-starts-at" className="mb-1 block text-xs font-medium text-stone-600">Date &amp; time</label>
          <input id="dialog-starts-at" type="datetime-local" name="startsAt" required defaultValue={initial.startsAt} className={inputCls} />
        </div>
        <div>
          <label htmlFor="dialog-duration" className="mb-1 block text-xs font-medium text-stone-600">Duration (min)</label>
          <input id="dialog-duration" type="number" name="durationMin" defaultValue={initial.durationMin ?? 60} min={15} max={300} step={15} className={inputCls} />
        </div>
        <div>
          <label htmlFor="dialog-location" className="mb-1 block text-xs font-medium text-stone-600">Location (optional)</label>
          <input id="dialog-location" name="location" maxLength={200} placeholder="e.g. Gym floor 2" defaultValue={initial.location ?? ""} className={inputCls} />
        </div>
      </div>
      <fieldset>
        <legend className="mb-1 block text-xs font-medium text-stone-600">With</legend>
        <div className="flex flex-wrap gap-2">
          {[{ value: "", label: "Both (couple)" }, ...members.map((m) => ({ value: m.id, label: m.name }))].map(
            (option) => (
              <label key={option.value || "both"} className={chipCls}>
                <input
                  type="radio"
                  name="memberUserId"
                  value={option.value}
                  defaultChecked={(initial.memberUserId ?? "") === option.value}
                  className="sr-only"
                />
                {option.label}
              </label>
            ),
          )}
        </div>
      </fieldset>
      {mode === "create" && (
        <fieldset>
          <legend className="mb-1 block text-xs font-medium text-stone-600">Repeat weekly</legend>
          <div className="flex flex-wrap gap-2">
            {REPEAT_WEEKS.map((weeks) => (
              <label key={weeks} className={chipCls}>
                <input type="radio" name="repeatWeeks" value={weeks} defaultChecked={weeks === 1} className="sr-only" />
                {weeks === 1 ? "Once" : `${weeks} weeks`}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div>
        <label htmlFor="dialog-notes" className="mb-1 block text-xs font-medium text-stone-600">Notes (optional)</label>
        <input id="dialog-notes" name="notes" maxLength={2000} defaultValue={initial.notes ?? ""} className={inputCls} />
      </div>
      {state && !state.ok && state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className={btnPrimaryCls}
        >
          {pending ? "Saving…" : mode === "edit" ? "Save changes" : "Schedule"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className={btnSecondaryCls}
        >
          Back
        </button>
      </div>
    </form>
  );
}
