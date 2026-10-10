"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkout, updateWorkout } from "@/server/workouts";
import { RestTimer, useRestTimer } from "@/components/rest-timer";
import { TemplateManager, type ManagedTemplate } from "@/components/template-manager";
import { WorkoutExerciseCard } from "@/components/workout-exercise-card";
import { btnPrimaryCls, btnSecondaryCls, choiceCls, choiceOffCls, choiceOnCls, inputCls, selectCls } from "@/components/controls";
import { dateKeyInAppTz } from "@/lib/tz";
import { useFormDraft, useRestoreDraft } from "@/lib/form-draft";
import {
  DEFAULT_SETS,
  MAX_EXERCISES,
  buildWorkoutInput,
  emptyCell,
  isWorkoutDraft,
  makeRow,
  type LastSets,
  type WorkoutCell,
  type WorkoutExerciseDraft,
  type WorkoutInitial,
} from "@/lib/workout-draft";

export function WorkoutForm({
  participants,
  defaultUserId,
  preselectIds,
  lastSets,
  templates = [],
  allTemplates = [],
  canShareTemplates = false,
  mode = "create",
  workoutId,
  initial,
}: {
  participants: Array<{ id: string; name: string }>;
  defaultUserId: string;
  preselectIds?: string[];
  lastSets: LastSets;
  /** `from` names the coach when the template is someone else's shared one. */
  templates?: Array<{ id: string; name: string; from?: string; exercises: string[] }>;
  allTemplates?: ManagedTemplate[];
  canShareTemplates?: boolean;
  mode?: "create" | "edit";
  workoutId?: string;
  initial?: WorkoutInitial;
}) {
  const router = useRouter();
  const rest = useRestTimer();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const editing = mode === "edit";
  const multiple = participants.length > 1;
  const initialSelected = [...new Set((preselectIds ?? []).filter((id) => participants.some((p) => p.id === id)))];
  const [selected, setSelected] = useState<string[]>(() => {
    if (initial) {
      const restored = initial.userIds.filter((id) => participants.some((p) => p.id === id));
      if (restored.length > 0) return restored;
    }
    return multiple ? (initialSelected.length > 0 ? initialSelected : [defaultUserId]) : [participants[0].id];
  });
  const [date, setDate] = useState(initial?.date ?? dateKeyInAppTz(new Date()));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [exercises, setExercises] = useState<WorkoutExerciseDraft[]>(
    initial?.exercises ?? [
      { name: "", sets: Array.from({ length: DEFAULT_SETS }, () => makeRow(selected)) },
    ],
  );

  // A pull-down at the top of the page is pull-to-refresh on Android, which
  // reloads and used to discard the whole session. Draft only while logging —
  // an in-progress correction of a saved workout is not worth resurrecting.
  const draftKey = `workout:new:${defaultUserId}`;
  useRestoreDraft(
    draftKey,
    (stored) => {
      if (!isWorkoutDraft(stored)) return;
      const known = stored.selected.filter((id) => participants.some((p) => p.id === id));
      if (known.length > 0) setSelected(known);
      if (stored.date) setDate(stored.date);
      setTitle(stored.title);
      setNotes(stored.notes);
      if (stored.exercises.length > 0) setExercises(stored.exercises);
    },
    !editing,
  );
  const draftStore = useFormDraft(draftKey, { selected, date, title, notes, exercises }, !editing);

  const nameOf = (uid: string) => participants.find((p) => p.id === uid)?.name ?? "Someone";

  const toggleParticipant = (uid: string) =>
    setSelected((sel) => (sel.includes(uid) ? sel.filter((id) => id !== uid) : [...sel, uid]));

  const updateExerciseName = (ei: number, name: string) =>
    setExercises((xs) => xs.map((x, idx) => (idx === ei ? { ...x, name } : x)));

  const updateCell = (ei: number, si: number, uid: string, patch: Partial<WorkoutCell>) => {
    // Logging reps for an empty set is the de-facto "set done" signal, so the
    // rest timer starts itself. Editing an existing value never restarts it.
    if (patch.reps !== undefined) {
      const previous = exercises[ei]?.sets[si]?.[uid]?.reps ?? "";
      if (previous === "" && patch.reps !== "") rest.start();
    }
    setExercises((xs) =>
      xs.map((ex, i) => {
        if (i !== ei) return ex;
        const sets = ex.sets.map((row, j) => {
          if (j !== si) return row;
          const cell = row[uid] ?? emptyCell();
          return { ...row, [uid]: { ...cell, ...patch } };
        });
        return { ...ex, sets };
      }),
    );
  };

  const addSet = (ei: number) =>
    setExercises((xs) =>
      xs.map((ex, i) => (i === ei ? { ...ex, sets: [...ex.sets, makeRow(selected)] } : ex)),
    );

  const removeSet = (ei: number, si: number) =>
    setExercises((xs) =>
      xs.map((ex, i) =>
        i === ei ? { ...ex, sets: ex.sets.filter((_, idx) => idx !== si) } : ex,
      ),
    );

  const removeExercise = (ei: number) => setExercises((xs) => xs.filter((_, idx) => idx !== ei));

  const addExercise = () =>
    setExercises((xs) => [...xs, { name: "", sets: Array.from({ length: DEFAULT_SETS }, () => makeRow(selected)) }]);

  const [templateId, setTemplateId] = useState("");
  const applyTemplate = (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setExercises(
      template.exercises.map((name) => ({
        name,
        sets: Array.from({ length: DEFAULT_SETS }, () => makeRow(selected)),
      })),
    );
    if (title.trim() === "") setTitle(template.name);
    setTemplateId("");
  };

  const knownNames = Array.from(new Set(participants.flatMap((p) => Object.keys(lastSets[p.id] ?? {}))));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const built = buildWorkoutInput({ selected, date, title, notes, exercises }, nameOf);
    if (!built.ok) return setError(built.error);

    startSave(async () => {
      if (workoutId) {
        const result = await updateWorkout(workoutId, built.input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.replace(`/workouts/${workoutId}`);
        router.refresh();
        return;
      }
      const result = await createWorkout(built.input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      draftStore.clear();
      router.push(`/workouts/${result.workoutIds[0]}`);
      router.refresh();
    });
  }

  const coupleMode = selected.length > 1;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <datalist id="exercise-names">
        {knownNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {!editing && templates.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="workout-template" className="text-xs font-medium text-stone-600">
            Start from template
          </label>
          <select
            id="workout-template"
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className={selectCls}
          >
            <option value="">Choose a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.exercises.length} exercises){t.from ? ` · from ${t.from}` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {!editing && allTemplates.length > 0 && <TemplateManager templates={allTemplates} canShare={canShareTemplates} />}

      {/* A rest timer only makes sense while logging, not while correcting. */}
      {!editing && <RestTimer timer={rest} />}

      {multiple && (
        <div>
          <span className="mb-1 block text-xs font-medium text-stone-600">Log for</span>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => {
              const active = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleParticipant(p.id)}
                  className={`${choiceCls} px-3.5 text-sm ${
                    active ? choiceOnCls : choiceOffCls
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="workout-date" className="mb-1 block text-xs font-medium text-stone-600">Date</label>
          <input
            id="workout-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="workout-title" className="mb-1 block text-xs font-medium text-stone-600">Title</label>
          <input
            id="workout-title"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Upper body with PT"
            className={inputCls}
          />
        </div>
      </div>

      <div className="space-y-4">
        {exercises.map((ex, ei) => (
          <WorkoutExerciseCard
            key={ei}
            index={ei}
            exercise={ex}
            selected={selected}
            lastSets={lastSets}
            nameOf={nameOf}
            onNameChange={(name) => updateExerciseName(ei, name)}
            onCellChange={(si, uid, patch) => updateCell(ei, si, uid, patch)}
            onAddSet={() => addSet(ei)}
            onRemoveSet={(si) => removeSet(ei, si)}
            onRemoveExercise={() => removeExercise(ei)}
          />
        ))}
        <button
          type="button"
          onClick={addExercise}
          disabled={exercises.length >= MAX_EXERCISES}
          className="inline-flex min-h-11 items-center rounded-lg border border-emerald-600 px-4 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
        >
          + Add exercise
        </button>
      </div>

      <div>
        <label htmlFor="workout-notes" className="mb-1 block text-xs font-medium text-stone-600">Session notes</label>
        <textarea
          id="workout-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          placeholder="How it felt, what to push next time…"
          className={inputCls}
        />
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={btnPrimaryCls}>
          {saving ? "Saving…" : editing ? "Save changes" : coupleMode ? "Save workouts" : "Save workout"}
        </button>
        {editing && workoutId && (
          <button
            type="button"
            onClick={() => {
              router.replace(`/workouts/${workoutId}`);
              router.refresh();
            }}
            className={btnSecondaryCls}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
