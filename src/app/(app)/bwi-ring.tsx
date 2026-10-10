import Link from "next/link";
import { microLabelCls } from "@/components/controls";
import { fmt } from "@/lib/format";
import { progressTowardTarget, type MetricGoal } from "@/lib/goal-metrics";
import { metric } from "@/lib/metrics";

const BWI = metric("bwiScore");
const BIO_AGE = metric("bioAge");
const RADIUS = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * BWI's journey from the person's own first reading toward their target, with the
 * bio age beneath it — the two composition-quality numbers off the same Evolt sheet,
 * which used to be two of five equal-weight tiles.
 *
 * The fill is measured from the first reading, so the caption says so: any other
 * baseline would imply a starting point the data does not have. With no target there
 * is nothing to measure against, so it says that rather than drawing a ring that
 * would mean nothing. No interaction, so nothing is hidden from print, and it stays
 * a server component.
 */
export function BwiRing({
  score,
  first,
  bioAge,
  goal,
}: {
  score: number | null;
  first: number | null;
  bioAge: number | null;
  goal?: MetricGoal;
}) {
  const fill =
    score !== null && first !== null && goal ? progressTowardTarget(first, score, goal) : null;

  const caption =
    score === null
      ? "No BWI reading yet"
      : !goal
        ? "Set a target to see progress"
        : fill === null
          ? "Not enough history for progress"
          : `${Math.round(fill * 100)}% since your first scan`;

  return (
    <div className="flex flex-col items-center rounded-xl bg-stone-50 p-3 text-center">
      <p className={microLabelCls}>{BWI.label}</p>

      <div className="relative mt-1">
        <svg viewBox="0 0 72 72" className="h-16 w-16" aria-hidden="true">
          <circle
            cx="36"
            cy="36"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            className="stroke-stone-200"
          />
          {fill !== null && (
            <circle
              cx="36"
              cy="36"
              r={RADIUS}
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - fill)}
              transform="rotate(-90 36 36)"
              className="stroke-emerald-700"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-semibold tabular-nums">{fmt(score)}</span>
        </div>
      </div>

      <p className="mt-1 text-xs text-stone-600">
        {!goal && score !== null ? (
          <Link href="/account" className="text-emerald-700 underline-offset-2 hover:underline">
            {caption} →
          </Link>
        ) : (
          caption
        )}
      </p>

      <p className="mt-1 text-xs text-stone-600">
        Bio age {bioAge === null ? "—" : fmt(bioAge, BIO_AGE.unit)}
      </p>
    </div>
  );
}
