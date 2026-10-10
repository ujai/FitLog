import { findMetric, METRICS, type MetricKey } from "./metrics.ts";
import { toLocalInputInTz } from "./tz.ts";

/**
 * The scan form's field values, keyed by input name — every value a string,
 * because that is what an input holds and what FormData carries.
 *
 * Pure and DOM-free, so the three things the form actually decides live where
 * they can be unit-tested: what a stored draft may restore, how a stored scan
 * seeds an edit, and how the AI's reading lands in the fields. The form keeps
 * the wiring and nothing else.
 */

export type ScanFields = Record<string, string>;

/**
 * Stored drafts are untrusted: they come from localStorage on a shared device,
 * and a stale or hand-edited value must not put the form into a state its own
 * code assumes impossible. Only a plain object whose values are all strings is
 * restorable — anything else is ignored rather than rendered.
 */
export function isScanFields(value: unknown): value is ScanFields {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

/** The stored scan an edit form seeds from. */
type StoredScan = { scannedAt: Date; notes: string | null } & Partial<
  Record<MetricKey, number | null>
>;

/** Seed values for correcting a stored scan — its own numbers, as input strings. */
export function scanFieldsFrom(scan: StoredScan): ScanFields {
  const out: ScanFields = {
    scannedAt: toLocalInputInTz(scan.scannedAt),
    notes: scan.notes ?? "",
  };
  for (const m of METRICS) {
    const value = scan[m.key];
    out[m.key] = value == null ? "" : String(value);
  }
  return out;
}

/**
 * The change an AI reading makes, as a patch to merge over the current fields,
 * plus the metric keys it filled (those the human has not confirmed yet).
 *
 * A patch rather than whole fields, so the caller can merge it in a functional
 * update: extraction is asynchronous, and a person may have typed while it was
 * in flight — replacing the fields outright would discard that.
 *
 * `scannedAt` arrives as an instant and becomes the app timezone's wall clock,
 * the only thing a `datetime-local` input can hold. Everything else is copied
 * only when it is a scalar — an object or array would be stringified into
 * nonsense — and a key outside the metric catalogue is not a field this form
 * renders, so it is not marked for the review strip.
 */
export function extractedScanPatch(data: unknown): { patch: ScanFields; filled: Set<string> } {
  const patch: ScanFields = {};
  const filled = new Set<string>();
  if (typeof data !== "object" || data === null) return { patch, filled };

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (key === "scannedAt") {
      if (typeof value === "string" && value) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) patch.scannedAt = toLocalInputInTz(parsed);
      }
      continue;
    }
    if (value === null || value === undefined || typeof value === "object") continue;
    patch[key] = String(value);
    if (findMetric(key)) filled.add(key);
  }
  return { patch, filled };
}
