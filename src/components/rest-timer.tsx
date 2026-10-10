"use client";

import { useCallback, useEffect, useState } from "react";
import { chipCls } from "@/components/controls";

const PRESETS = [60, 90, 120];

function format(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Rest timer for the gym floor. Lives in the workout form so it can start
 * itself the moment a set is logged — there is no per-set save step.
 *
 * Counts down against a deadline in an interval callback rather than storing a
 * ref, so re-renders can't drift the clock.
 */
export function useRestTimer(defaultSeconds = 90) {
  const [duration, setDuration] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  const running = endsAt !== null;

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        setEndsAt(null);
        setDone(true);
      }
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  /** Start a fresh rest (a new set was logged). */
  const start = useCallback(() => {
    setDone(false);
    setRemaining(duration);
    setEndsAt(Date.now() + duration * 1000);
  }, [duration]);

  /** Continue a paused countdown. */
  const resume = useCallback(() => {
    setDone(false);
    setEndsAt(Date.now() + Math.max(1, remaining) * 1000);
  }, [remaining]);

  const pause = useCallback(() => setEndsAt(null), []);

  const reset = useCallback(() => {
    setEndsAt(null);
    setDone(false);
    setRemaining(duration);
  }, [duration]);

  const choose = useCallback((seconds: number) => {
    setDuration(seconds);
    setRemaining(seconds);
    setEndsAt(null);
    setDone(false);
  }, []);

  const canResume = !running && !done && remaining > 0 && remaining < duration;

  return { duration, remaining, running, done, canResume, start, resume, pause, reset, choose };
}

type RestTimerState = ReturnType<typeof useRestTimer>;

export function RestTimer({ timer }: { timer: RestTimerState }) {
  const { duration, remaining, running, done, canResume, start, resume, pause, reset, choose } = timer;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-stone-600">Rest timer</span>
          <span className={`text-lg font-semibold tabular-nums ${done ? "text-emerald-700" : ""}`}>
            {format(remaining)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={running ? pause : canResume ? resume : start}
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 text-sm text-stone-600 transition hover:border-stone-400"
          >
            {running ? "Pause" : canResume ? "Resume" : "Start"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 text-sm text-stone-600 transition hover:border-stone-400"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <label key={p} className={chipCls}>
            <input
              type="radio"
              name="rest-preset"
              value={p}
              checked={duration === p}
              onChange={() => choose(p)}
              className="sr-only"
            />
            {p}s
          </label>
        ))}
      </div>

      {/* Auto-starts when a set is logged; says so when it's over. */}
      {done && (
        <p role="status" className="mt-2 text-sm text-emerald-700">
          Rest done — next set.
        </p>
      )}
    </div>
  );
}
