"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTemplate, renameTemplate, setTemplateShared } from "@/server/templates";
import { UndoDeleteButton } from "@/components/delete-with-undo";
import { btnPrimaryCls, btnSecondaryCls, inputCls } from "@/components/controls";

export type ManagedTemplate = { id: string; name: string; shared: boolean; exerciseCount: number };

/** Rename/share/delete saved templates, in place under the picker on /workouts/new. */
export function TemplateManager({ templates, canShare }: { templates: ManagedTemplate[]; canShare: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [saving, startSave] = useTransition();
  const [sharing, startShare] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleShared(t: ManagedTemplate) {
    setError(null);
    startShare(async () => {
      const result = await setTemplateShared(t.id, !t.shared);
      if (!result.ok) {
        setError(result.error ?? "Couldn't change sharing. Try again.");
        return;
      }
      router.refresh();
    });
  }

  function save(id: string) {
    setError(null);
    startSave(async () => {
      const result = await renameTemplate(id, name);
      if (!result.ok) {
        setError(result.error ?? "Couldn't rename the template. Try again.");
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  return (
    <details className="group rounded-2xl border border-stone-200 bg-white/70 p-4">
      <summary className="inline-flex min-h-11 cursor-pointer list-none select-none items-center gap-1.5 rounded-lg text-sm font-medium text-stone-600 transition hover:text-stone-800 [&::-webkit-details-marker]:hidden">
        Manage templates ({templates.length})
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

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <ul className="mt-3 space-y-3">
        {templates.map((t) => (
          <li key={t.id} className="border-b border-stone-100 pb-3 last:border-0 last:pb-0">
            {editingId === t.id ? (
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`template-name-${t.id}`} className="sr-only">
                  Template name
                </label>
                <input
                  id={`template-name-${t.id}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  className={`min-w-0 flex-1 ${inputCls}`}
                />
                <button type="button" onClick={() => save(t.id)} disabled={saving} className={btnPrimaryCls}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={() => setEditingId(null)} className={btnSecondaryCls}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  {t.name}{" "}
                  <span className="text-stone-600">
                    ({t.exerciseCount} {t.exerciseCount === 1 ? "exercise" : "exercises"})
                    {t.shared && " · shared with members"}
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => toggleShared(t)}
                      disabled={sharing}
                      aria-pressed={t.shared}
                      className={btnSecondaryCls}
                    >
                      {t.shared ? "Stop sharing" : "Share with members"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setEditingId(t.id);
                      setName(t.name);
                    }}
                    className={btnSecondaryCls}
                  >
                    Rename
                  </button>
                  <UndoDeleteButton
                    action={deleteTemplate.bind(null, t.id)}
                    className="inline-flex min-h-11 items-center rounded-lg border border-red-300 px-3.5 text-sm text-red-700 transition hover:border-red-400 disabled:opacity-50"
                  >
                    Delete
                  </UndoDeleteButton>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
