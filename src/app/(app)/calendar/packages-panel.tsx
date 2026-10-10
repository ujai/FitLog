import { DeleteWithUndo, UndoDeleteButton } from "@/components/delete-with-undo";
import { microLabelCls } from "@/components/controls";
import { deletePtPackage } from "@/server/packages";
import { fmtDate } from "@/lib/format";
import type { PackageBalance } from "@/lib/packages";
import { PackageForm } from "./package-form";

type Package = {
  id: string;
  memberUserId: string | null;
  sessions: number;
  startsOn: Date;
  notes: string | null;
  /** The trainer/admin who recorded it; null for older rows or a deleted account. */
  addedByName?: string | null;
};

function balanceText(remaining: number): string {
  if (remaining < 0) return `${-remaining} over`;
  return `${remaining} left`;
}

/**
 * Prepaid sessions left, per member and for the couple. Members see only their
 * own balances; the trainer also records and removes packages here.
 */
export function PackagesPanel({
  balances,
  packages,
  canManage,
  members,
  nameOf,
  today,
}: {
  balances: PackageBalance[];
  packages: Package[];
  canManage: boolean;
  members: Array<{ id: string; name: string }>;
  nameOf: (memberUserId: string | null) => string;
  today: string;
}) {
  if (!canManage && balances.length === 0) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-white/70 p-5 print:hidden">
      <h2 className="font-medium">Session packages</h2>

      {balances.length === 0 ? (
        <p className="text-sm text-stone-600">
          No packages yet. Add one to count down prepaid sessions as they are marked done.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {balances.map((b) => (
            <div key={b.memberUserId ?? "couple"} className="rounded-xl bg-stone-50 p-3">
              <p className={microLabelCls}>{nameOf(b.memberUserId)}</p>
              <p
                className={`text-lg font-semibold tabular-nums ${b.remaining <= 0 ? "text-amber-700" : ""}`}
              >
                {balanceText(b.remaining)}
              </p>
              <p className="text-xs text-stone-600 tabular-nums">
                {b.used} of {b.purchased} used since {fmtDate(b.since)}
              </p>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <>
          {packages.length > 0 && (
            <ul className="space-y-2">
              {packages.map((p) => (
                <li key={p.id}>
                  <DeleteWithUndo
                    action={deletePtPackage.bind(null, p.id)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 px-3 py-1"
                  >
                    <span className="text-sm">
                      {p.sessions} sessions · {nameOf(p.memberUserId)} · from {fmtDate(p.startsOn)}
                      {p.notes && <span className="text-stone-600"> · {p.notes}</span>}
                      {p.addedByName && <span className="text-stone-600"> · added by {p.addedByName}</span>}
                    </span>
                    <UndoDeleteButton action={deletePtPackage.bind(null, p.id)}>Delete</UndoDeleteButton>
                  </DeleteWithUndo>
                </li>
              ))}
            </ul>
          )}
          <details className="group">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-emerald-700 [&::-webkit-details-marker]:hidden">
              + Add a package
            </summary>
            <div className="mt-3">
              <PackageForm members={members} today={today} />
            </div>
          </details>
        </>
      )}
    </section>
  );
}
