"use client";

import { inputCls, btnPrimaryCls, btnSecondaryCls } from "@/components/controls";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createMeasurement, updateMeasurement } from "@/server/measurements";
import { useEditPanel } from "@/components/row-edit";
import { metricLabel, TAPE_METRICS } from "@/lib/metrics";
import { toLocalInputInTz } from "@/lib/tz";

// text-base on mobile: <16px inputs trigger iOS Safari focus zoom

export function MeasurementForm({
  defaultUserId,
  measurementId,
  initial,
}: {
  defaultUserId: string;
  measurementId?: string;
  initial?: Record<string, string>;
}) {
  const router = useRouter();
  const editPanel = useEditPanel();
  const editing = Boolean(measurementId);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startSave(async () => {
      const result = measurementId
        ? await updateMeasurement(measurementId, formData)
        : await createMeasurement(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that measurement. Nothing was lost — try again.");
        return;
      }
      if (editing) {
        editPanel?.close();
      } else {
        form.reset();
        // Clearing the form is not confirmation on a thumb flow — say so out loud.
        setNotice("Measurement added ✓");
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-stone-200 bg-white/70 p-5">
      <h3 className="font-medium">{editing ? "Edit measurement" : "Add measurement"}</h3>
      <input type="hidden" name="userId" value={defaultUserId} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor={`meas-at${measurementId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
            Date &amp; time
          </label>
          <input
            id={`meas-at${measurementId ?? ""}`}
            name="measuredAt"
            type="datetime-local"
            required
            defaultValue={initial?.measuredAt ?? toLocalInputInTz(new Date())}
            className={inputCls}
          />
        </div>
        {TAPE_METRICS.map((m) => {
          const id = `meas-${m.key}${measurementId ?? ""}`;
          return (
            <div key={m.key}>
              <label htmlFor={id} className="mb-1 block text-xs font-medium text-stone-600">
                {metricLabel(m)}
              </label>
              <input
                id={id}
                name={m.key}
                type="number"
                step="any"
                inputMode="decimal"
                min={0}
                defaultValue={initial?.[m.key] ?? ""}
                placeholder="—"
                className={inputCls}
              />
            </div>
          );
        })}
      </div>

      <div>
        <label htmlFor={`meas-notes${measurementId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
          Notes (optional)
        </label>
        <input
          id={`meas-notes${measurementId ?? ""}`}
          name="notes"
          maxLength={1000}
          defaultValue={initial?.notes ?? ""}
          placeholder="e.g. morning, fasted, same spot"
          className={inputCls}
        />
      </div>

      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          className={`${btnPrimaryCls} w-full sm:w-auto`}
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Add measurement"}
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
