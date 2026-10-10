"use client";

import { useState, useTransition } from "react";
import { createTemplateFromWorkout } from "@/server/templates";
import { btnPrimaryCls, btnSecondaryCls, inputCls } from "@/components/controls";

export function SaveTemplateButton({ workoutId }: { workoutId: string }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Give the template a name");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createTemplateFromWorkout(workoutId, trimmed);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the template. Try again.");
        return;
      }
      setNaming(false);
      setSaved(true);
    });
  }

  if (saved) {
    return (
      <p
        role="status"
        className="inline-flex min-h-11 items-center rounded-lg bg-emerald-50 px-3.5 text-sm text-emerald-700"
      >
        Saved as template ✓
      </p>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {naming ? (
        <form onSubmit={onSubmit} className="flex flex-wrap items-center justify-end gap-2">
          <label htmlFor="template-name" className="sr-only">
            Template name
          </label>
          <input
            id="template-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Template name"
            className={`w-44 ${inputCls}`}
          />
          <button type="submit" disabled={pending} className={btnPrimaryCls}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              setNaming(false);
              setError(null);
            }}
            className={btnSecondaryCls}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setNaming(true);
          }}
          className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 text-sm text-stone-600 transition hover:border-emerald-600"
        >
          Save as template
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
