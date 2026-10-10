import { microLabelCls } from "@/components/controls";
import { fmtTime, fmtUntil, fmtWeekdayDate } from "@/lib/format";

export type LeadSession = {
  id: string;
  startsAt: Date;
  durationMin: number;
  location: string | null;
  notes: string | null;
};

/**
 * The calendar's focal element. Everyone opens this page to ask one question —
 * when is the next session — and a wall of equal-weight month cells answers it
 * only by being read. This answers it first, and the grid becomes its context.
 *
 * Facts only: editing, status and delete stay in the month grid's day dialog
 * and the agenda rows, which already own them. A third home for the same
 * controls would be a third place to keep in step.
 *
 * `who` is the caller's, because the same row reads differently from each side:
 * a member's own session is "Your session", while the trainer reading it wants
 * the member's name.
 */
export function NextSession({
  session,
  who,
  canManage,
  now,
}: {
  session: LeadSession | null;
  who: string;
  canManage: boolean;
  now: Date;
}) {
  // A session already under way stays the lead and says so, rather than the card
  // counting down to the one after it while the household is mid-session. The
  // query hands us only future and currently-running rows, so a start in the
  // past means running.
  const running = session !== null && session.startsAt.getTime() <= now.getTime();
  const detail = session
    ? [who, `${session.durationMin} min`, session.location].filter(Boolean).join(" · ")
    : "";

  return (
    <section className="rounded-2xl border border-stone-200 bg-white/70 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={microLabelCls}>Next session</p>
        {session && (
          <p className="text-xs text-stone-600">
            {running ? "Happening now" : fmtUntil(session.startsAt, now)}
          </p>
        )}
      </div>

      {session ? (
        <>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {fmtWeekdayDate(session.startsAt)} · {fmtTime(session.startsAt)}
          </p>
          <p className="mt-1 text-sm text-stone-600">{detail}</p>
        </>
      ) : (
        <p className="mt-2 text-sm text-stone-600">
          Nothing scheduled yet.
          {/* Phones have no day to pick — the header's Add session button is
              their way in, so the pointer would be a dead end there. */}
          {canManage && <span className="hidden sm:inline"> Pick a day below to book one.</span>}
        </p>
      )}

      {session?.notes && (
        // The rule spans the card; the measure applies to the text, not to the
        // divider, or the line stops halfway across on a desktop card.
        <div className="mt-4 border-t border-stone-200 pt-3">
          <p className="max-w-prose text-sm leading-relaxed whitespace-pre-wrap">
            {session.notes}
          </p>
        </div>
      )}
    </section>
  );
}
