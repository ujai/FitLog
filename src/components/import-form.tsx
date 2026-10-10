"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { btnPrimaryCls, btnSecondaryCls, chipCls } from "@/components/controls";
import { importCsv } from "@/server/import";
import type { ImportDomain } from "@/lib/csv-import";

const LABELS: Record<ImportDomain, { label: string; column: string }> = {
  scans: { label: "Scans", column: "scannedAt" },
  measurements: { label: "Measurements", column: "measuredAt" },
  meals: { label: "Meals", column: "loggedAt" },
};

/** Load back-dated history from a CSV in the same shape as the export. */
export function ImportForm({ domains }: { domains: ImportDomain[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [domain, setDomain] = useState<ImportDomain>(domains[0]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, startImport] = useTransition();
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setNotice(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErrors(["Choose a CSV file first"]);
      return;
    }
    startImport(async () => {
      const text = await file.text();
      const result = await importCsv(domain, text);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setNotice(
        `Imported ${result.imported} ${result.imported === 1 ? "row" : "rows"}` +
          (result.skipped > 0 ? `, skipped ${result.skipped} already saved` : "") +
          " ✓",
      );
      if (fileRef.current) fileRef.current.value = "";
      setFileName(null);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-stone-200 bg-white/70 p-5">
      <div>
        <h2 className="font-medium">Import history</h2>
        <p className="mt-1 max-w-prose text-sm text-stone-600">
          Add past records from a CSV with the same columns as the download below. Dates without a
          timezone are read as local time. Rows already saved are skipped, and if any row has a
          problem nothing is imported.
        </p>
      </div>

      <fieldset>
        <legend className="mb-1 block text-xs font-medium text-stone-600">What&apos;s in the file</legend>
        <div className="flex flex-wrap gap-2">
          {domains.map((d) => (
            <label key={d} className={chipCls}>
              <input
                type="radio"
                name="importDomain"
                value={d}
                checked={domain === d}
                onChange={() => setDomain(d)}
                className="sr-only"
              />
              {LABELS[d].label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-600">
          Needs a <code>{LABELS[domain].column}</code> column, e.g. <code>2026-03-14 08:30</code>.
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            setErrors([]);
            setNotice(null);
            setFileName(e.target.files?.[0]?.name ?? null);
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className={btnSecondaryCls}>
          Choose CSV file
        </button>
        <span className="min-w-0 truncate text-sm text-stone-600">{fileName ?? "No file chosen"}</span>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <p className="font-medium">Nothing was imported.</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <button type="submit" disabled={importing || !fileName} className={`w-full sm:w-auto ${btnPrimaryCls}`}>
        {importing ? "Importing…" : "Import"}
      </button>
    </form>
  );
}
