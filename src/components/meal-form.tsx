"use client";

import { inputCls, chipCls, btnPrimaryCls, btnSecondaryCls } from "@/components/controls";
import { AiWait } from "@/components/ai-wait";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMeal, extractMealAction, updateMeal } from "@/server/diet";
import { useEditPanel } from "@/components/row-edit";
import { fileToCompressedDataUrl } from "@/lib/image-client";

// text-base on mobile: <16px inputs trigger iOS Safari focus zoom

const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
];

/** Meal-type suggestion from the logged time — the chips stay overridable */
function suggestMealType(time: string): string {
  const [h, m] = time.split(":");
  const mins = Number(h) * 60 + Number(m ?? 0);
  if (Number.isNaN(mins)) return "snack";
  if (mins < 10 * 60 + 30) return "breakfast";
  if (mins < 15 * 60) return "lunch";
  if (mins < 17 * 60) return "snack";
  if (mins < 21 * 60 + 30) return "dinner";
  return "snack";
}

/** Existing values when correcting a logged meal. */
type MealInitial = {
  /** "YYYY-MM-DDTHH:MM" in the app timezone */
  loggedAtLocal?: string;
  description?: string;
  mealType?: string;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  notes?: string | null;
};

export function MealForm({
  defaultUserId,
  defaultDate,
  defaultTime,
  mealId,
  initial,
}: {
  defaultUserId: string;
  defaultDate: string;
  defaultTime: string;
  mealId?: string;
  initial?: MealInitial;
}) {
  const router = useRouter();
  const editPanel = useEditPanel();
  const editing = Boolean(mealId);
  const fileRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const kcalRef = useRef<HTMLInputElement>(null);
  const proteinRef = useRef<HTMLInputElement>(null);
  const carbsRef = useRef<HTMLInputElement>(null);
  const fatRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [mealType, setMealType] = useState(() => initial?.mealType ?? suggestMealType(defaultTime));
  const [showDetails, setShowDetails] = useState(editing);
  const [saving, startSave] = useTransition();
  const [analyzing, startAnalyse] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Compressing the photo counts as busy too — see onPickFile. */
  const busy = saving || analyzing;

  // The meal keeps its own day/time when edited — the page's day is only the
  // default for a new entry.
  const initialTime = initial?.loggedAtLocal ? initial.loggedAtLocal.slice(11, 16) : defaultTime;
  const entryDate = initial?.loggedAtLocal ? initial.loggedAtLocal.slice(0, 10) : defaultDate;

  async function onPickFile(file: File) {
    setError(null);
    setNotice(null);
    // Compressing the photo runs inside the transition too, so the pending state
    // covers the whole flow rather than starting only at the AI call.
    startAnalyse(async () => {
      try {
        const dataUrl = await fileToCompressedDataUrl(file);
        setImageDataUrl(dataUrl);

        const result = await extractMealAction(dataUrl);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const d = result.data;
        if (descRef.current && d.description && !descRef.current.value.trim()) {
          descRef.current.value = d.description;
        }
        if (kcalRef.current && d.calories != null) kcalRef.current.value = String(d.calories);
        if (proteinRef.current && d.proteinG != null) proteinRef.current.value = String(d.proteinG);
        if (carbsRef.current && d.carbsG != null) carbsRef.current.value = String(d.carbsG);
        if (fatRef.current && d.fatG != null) fatRef.current.value = String(d.fatG);
        if (d.mealType) setMealType(d.mealType);
        setShowDetails(true);
        setNotice("Photo analysed by AI — these are rough estimates, please adjust before saving.");
      } catch {
        setError("Couldn't read that photo — try a different one, or log the meal without it.");
      }
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The button is disabled while busy; this covers a stray Enter as well.
    if (busy) return;
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    const time = String(formData.get("time") ?? "");
    formData.delete("time");
    formData.set("loggedAt", `${entryDate}T${time}`);
    if (imageDataUrl) formData.set("image", imageDataUrl);
    startSave(async () => {
      const result = mealId ? await updateMeal(mealId, formData) : await createMeal(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that meal. Nothing was lost — try again.");
        return;
      }
      setImageDataUrl(null);
      if (fileRef.current) fileRef.current.value = "";
      if (editing) {
        editPanel?.close();
      } else {
        form.reset();
        setMealType(suggestMealType(defaultTime));
        setShowDetails(false);
        // Clearing the form is not confirmation on a thumb flow — say so out loud.
        setNotice("Meal logged ✓");
      }
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className={`space-y-4 rounded-2xl border border-stone-200 bg-white/70 ${editing ? "p-4" : "p-5"} print:hidden`}
    >
      <h2 className="font-medium">{editing ? "Edit meal" : "Log a meal"}</h2>
      <input type="hidden" name="userId" value={defaultUserId} />

      {/* The stored photo stays attached when editing; the AI block is a
          create-time shortcut only. */}
      {!editing && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onPickFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-sm transition hover:border-emerald-600 disabled:opacity-50"
          >
            {imageDataUrl ? "Replace photo" : "Add photo (optional)"}
          </button>
          {imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageDataUrl} alt="Meal preview" className="h-16 rounded-lg border border-stone-300 object-cover" />
          )}
          {analyzing && <AiWait label="Analysing your photo…" />}
        </div>
      )}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`meal-time${mealId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
            Time
          </label>
          <input
            id={`meal-time${mealId ?? ""}`}
            name="time"
            type="time"
            required
            defaultValue={initialTime}
            onChange={(e) => setMealType(suggestMealType(e.target.value))}
            className={inputCls}
          />
        </div>
        <fieldset>
          <legend className="mb-1 text-xs font-medium text-stone-600">Meal</legend>
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPES.map((t) => (
              <label
                key={t.value}
                className={chipCls}
              >
                <input
                  type="radio"
                  name="mealType"
                  value={t.value}
                  checked={mealType === t.value}
                  onChange={() => setMealType(t.value)}
                  className="sr-only"
                />
                {t.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-600">Suggested from the time — change if needed</p>
        </fieldset>
      </div>

      <div>
        <label htmlFor={`meal-description${mealId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
          What did you eat/drink?
        </label>
        <textarea
          id={`meal-description${mealId ?? ""}`}
          name="description"
          ref={descRef}
          required
          rows={2}
          maxLength={2000}
          defaultValue={initial?.description ?? ""}
          placeholder="e.g. Nasi lemak with fried egg, iced tea"
          className={inputCls}
        />
      </div>

      <details
        open={showDetails}
        onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}
        className="group"
      >
        <summary className="inline-flex min-h-11 cursor-pointer list-none select-none items-center gap-1.5 rounded-lg text-sm font-medium text-emerald-700 transition hover:text-emerald-800 [&::-webkit-details-marker]:hidden">
          Add details (optional)
          <svg
            className="h-4 w-4 text-stone-600 transition-transform group-open:rotate-180"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M5 7.5 10 12.5 15 7.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </summary>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor={`meal-kcal${mealId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
                kcal
              </label>
              <input
                id={`meal-kcal${mealId ?? ""}`}
                name="calories"
                ref={kcalRef}
                type="number"
                min={0}
                max={10000}
                defaultValue={initial?.calories ?? ""}
                placeholder="—"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor={`meal-protein${mealId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
                Protein g
              </label>
              <input
                id={`meal-protein${mealId ?? ""}`}
                name="proteinG"
                ref={proteinRef}
                type="number"
                step="any"
                min={0}
                defaultValue={initial?.proteinG ?? ""}
                placeholder="—"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor={`meal-carbs${mealId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
                Carbs g
              </label>
              <input
                id={`meal-carbs${mealId ?? ""}`}
                name="carbsG"
                ref={carbsRef}
                type="number"
                step="any"
                min={0}
                defaultValue={initial?.carbsG ?? ""}
                placeholder="—"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor={`meal-fat${mealId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
                Fat g
              </label>
              <input
                id={`meal-fat${mealId ?? ""}`}
                name="fatG"
                ref={fatRef}
                type="number"
                step="any"
                min={0}
                defaultValue={initial?.fatG ?? ""}
                placeholder="—"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label htmlFor={`meal-notes${mealId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
              Notes
            </label>
            <input
              id={`meal-notes${mealId ?? ""}`}
              name="notes"
              maxLength={1000}
              defaultValue={initial?.notes ?? ""}
              placeholder="e.g. felt hungry after workout"
              className={inputCls}
            />
          </div>
        </div>
      </details>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={`${btnPrimaryCls} w-full sm:w-auto`}>
          {analyzing
            ? "Waiting for AI…"
            : saving
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Add meal"}
        </button>
        {editing && (
          <button type="button" onClick={() => editPanel?.close()} className={btnSecondaryCls}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
