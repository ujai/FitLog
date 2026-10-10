"use client";

import { aiInputCls, inputCls, btnPrimaryCls, btnSecondaryCls } from "@/components/controls";
import { AiWait } from "@/components/ai-wait";
import { AiReadStrip } from "@/components/ai-read-strip";
import { ScreenshotPreview } from "@/components/screenshot-preview";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createScan, extractScanAction, updateScan } from "@/server/scans";
import { useEditPanel } from "@/components/row-edit";
import { fileToDataUrl, prepareScanScreenshot } from "@/lib/image-client";
import { useFormDraft, useRestoreDraft } from "@/lib/form-draft";
import { extractedScanPatch, isScanFields, type ScanFields } from "@/lib/scan-fields";
import {
  findMetric,
  isHeadlineMetric,
  metricLabel,
  HEADLINE_METRICS,
  OTHER_METRICS,
} from "@/lib/metrics";
import { toLocalInputInTz } from "@/lib/tz";

export function ScanForm({
  userIds,
  defaultUserId,
  mode = "create",
  scanId,
  initial,
}: {
  userIds: Array<{ id: string; name: string }>;
  defaultUserId: string;
  /** "edit" corrects an existing scan's numbers; the screenshot is untouched. */
  mode?: "create" | "edit";
  scanId?: string;
  initial?: Record<string, string>;
}) {
  const router = useRouter();
  const editPanel = useEditPanel();
  const editing = mode === "edit";
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [extracting, startExtract] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Metric keys the AI filled and the human hasn't confirmed yet */
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set());
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [fields, setFields] = useState<ScanFields>(() => ({
    userId: defaultUserId,
    scannedAt: toLocalInputInTz(new Date()),
    ...(initial ?? {}),
  }));

  // Twenty numbers typed by hand are worth surviving a reload. The screenshot
  // is deliberately excluded: a base64 data URL would blow the storage quota,
  // and the values it produced are what actually need to come back.
  const draftKey = `scan:new:${defaultUserId}`;
  useRestoreDraft(
    draftKey,
    (stored) => {
      if (!isScanFields(stored)) return;
      setFields((f) => ({ ...f, ...stored }));
    },
    !editing,
  );
  const draftStore = useFormDraft(draftKey, fields, !editing);

  /** Reading and compressing the file counts as busy too — see onPickFile. */
  const busy = saving || extracting;

  /**
   * Values the AI read that sit behind the "All Evolt numbers" disclosure.
   * They are listed for verification in the review strip rather than forcing
   * the 15-field drawer open — opening it rebuilt the wall the redesign removed.
   */
  const aiFilledHidden = [...aiFilled].filter((key) => !isHeadlineMetric(key));

  const set = (key: string, value: string) =>
    setFields((f) => {
      if (aiFilled.has(key)) {
        setAiFilled((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
      return { ...f, [key]: value };
    });

  async function onPickFile(file: File) {
    setError(null);
    setNotice(null);
    // Reading and compressing the file runs inside the transition too, so the
    // pending state covers the whole flow. It used to begin at the AI call,
    // which left Save live during the file work.
    startExtract(async () => {
      try {
        const pdf = file.type === "application/pdf";
        const { storage, slices } = pdf
          ? { storage: await fileToDataUrl(file), slices: [await fileToDataUrl(file)] }
          : await prepareScanScreenshot(file);
        setIsPdf(pdf);
        setImageDataUrl(storage);

        const result = await extractScanAction(slices);
        if (!result.ok) {
          setError(result.error + " — you can still enter values manually.");
          return;
        }
        // Merged functionally: extraction is asynchronous, so the person may
        // have typed while it was in flight.
        const { patch, filled } = extractedScanPatch(result.data);
        setFields((f) => ({ ...f, ...patch }));
        setAiFilled(filled);
        if (filled.size > 0) {
          setNotice(
            `AI read ${filled.size} value${filled.size === 1 ? "" : "s"} — check the highlighted fields against the screenshot, then save.`,
          );
        } else {
          setNotice("File read, but no values were recognised — you can enter them manually below.");
        }
      } catch {
        setError("Could not read that file. Is it a valid image or PDF?");
      }
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The button is disabled while busy; this covers a stray Enter as well.
    if (busy) return;
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("userId", fields.userId);
    if (imageDataUrl) formData.set("image", imageDataUrl);
    startSave(async () => {
      if (scanId) {
        const result = await updateScan(scanId, formData);
        if (!result.ok) {
          setError(result.error ?? "Couldn't update the scan. Nothing was lost — try again.");
          return;
        }
        editPanel?.close();
        router.refresh();
        return;
      }
      const result = await createScan(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      draftStore.clear();
      router.push(`/scans?user=${fields.userId}`);
      router.refresh();
    });
  }

  // Two edit panels can be open at once, so field ids must be form-unique.
  const fid = (key: string) => (scanId ? `${key}-${scanId}` : key);

  const numberField = (key: string) => {
    const isAi = aiFilled.has(key);
    const m = findMetric(key);
    return (
      <div key={key}>
        <label htmlFor={fid(key)} className="mb-1 flex items-baseline gap-1.5 text-xs font-medium text-stone-600">
          {m ? metricLabel(m) : key}
          {isAi && (
            <span className="rounded bg-emerald-50 px-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              AI
            </span>
          )}
        </label>
        <input
          id={fid(key)}
          name={key}
          type="number"
          step="any"
          inputMode="decimal"
          value={fields[key] ?? ""}
          onChange={(e) => set(key, e.target.value)}
          className={isAi ? aiInputCls : inputCls}
          placeholder="—"
        />
      </div>
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {!editing && (
        <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
          <h2 className="mb-3 font-medium">1. Evolt screenshot or PDF (optional)</h2>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onPickFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 py-2 text-sm transition hover:border-emerald-600 disabled:opacity-50"
            >
              {imageDataUrl ? "Replace file" : "Upload screenshot or PDF"}
            </button>
            {imageDataUrl && isPdf && (
              <span className="rounded-lg border border-stone-300 bg-white/70 px-3 py-1.5 text-sm text-stone-600">
                PDF attached
              </span>
            )}
            {imageDataUrl && !isPdf && aiFilled.size === 0 && (
              <ScreenshotPreview src={imageDataUrl} />
            )}
            {extracting && <AiWait label="Reading your scan…" />}
          </div>
          {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
        </section>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
        <h2 className="mb-4 font-medium">{editing ? "Scan details" : "2. Scan details"}</h2>
        {aiFilled.size > 0 && imageDataUrl && !isPdf && (
          <AiReadStrip src={imageDataUrl} fields={fields} hiddenKeys={aiFilledHidden} />
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!editing && userIds.length > 1 && (
            <div>
              <label htmlFor="userId" className="mb-1 block text-xs font-medium text-stone-600">
                Person
              </label>
              <select
                id="userId"
                name="userId"
                value={fields.userId}
                onChange={(e) => set("userId", e.target.value)}
                className={inputCls}
              >
                {userIds.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label htmlFor={fid("scannedAt")} className="mb-1 block text-xs font-medium text-stone-600">
              Scan date &amp; time
            </label>
            <input
              id={fid("scannedAt")}
              name="scannedAt"
              type="datetime-local"
              required
              value={fields.scannedAt}
              onChange={(e) => set("scannedAt", e.target.value)}
              className={inputCls}
            />
          </div>
          {HEADLINE_METRICS.map((m) => numberField(m.key))}
        </div>

        <details
          open={showAllMetrics}
          onToggle={(e) => setShowAllMetrics((e.target as HTMLDetailsElement).open)}
          className="group mt-4"
        >
          <summary className="inline-flex min-h-11 cursor-pointer list-none select-none items-center gap-1.5 rounded-lg text-sm font-medium text-emerald-700 transition hover:text-emerald-800 [&::-webkit-details-marker]:hidden">
            All Evolt numbers (optional)
            {aiFilledHidden.length > 0 && (
              <span className="rounded bg-emerald-50 px-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {aiFilledHidden.length} read by AI
              </span>
            )}
            <svg
              className="h-4 w-4 text-stone-600 transition-transform group-open:rotate-180"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 7.5 10 12.5 15 7.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OTHER_METRICS.map((m) => numberField(m.key))}
          </div>
        </details>

        <div className="mt-4">
          <label htmlFor={fid("notes")} className="mb-1 block text-xs font-medium text-stone-600">
            Notes
          </label>
          <textarea
            id={fid("notes")}
            name="notes"
            rows={2}
            value={fields.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            className={inputCls}
            placeholder="e.g. morning scan, fasted"
          />
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className={`${btnPrimaryCls} w-full sm:w-auto`}
        >
          {extracting
            ? "Waiting for AI…"
            : saving
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Save scan"}
        </button>
        {editing && (
          <button type="button" onClick={() => editPanel?.close()} className={btnSecondaryCls}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
