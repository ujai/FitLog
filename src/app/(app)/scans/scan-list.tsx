import Link from "next/link";
import type { AiReview, Scan } from "@/db/schema";
import { DeleteWithUndo, UndoDeleteButton } from "@/components/delete-with-undo";
import { EditPanel, EditProvider, EditTrigger } from "@/components/row-edit";
import { ScanForm } from "@/components/scan-form";
import { ScanReviewButton } from "@/components/scan-review-button";
import { deleteScan } from "@/server/scans";
import { fmt, fmtDate } from "@/lib/format";
import { HEADLINE_METRICS } from "@/lib/metrics";
import { scanFieldsFrom } from "@/lib/scan-fields";

/** A history row: `scanListColumns` is the whole row minus the image blob. */
type ScanRow = Omit<Scan, "imageData" | "createdAt">;

/**
 * The scan history, one row per reading.
 *
 * Split out of the scans route, which was five reads, chart shaping and two
 * AI-review presentations in one file. This half owns the row controls — the
 * inline edit panel, the undo-delete, and the per-scan AI review, whose
 * `pointers` json is narrowed where it is rendered — so the route keeps only
 * what it queries.
 */
export function ScanList({
  history,
  reviews,
  userIds,
  targetId,
  canEdit,
  isTrainer,
}: {
  history: ScanRow[];
  reviews: AiReview[];
  userIds: Array<{ id: string; name: string }>;
  targetId: string;
  canEdit: boolean;
  isTrainer: boolean;
}) {
  const reviewByScan = new Map(
    reviews.filter((r) => r.scanId != null).map((r) => [r.scanId as string, r]),
  );

  return (
    <section className="space-y-3">
      <h2 className="font-medium">All scans ({history.length})</h2>
      {history.map((scan, i) => {
        const prev = history[i + 1];
        const scanReview = reviewByScan.get(scan.id);
        const scanPointers = (scanReview?.pointers ?? {}) as {
          positives?: string[];
          focus?: Array<{ area: string; observation: string; suggestion: string }>;
        };
        return (
          <div key={scan.id} className="space-y-2">
          <EditProvider>
          <DeleteWithUndo
            action={deleteScan.bind(null, scan.id)}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-stone-200 bg-white/70 p-4"
          >
            <div className="min-w-32">
              <p className="font-medium">{fmtDate(scan.scannedAt)}</p>
              <p className="text-xs text-stone-600">
                {scan.imageMime ? "📸 screenshot" : "manual entry"}
              </p>
            </div>
            <div className="flex flex-1 flex-wrap gap-x-5 gap-y-1 text-sm">
              {HEADLINE_METRICS.map((m) => {
                return (
                  <span key={m.key} className="text-stone-600" title={m.hint}>
                    <span className="text-stone-600">
                      {m.label}
                      {m.hint && <span className="sr-only"> — {m.hint}</span>}
                    </span>{" "}
                    {fmt(scan[m.key] as number | null, m.unit)}
                  </span>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-sm">
              {prev && (
                <Link
                  href={`/scans/compare?a=${prev.id}&b=${scan.id}`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 transition hover:border-emerald-600"
                >
                  vs previous
                </Link>
              )}
              {scan.imageMime && (
                <a
                  href={`/api/scans/${scan.id}/image`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 transition hover:border-emerald-600"
                >
                  Screenshot
                </a>
              )}
              {canEdit && (
                <>
                  <EditTrigger />
                  <ScanReviewButton scanId={scan.id} hasReview={!!scanReview} />
                  <UndoDeleteButton action={deleteScan.bind(null, scan.id)}>
                    Delete
                  </UndoDeleteButton>
                </>
              )}
            </div>
          </DeleteWithUndo>
          {canEdit && (
            <EditPanel
              form={
                <ScanForm
                  mode="edit"
                  scanId={scan.id}
                  userIds={userIds}
                  defaultUserId={targetId}
                  initial={scanFieldsFrom(scan)}
                />
              }
            />
          )}
          {scanReview && !isTrainer && (
            <div
              id={`scan-review-${scan.id}`}
              tabIndex={-1}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 outline-none"
            >
              <p className="max-w-prose text-sm leading-relaxed text-stone-600">{scanReview.summary}</p>
              {scanPointers.focus?.length ? (
                <ul className="mt-2 max-w-prose list-inside list-disc text-sm text-stone-600">
                  {scanPointers.focus.map((f, j) => (
                    <li key={j}>
                      <span className="font-medium">{f.area}:</span> {f.suggestion}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-xs text-stone-600">
                Generated by {scanReview.model} on {fmtDate(scanReview.createdAt)}. AI output
                is informational — not medical advice.
              </p>
            </div>
          )}
          </EditProvider>
          </div>
        );
      })}
    </section>
  );
}
