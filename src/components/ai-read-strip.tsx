"use client";

import { findMetric } from "@/lib/metrics";
import type { ScanFields } from "@/lib/scan-fields";
import { ScreenshotPreview } from "@/components/screenshot-preview";

/**
 * What the AI read, shown beside the screenshot it read it from so the numbers
 * can be checked against the sheet.
 *
 * The headline values have their own highlighted inputs above; the ones behind
 * the "All Evolt numbers" disclosure are listed here instead, which is what
 * keeps that drawer closed — opening it rebuilt the wall the redesign removed.
 */
export function AiReadStrip({
  src,
  fields,
  hiddenKeys,
}: {
  src: string;
  fields: ScanFields;
  /** Non-headline metric keys the AI filled — the ones with no input in view. */
  hiddenKeys: string[];
}) {
  return (
    <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
      <div className="flex items-center gap-4">
        <ScreenshotPreview src={src} />
        <p className="text-sm text-stone-600">
          Compare the highlighted values with the screenshot — each one clears as you edit it.
        </p>
      </div>
      {hiddenKeys.length > 0 && (
        <div className="mt-3 border-t border-emerald-200 pt-3">
          <p className="text-xs font-medium text-stone-600">
            Also read from the sheet — edit these under “All Evolt numbers” below:
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
            {hiddenKeys.map((key) => {
              const m = findMetric(key);
              return (
                <li key={key}>
                  {m?.label ?? key}{" "}
                  <span className="tabular-nums">
                    {fields[key] ?? "—"}
                    {m?.unit ? ` ${m.unit}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
