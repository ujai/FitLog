import type { WorkoutInput } from "./validation";

/**
 * The workout form's data model, the guarded restore of a stored draft, and the
 * payload the create/update actions take.
 *
 * Pure and DOM-free, so the rules live where they can be unit-tested: the form
 * component owns the wiring and nothing else. A stored draft is untrusted input
 * — it comes from localStorage on a shared device — so the only shape that can
 * be restored is one this module says the form can render.
 */

export type WorkoutCell = { reps: string; weightKg: string; notes: string };
/** One shared set row: per-person cell values keyed by userId */
export type WorkoutSetRow = Record<string, WorkoutCell>;
export type WorkoutExerciseDraft = { name: string; sets: WorkoutSetRow[] };

/** One person's most recent logged sets for a named exercise. */
export type ExerciseHistory = {
  date: Date;
  sets: Array<{ reps: number | null; weightKg: number | null }>;
};
/** Per user, by lowercased exercise name. */
export type LastSets = Record<string, Record<string, ExerciseHistory>>;

/** Existing values when correcting a logged workout. */
export type WorkoutInitial = {
  userIds: string[];
  /** "YYYY-MM-DD" in the app timezone */
  date: string;
  title: string;
  notes: string;
  exercises: WorkoutExerciseDraft[];
};

/** Everything a half-typed session needs to come back after a reload. */
export type WorkoutDraft = {
  selected: string[];
  date: string;
  title: string;
  notes: string;
  exercises: WorkoutExerciseDraft[];
};

export const DEFAULT_SETS = 3;
/** Mirrors the server schema's own bounds, so the UI cannot build an invalid payload. */
export const MAX_SETS = 20;
export const MAX_EXERCISES = 30;

export function emptyCell(): WorkoutCell {
  return { reps: "", weightKg: "", notes: "" };
}

export function makeRow(userIds: string[]): WorkoutSetRow {
  return Object.fromEntries(userIds.map((uid) => [uid, emptyCell()]));
}

/**
 * Stored drafts are untrusted. Only a shape this form can actually render is
 * restored; anything else is ignored rather than crashed on.
 */
export function isWorkoutDraft(value: unknown): value is WorkoutDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  const isSetRow = (row: unknown) => typeof row === "object" && row !== null && !Array.isArray(row);
  return (
    Array.isArray(draft.selected) &&
    draft.selected.every((id) => typeof id === "string") &&
    typeof draft.date === "string" &&
    typeof draft.title === "string" &&
    typeof draft.notes === "string" &&
    Array.isArray(draft.exercises) &&
    draft.exercises.every((exercise) => {
      if (typeof exercise !== "object" || exercise === null) return false;
      const ex = exercise as Record<string, unknown>;
      return (
        typeof ex.name === "string" &&
        Array.isArray(ex.sets) &&
        (ex.sets as unknown[]).every(isSetRow)
      );
    })
  );
}

/**
 * Turn the typed state into what the server action takes, or the first reason it
 * cannot be saved. The order is the order the person meets the form: pick who
 * you're logging for, title it, name an exercise, give everyone a set.
 */
export function buildWorkoutInput(
  draft: WorkoutDraft,
  nameOf: (userId: string) => string,
): { ok: true; input: WorkoutInput } | { ok: false; error: string } {
  const { selected, date, title, notes, exercises } = draft;
  if (selected.length === 0) return { ok: false, error: "Select at least one person to log for" };

  const input: WorkoutInput = {
    userIds: selected,
    date,
    title: title.trim(),
    notes: notes.trim() || null,
    exercises: exercises
      .map((ex) => ({
        name: ex.name.trim(),
        participants: selected.map((uid) => ({
          userId: uid,
          sets: ex.sets
            .map((row) => {
              const cell = row[uid] ?? emptyCell();
              return {
                reps: cell.reps === "" ? null : Number(cell.reps),
                weightKg: cell.weightKg === "" ? null : Number(cell.weightKg),
                notes: cell.notes.trim() || null,
              };
            })
            .filter((s) => s.reps !== null || s.weightKg !== null || s.notes !== null),
        })),
      }))
      .filter((ex) => ex.name.length > 0),
  };

  if (input.title.length === 0) return { ok: false, error: "Give the workout a title" };
  if (input.exercises.length === 0) return { ok: false, error: "Add at least one exercise" };

  const missingSets = selected.filter(
    (uid) => !input.exercises.some((ex) => ex.participants.some((p) => p.userId === uid && p.sets.length > 0)),
  );
  if (missingSets.length > 0) {
    return { ok: false, error: `Add at least one set for ${missingSets.map(nameOf).join(", ")} — or unselect them` };
  }

  return { ok: true, input };
}
