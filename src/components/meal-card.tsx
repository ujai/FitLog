"use client";

import { btnPrimaryCls } from "@/components/controls";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMeal, repeatMeal } from "@/server/diet";
import { MealPhoto } from "@/components/meal-photo";
import { useUndoWindow } from "@/components/delete-with-undo";
import { EditPanel, EditProvider, EditTrigger } from "@/components/row-edit";
import { MealForm } from "@/components/meal-form";
import { fmt, fmtTime } from "@/lib/format";

type MealEntry = {
  id: string;
  userId: string;
  loggedAt: Date;
  /** "YYYY-MM-DDTHH:MM" in the app timezone — seeds the edit form */
  loggedAtLocal: string;
  mealType: string;
  description: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  notes: string | null;
  imageMime: string | null;
};

export function MealCard({ meal, canLog }: { meal: MealEntry; canLog: boolean }) {
  const router = useRouter();
  const w = useUndoWindow(() => deleteMeal(meal.id));
  const { pendingDelete, deleting, error } = w;
  const [repeating, startRepeat] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);

  // Shown as deleted means gone: hand focus to the one control that still
  // applies (the underlying card is made inert below).
  useEffect(() => {
    if (pendingDelete) undoRef.current?.focus();
  }, [pendingDelete]);

  const meta = [
    meal.calories != null ? fmt(meal.calories, "kcal") : null,
    meal.proteinG != null ? `P ${fmt(meal.proteinG, "g")}` : null,
    meal.carbsG != null ? `C ${fmt(meal.carbsG, "g")}` : null,
    meal.fatG != null ? `F ${fmt(meal.fatG, "g")}` : null,
    meal.notes,
  ]
    .filter(Boolean)
    .join(" · ");

  function onRepeat() {
    setNotice(null);
    setRepeatError(null);
    startRepeat(async () => {
      const result = await repeatMeal(meal.id);
      if (!result.ok) {
        setRepeatError(result.error ?? "Couldn't log that again. Try again in a moment.");
        return;
      }
      // The copy lands at today's time, which may not be the day on screen.
      setNotice(`Logged again today ✓`);
      router.refresh();
    });
  }

  return (
    <EditProvider>
      {/* No opacity on the container — it would dim the Undo pill with everything
          else. The overlay's wash is what hides the card. */}
      <div className="relative flex flex-wrap items-start gap-4 rounded-2xl border border-stone-200 bg-white/70 p-4 print:break-inside-avoid">
        {/* Inert for the undo window: a card shown as deleted must not still be
            tabbable or readable by assistive tech. display:contents keeps it out
            of the flex layout. */}
        <div className="contents" inert={pendingDelete}>
          {meal.imageMime && (
            <MealPhoto
              src={`/api/meals/${meal.id}/image?w=320`}
              fullSrc={`/api/meals/${meal.id}/image`}
              alt={meal.description}
            />
          )}
          <div className="min-w-40 flex-1">
            <p className="text-xs uppercase tracking-wide text-emerald-700">
              {meal.mealType} · {fmtTime(meal.loggedAt)}
            </p>
            <p className="mt-1 text-sm">{meal.description}</p>
            {meta && <p className="mt-1 text-xs text-stone-600">{meta}</p>}
            {notice && (
              <p role="status" className="mt-2 text-xs text-emerald-700">
                {notice}
              </p>
            )}
            {repeatError && (
              <p role="alert" className="mt-2 text-xs text-red-700">
                {repeatError}
              </p>
            )}
          </div>
          {canLog && !pendingDelete && (
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <EditTrigger />
              <button
                type="button"
                onClick={onRepeat}
                disabled={repeating}
                className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3 text-sm text-stone-600 transition hover:border-emerald-600 disabled:opacity-60"
              >
                {repeating ? "Logging…" : "Repeat"}
              </button>
              <button
                type="button"
                onClick={w.request}
                className="inline-flex min-h-11 items-center rounded-lg border border-red-300 px-3 text-sm text-red-700 transition hover:border-red-400 print:hidden"
              >
                Delete
              </button>
            </div>
          )}
          {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
          {canLog && (
            <div className="w-full">
              <EditPanel
                form={
                  <MealForm
                    defaultUserId={meal.userId}
                    defaultDate={meal.loggedAtLocal.slice(0, 10)}
                    defaultTime={meal.loggedAtLocal.slice(11, 16)}
                    mealId={meal.id}
                    initial={meal}
                  />
                }
              />
            </div>
          )}
        </div>
        {pendingDelete && (
          <div className="absolute inset-0 z-10 flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-paper/90 print:hidden">
            <span role="status" className="text-sm text-stone-600">
              {deleting ? "Deleting…" : "Deleted"}
            </span>
            <button
              ref={undoRef}
              type="button"
              onClick={w.undo}
              disabled={deleting}
              className={btnPrimaryCls}
            >
              Undo
            </button>
          </div>
        )}
      </div>
    </EditProvider>
  );
}
