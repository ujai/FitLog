"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnPrimaryCls, inputCls } from "@/components/controls";
import { Spinner } from "@/components/spinner";
import { DIET_TARGET_FIELDS, type DietTargets } from "@/lib/diet-target-fields";
import { saveDietTargets } from "@/server/diet-targets";

/** Daily food targets, shown against what was logged in the diet diary. */
export function DietTargetsForm({ targets }: { targets: DietTargets | null }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      DIET_TARGET_FIELDS.map((f) => [f.key, targets?.[f.key] != null ? String(targets[f.key]) : ""]),
    ),
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const values = Object.fromEntries(
      DIET_TARGET_FIELDS.map((f) => {
        const raw = (drafts[f.key] ?? "").trim();
        return [f.key, raw === "" ? null : Number(raw)];
      }),
    ) as DietTargets;
    if (Object.values(values).some((v) => v !== null && !Number.isFinite(v))) {
      setError("Every target has to be a number");
      return;
    }
    startSave(async () => {
      const result = await saveDietTargets(values);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save your targets. Try again in a moment.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-stone-200 bg-white/70 p-5">
      <div>
        <h2 className="font-medium">Daily food targets</h2>
        <p className="mt-1 text-sm text-stone-600">
          Optional. The diet diary shows each day against these, and so does the printout. Leave a
          field empty for no target.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {DIET_TARGET_FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`diet-target-${f.key}`} className="mb-1 block text-xs font-medium text-stone-600">
              {f.label} ({f.unit})
            </label>
            <input
              id={`diet-target-${f.key}`}
              type="number"
              min={1}
              max={f.max}
              step={f.integer ? 1 : "any"}
              inputMode={f.integer ? "numeric" : "decimal"}
              value={drafts[f.key] ?? ""}
              onChange={(e) => {
                setSaved(false);
                setDrafts((d) => ({ ...d, [f.key]: e.target.value }));
              }}
              placeholder="no target"
              className={inputCls}
            />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Food targets saved ✓
        </p>
      )}

      <button type="submit" disabled={saving} className={btnPrimaryCls}>
        {saving ? (
          <span className="inline-flex items-center gap-2">
            <Spinner />
            Saving…
          </span>
        ) : (
          "Save food targets"
        )}
      </button>
    </form>
  );
}
