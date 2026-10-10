"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnPrimaryCls, chipCls, inputCls } from "@/components/controls";
import { createPtPackage } from "@/server/packages";

/** Record a prepaid block of PT sessions for a member or the couple. */
export function PackageForm({ members, today }: { members: Array<{ id: string; name: string }>; today: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const formData = new FormData(e.currentTarget);
    startSave(async () => {
      const result = await createPtPackage(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the package. Try again.");
        return;
      }
      formRef.current?.reset();
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <fieldset>
        <legend className="mb-1 block text-xs font-medium text-stone-600">For</legend>
        <div className="flex flex-wrap gap-2">
          {[{ value: "", label: "Both (couple)" }, ...members.map((m) => ({ value: m.id, label: m.name }))].map(
            (option, i) => (
              <label key={option.value || "both"} className={chipCls}>
                <input type="radio" name="memberUserId" value={option.value} defaultChecked={i === 0} className="sr-only" />
                {option.label}
              </label>
            ),
          )}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="package-sessions" className="mb-1 block text-xs font-medium text-stone-600">
            Sessions
          </label>
          <input
            id="package-sessions"
            name="sessions"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            required
            defaultValue={10}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="package-starts" className="mb-1 block text-xs font-medium text-stone-600">
            Counts from
          </label>
          <input id="package-starts" name="startsOn" type="date" required defaultValue={today} className={inputCls} />
        </div>
      </div>
      <div>
        <label htmlFor="package-notes" className="mb-1 block text-xs font-medium text-stone-600">
          Notes (optional)
        </label>
        <input id="package-notes" name="notes" maxLength={500} placeholder="e.g. paid by transfer" className={inputCls} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Package added ✓
        </p>
      )}
      <button type="submit" disabled={saving} className={`w-full sm:w-auto ${btnPrimaryCls}`}>
        {saving ? "Saving…" : "Add package"}
      </button>
    </form>
  );
}
