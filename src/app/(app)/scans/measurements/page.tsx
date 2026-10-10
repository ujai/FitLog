import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { measurementListColumns, measurements } from "@/db/schema";
import { requireUser, canEditScanData } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { UserTabs } from "@/components/user-tabs";
import { Sparklines } from "@/components/sparkline";
import { getMetricGoals } from "@/lib/goals";
import { MeasurementForm } from "@/components/measurement-form";
import { UndoDeleteButton } from "@/components/delete-with-undo";
import { EditPanel, EditProvider, EditTrigger } from "@/components/row-edit";
import { deleteMeasurement } from "@/server/measurements";
import { fmt, fmtDateTime } from "@/lib/format";
import { TAPE_METRICS, tapeMetric } from "@/lib/metrics";
import { dateKeyInAppTz, toLocalInputInTz } from "@/lib/tz";

export const metadata: Metadata = { title: "Tape measurements" };

/** Seed values for the inline edit form — the row's own stored numbers. */
function measurementInitial<T extends { measuredAt: Date; notes: string | null }>(
  m: T,
): Record<string, string> {
  const row = m as unknown as Record<string, unknown>;
  const out: Record<string, string> = {
    measuredAt: toLocalInputInTz(m.measuredAt),
    notes: m.notes ?? "",
  };
  for (const field of TAPE_METRICS) {
    const value = row[field.key];
    out[field.key] = value == null ? "" : String(value);
  }
  return out;
}

/** The edit/delete pair, identical in the phone card and the table row. */
function RowActions({ id }: { id: string }) {
  return (
    <div className="flex items-center gap-2">
      <EditTrigger />
      <UndoDeleteButton action={deleteMeasurement.bind(null, id)}>Delete</UndoDeleteButton>
    </div>
  );
}

/** The inline edit panel — must sit inside an EditProvider, as both callers do. */
function RowEditPanel({
  id,
  defaultUserId,
  initial,
}: {
  id: string;
  defaultUserId: string;
  initial: Record<string, string>;
}) {
  return (
    <EditPanel
      form={
        <MeasurementForm defaultUserId={defaultUserId} measurementId={id} initial={initial} />
      }
    />
  );
}

/** Tape measurements were crowding the scan list; they live on their own route. */
export default async function MeasurementsPage({
  searchParams,
}: PageProps<"/scans/measurements">) {
  const session = await requireUser();
  const { user: userParam } = await searchParams;
  const { selectable, target } = await resolveViewer(session, userParam, { hideTrainer: true });
  // First-person data: write controls only on your own page.
  const canEdit = canEditScanData(session, target.id);

  const [measurementRows, goals] = await Promise.all([
    db
      .select(measurementListColumns)
      .from(measurements)
      .where(eq(measurements.userId, target.id))
      .orderBy(desc(measurements.measuredAt)),
    getMetricGoals(target.id),
  ]);

  const chartData = [...measurementRows]
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime())
    .map((m) => ({
      date: dateKeyInAppTz(m.measuredAt),
      // Numeric timestamp for the time-scaled axis — see Sparklines.
      ts: m.measuredAt.getTime(),
      weightKg: m.weightKg,
      waistCm: m.waistCm,
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/scans${target.id !== session.user.id ? `?user=${target.id}` : ""}`}
            className="inline-flex min-h-11 items-center text-sm text-stone-600 underline-offset-2 hover:underline"
          >
            ← Scans
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Tape measurements</h1>
        </div>
      </div>

      <UserTabs users={selectable} activeId={target.id} />

      <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
        <h2 className="mb-2 font-medium">Trends</h2>
        {chartData.length >= 2 ? (
          <Sparklines
            data={chartData}
            goals={goals}
            series={[
              { ...tapeMetric("weightKg"), color: "#57534e", pad: 2 },
              { ...tapeMetric("waistCm"), color: "#d97706", pad: 2 },
            ]}
          />
        ) : (
          <p className="py-4 text-center text-sm text-stone-600">
            Add at least two measurements to see trends.
          </p>
        )}

        {canEdit && (
          <div className="mt-6">
            <MeasurementForm defaultUserId={target.id} />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
        <h2 className="mb-3 font-medium">
          All measurements ({measurementRows.length})
        </h2>

        {measurementRows.length === 0 ? (
          <p className="text-sm text-stone-600">
            No measurements yet — add your first one above.
          </p>
        ) : (
          <>
            {/* Phones: one card per entry. A nine-column table can't fit 390px,
                and shrinking it horizontally scrolled the whole page. */}
            <ul className="space-y-3 sm:hidden">
              {measurementRows.map((m) => (
                <li key={m.id} className="rounded-xl border border-stone-200 p-3">
                  <EditProvider>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{fmtDateTime(m.measuredAt)}</p>
                      {canEdit && <RowActions id={m.id} />}
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      {TAPE_METRICS.map((field) => (
                        <div key={field.key} className="flex items-baseline justify-between gap-2">
                          <dt className="text-stone-600">{field.label}</dt>
                          <dd className="tabular-nums">{fmt(m[field.key], field.unit)}</dd>
                        </div>
                      ))}
                    </dl>
                    {m.notes && <p className="mt-2 text-xs text-stone-600">{m.notes}</p>}
                    {canEdit && (
                      <RowEditPanel
                        id={m.id}
                        defaultUserId={target.id}
                        initial={measurementInitial(m)}
                      />
                    )}
                  </EditProvider>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-600">
                    <th className="py-2 pr-4 font-medium">When</th>
                    {TAPE_METRICS.map((field) => (
                      <th key={field.key} className="py-2 pr-4 font-medium">
                        {field.label}
                      </th>
                    ))}
                    <th className="py-2 pr-4 font-medium">Notes</th>
                    {canEdit && (
                      <th className="py-2 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {measurementRows.map((m) => (
                    <Fragment key={m.id}>
                      <EditProvider>
                        <tr className="border-b border-stone-100 last:border-0">
                          <td className="py-2 pr-4 whitespace-nowrap">{fmtDateTime(m.measuredAt)}</td>
                          {TAPE_METRICS.map((field) => (
                            <td key={field.key} className="py-2 pr-4 tabular-nums">
                              {fmt(m[field.key], field.unit)}
                            </td>
                          ))}
                          <td className="py-2 pr-4 max-w-40 truncate text-stone-600" title={m.notes ?? undefined}>
                            {m.notes ?? "—"}
                          </td>
                          {canEdit && (
                            <td className="py-2">
                              <RowActions id={m.id} />
                            </td>
                          )}
                        </tr>
                        {/* Collapses to nothing while closed, so an empty panel
                            row costs no height. The span is When + the values +
                            Notes, plus Actions when it is there. */}
                        <tr>
                          <td colSpan={TAPE_METRICS.length + 2 + (canEdit ? 1 : 0)} className="p-0">
                            {canEdit && (
                              <RowEditPanel
                                id={m.id}
                                defaultUserId={target.id}
                                initial={measurementInitial(m)}
                              />
                            )}
                          </td>
                        </tr>
                      </EditProvider>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
