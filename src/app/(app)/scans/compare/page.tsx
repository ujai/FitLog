import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { scanListColumns, scans } from "@/db/schema";
import { requireUser, canView } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { CompareSelect } from "@/components/compare-select";
import { deltaToneCls } from "@/components/controls";
import { fmt, fmtDateTimeWithYear, fmtElapsed, metricDelta } from "@/lib/format";
import { METRICS } from "@/lib/metrics";
import { getMetricGoals } from "@/lib/goals";

export const metadata: Metadata = { title: "Compare scans" };

export default async function ComparePage({
  searchParams,
}: PageProps<"/scans/compare">) {
  const session = await requireUser();
  const params = await searchParams;
  const { user: userParam, a, b } = params;
  const { target } = await resolveViewer(session, userParam);
  if (!canView(session, target.id)) {
    return <p className="text-red-700">Not allowed.</p>;
  }
  const goals = await getMetricGoals(target.id);

  const history = await db
    .select(scanListColumns)
    .from(scans)
    .where(eq(scans.userId, target.id))
    .orderBy(asc(scans.scannedAt));

  if (history.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-600">
        Need at least two scans to compare.
        <div className="mt-3">
          <Link href="/scans/new" className="inline-flex min-h-11 items-center text-emerald-700 hover:underline">
            Add a scan →
          </Link>
        </div>
      </div>
    );
  }

  const options = history.map((s) => ({
    id: s.id,
    label: fmtDateTimeWithYear(s.scannedAt),
  }));

  const pickedB = history.find((s) => s.id === b) ?? history[history.length - 1];
  let pickedA = history.find((s) => s.id === a) ?? history[history.length - 2];
  if (pickedA.id === pickedB.id) {
    // Same scan picked twice — compare against the nearest other scan instead
    const idx = history.findIndex((s) => s.id === pickedB.id);
    pickedA = history[idx > 0 ? idx - 1 : idx + 1];
  }

  // The two picks arrive unordered: either select can hold the newer scan. Both are
  // labelled "Earlier scan" / "Later scan", and the Before/After columns and the
  // Change arrow all assume that order — so settle it here. Swapped slots used to
  // print a negative duration and point the change arrow the wrong way.
  const [before, after] = [pickedA, pickedB].sort(
    (x, y) => x.scannedAt.getTime() - y.scannedAt.getTime(),
  );

  // Only targets that can actually score a row count here: a goal for a tape metric
  // (waist) never appears among the scan metrics in the table.
  const hasScoredMetric = METRICS.some((m) => goals[m.key] !== undefined);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Compare scans — {target.name}</h1>
        <Link href="/scans" className="inline-flex min-h-11 items-center text-sm text-stone-600 hover:text-stone-700">
          ← All scans
        </Link>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white/70 p-5">
        <CompareSelect
          options={options}
          a={before.id}
          b={after.id}
          basePath="/scans/compare"
        />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white/70 p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-stone-600">
            {fmtDateTimeWithYear(before.scannedAt)} → {fmtDateTimeWithYear(after.scannedAt)} (
            {fmtElapsed(before.scannedAt, after.scannedAt)})
          </p>
          <div className="flex gap-2 text-sm">
            {before.imageMime && (
              <a
                href={`/api/scans/${before.id}/image`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center text-emerald-700 hover:underline"
              >
                earlier screenshot
              </a>
            )}
            {after.imageMime && (
              <a
                href={`/api/scans/${after.id}/image`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center text-emerald-700 hover:underline"
              >
                later screenshot
              </a>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-600">
                <th className="py-2 pr-4 font-medium">Metric</th>
                <th className="py-2 pr-4 font-medium">Before</th>
                <th className="py-2 pr-4 font-medium">After</th>
                <th className="py-2 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => {
                const from = before[m.key] as number | null;
                const to = after[m.key] as number | null;
                const delta = metricDelta(to, from, goals[m.key]);
                return (
                  <tr key={m.key} className="border-b border-stone-200">
                    <td className="py-2.5 pr-4 text-stone-600">
                      {m.label}
                      {m.hint && (
                        <span className="mt-0.5 block text-xs leading-tight text-stone-600">
                          {m.hint}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">{fmt(from, m.unit)}</td>
                    <td className="py-2.5 pr-4 font-medium">{fmt(to, m.unit)}</td>
                    <td className="py-2.5 font-medium">
                      {delta.text === "" ? (
                        "—"
                      ) : (
                        <span className={`whitespace-nowrap ${deltaToneCls(delta.tone)}`}>
                          {delta.arrow ? `${delta.arrow} ` : ""}
                          {delta.text}
                          {m.unit ? ` ${m.unit}` : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-stone-600">
          {hasScoredMetric
            ? "Changes are judged against the targets you've set — green is closer to the target, amber further away."
            : "No targets set, so changes are shown without a good/bad judgement. Add one under Account and each change will be judged against it."}
        </p>
      </div>

      {(before.notes || after.notes) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { scan: before, title: "Notes (before)" },
            { scan: after, title: "Notes (after)" },
          ]
            .filter(({ scan }) => scan.notes)
            .map(({ scan, title }) => (
              <div key={title} className="rounded-2xl border border-stone-200 bg-white/70 p-4">
                <h3 className="text-sm font-medium text-stone-600">{title}</h3>
                <p className="mt-1 text-sm">{scan.notes}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
