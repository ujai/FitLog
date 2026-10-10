"use client";

import { Fragment } from "react";
import { cellInputCls, inputCls } from "@/components/controls";
import { fmt, fmtShortDate } from "@/lib/format";
import {
  MAX_SETS,
  emptyCell,
  type ExerciseHistory,
  type LastSets,
  type WorkoutCell,
  type WorkoutExerciseDraft,
} from "@/lib/workout-draft";

// gray-on-color is a hover-state false positive: hover swaps text and bg together (red-700 on red-50); stone-600 is only the resting state
const removeSetCls =
  "-ml-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-stone-600 transition hover:bg-red-50 hover:text-red-700"; // impeccable-disable-line gray-on-color

/**
 * One exercise: its name, what the selected people lifted last time, and a set
 * row per person.
 *
 * Split out of the workout form, which was a 578-line file whose repeated unit
 * was this card. It owns the two responsive layouts (a per-person grid in couple
 * mode, a stacked row for one person) and the last-time history line; the form
 * keeps the state and passes down one set of callbacks.
 */
export function WorkoutExerciseCard({
  index,
  exercise,
  selected,
  lastSets,
  nameOf,
  onNameChange,
  onCellChange,
  onAddSet,
  onRemoveSet,
  onRemoveExercise,
}: {
  index: number;
  exercise: WorkoutExerciseDraft;
  selected: string[];
  lastSets: LastSets;
  nameOf: (userId: string) => string;
  onNameChange: (name: string) => void;
  onCellChange: (setIndex: number, userId: string, patch: Partial<WorkoutCell>) => void;
  onAddSet: () => void;
  onRemoveSet: (setIndex: number) => void;
  onRemoveExercise: () => void;
}) {
  const coupleMode = selected.length > 1;

  const lastFor = (uid: string): ExerciseHistory | undefined => {
    const key = exercise.name.trim().toLowerCase();
    if (!key) return undefined;
    return lastSets[uid]?.[key];
  };
  const repsPlaceholder = (uid: string, si: number) => {
    const v = lastFor(uid)?.sets[si]?.reps;
    return v != null ? `last ${v}` : "reps";
  };
  const kgPlaceholder = (uid: string, si: number) => {
    const v = lastFor(uid)?.sets[si]?.weightKg;
    return v != null ? `last ${v}` : "kg";
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white/70 p-4">
      <div className="mb-3 flex items-center gap-2">
        <input
          value={exercise.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`Exercise ${index + 1} (e.g. Bench press)`}
          maxLength={120}
          list="exercise-names"
          aria-label={`Exercise ${index + 1} name`}
          className={inputCls}
        />
        <button
          type="button"
          onClick={onRemoveExercise}
          className="-ml-1 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-base text-red-700 transition hover:bg-red-50 hover:border-red-400 border border-red-300"
          aria-label="Remove exercise"
        >
          ✕
        </button>
      </div>

      {selected.map((uid) => {
        const history = lastFor(uid);
        if (!history || history.sets.length === 0) return null;
        return (
          <div key={uid} className="mb-3 rounded-xl bg-stone-50 p-3 text-xs">
            <p className="mb-1 font-medium text-stone-600">
              {nameOf(uid)} — last {fmtShortDate(history.date)}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {history.sets.map((s, si) => (
                <span key={si} className="text-stone-600">
                  <span className="text-stone-600">#{si + 1}</span>{" "}
                  {s.reps != null ? `${s.reps}` : "—"} ×{" "}
                  {fmt(s.weightKg, "kg")}
                </span>
              ))}
            </div>
          </div>
        );
      })}

      {coupleMode ? (
        <div
          className="grid items-start gap-x-2 gap-y-2"
          style={{ gridTemplateColumns: `2.75rem repeat(${selected.length}, minmax(0, 1fr))` }}
        >
          <span />
          {selected.map((uid) => (
            <span key={uid} className="truncate text-xs font-medium text-stone-600">
              {nameOf(uid)}
            </span>
          ))}
          {exercise.sets.map((row, si) => (
            <Fragment key={si}>
              <div className="flex items-center gap-1 pt-1.5">
                <span className="text-xs text-stone-600">{si + 1}</span>
                <button
                  type="button"
                  onClick={() => onRemoveSet(si)}
                  className={`${removeSetCls} text-base`}
                  aria-label="Remove set"
                >
                  ✕
                </button>
              </div>
              {selected.map((uid) => {
                const cell = row[uid] ?? emptyCell();
                return (
                  <div key={uid} className="flex min-w-0 flex-wrap gap-1.5">
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={cell.reps}
                      onChange={(e) => onCellChange(si, uid, { reps: e.target.value })}
                      placeholder={repsPlaceholder(uid, si)}
                      aria-label={`Reps, set ${si + 1}, ${nameOf(uid)}`}
                      className={`w-16 shrink-0 ${cellInputCls}`}
                    />
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={cell.weightKg}
                      onChange={(e) => onCellChange(si, uid, { weightKg: e.target.value })}
                      placeholder={kgPlaceholder(uid, si)}
                      aria-label={`Weight in kilograms, set ${si + 1}, ${nameOf(uid)}`}
                      className={`w-16 shrink-0 ${cellInputCls}`}
                    />
                    <input
                      value={cell.notes}
                      onChange={(e) => onCellChange(si, uid, { notes: e.target.value })}
                      placeholder="notes…"
                      maxLength={200}
                      aria-label={`Notes, set ${si + 1}, ${nameOf(uid)}`}
                      className={`min-w-20 flex-1 ${cellInputCls}`}
                    />
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {exercise.sets.map((row, si) => {
            const uid = selected[0];
            const cell = (uid ? row[uid] : undefined) ?? emptyCell();
            return (
              <div key={si} className="flex flex-wrap items-center gap-2">
                <span className="w-12 text-xs text-stone-600">Set {si + 1}</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={cell.reps}
                  onChange={(e) => uid && onCellChange(si, uid, { reps: e.target.value })}
                  placeholder={uid ? repsPlaceholder(uid, si) : "reps"}
                  aria-label={`Reps, set ${si + 1}${uid ? `, ${nameOf(uid)}` : ""}`}
                  className={`w-20 ${cellInputCls}`}
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={cell.weightKg}
                  onChange={(e) => uid && onCellChange(si, uid, { weightKg: e.target.value })}
                  placeholder={uid ? kgPlaceholder(uid, si) : "kg"}
                  aria-label={`Weight in kilograms, set ${si + 1}${uid ? `, ${nameOf(uid)}` : ""}`}
                  className={`w-20 ${cellInputCls}`}
                />
                <input
                  value={cell.notes}
                  onChange={(e) => uid && onCellChange(si, uid, { notes: e.target.value })}
                  placeholder="notes (RPE, form cues…)"
                  maxLength={200}
                  aria-label={`Notes, set ${si + 1}${uid ? `, ${nameOf(uid)}` : ""}`}
                  className={`min-w-40 flex-1 ${cellInputCls}`}
                />
                <button
                  type="button"
                  onClick={() => onRemoveSet(si)}
                  className={`${removeSetCls} text-sm`}
                  aria-label="Remove set"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onAddSet}
        disabled={exercise.sets.length >= MAX_SETS}
        className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 text-sm text-stone-600 transition hover:border-emerald-600 disabled:opacity-50"
      >
        + Add set
      </button>
    </div>
  );
}
