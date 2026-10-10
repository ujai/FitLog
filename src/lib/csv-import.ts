/**
 * Turn an uploaded CSV into rows ready to insert — pure, so the rules are unit
 * tested without a database. The accepted format is the app's own export (same
 * headers), so an export always imports back; unknown columns such as
 * `hasImage` are ignored.
 */
import type { z } from "zod";
import { measurementInput, mealInput, scanInput } from "./validation.ts";
import { METRICS } from "./metrics.ts";
import { parseCsv } from "./csv.ts";
import { parseWallTimeInAppTz } from "./tz.ts";

export const IMPORT_DOMAINS = ["scans", "measurements", "meals"] as const;
export type ImportDomain = (typeof IMPORT_DOMAINS)[number];

export const MAX_IMPORT_ROWS = 2000;

type DomainSpec = {
  timestamp: string;
  schema: z.ZodObject<z.ZodRawShape>;
  fields: readonly string[];
};

const SPECS: Record<ImportDomain, DomainSpec> = {
  scans: { timestamp: "scannedAt", schema: scanInput, fields: [...METRICS.map((m) => m.key), "notes"] },
  measurements: {
    timestamp: "measuredAt",
    schema: measurementInput,
    fields: ["weightKg", "waistCm", "chestCm", "armCm", "thighCm", "hipCm", "notes"],
  },
  meals: {
    timestamp: "loggedAt",
    schema: mealInput,
    fields: ["mealType", "description", "calories", "proteinG", "carbsG", "fatG", "notes"],
  },
};

/**
 * An instant with a zone (`2026-09-30T00:43:00.000Z`, `…+08:00` — what the
 * export writes) is taken as is. A zoneless date and time, or a bare date, is
 * wall time in APP_TZ — the reading a person typing history into a spreadsheet
 * means, and the one the datetime-local inputs use.
 */
export function parseImportTimestamp(raw: string): Date {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    return new Date(s);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseWallTimeInAppTz(`${s}T00:00`);
  return parseWallTimeInAppTz(s);
}

export type ImportRow = { at: Date; values: Record<string, unknown> };

export function buildImportRows(
  domain: ImportDomain,
  text: string,
  userId: string,
): { ok: true; rows: ImportRow[] } | { ok: false; errors: string[] } {
  const spec = SPECS[domain];
  const [header, ...body] = parseCsv(text);
  if (!header) return { ok: false, errors: ["The file is empty"] };
  const columns = header.map((h) => h.trim());
  const tsIndex = columns.indexOf(spec.timestamp);
  if (tsIndex === -1) return { ok: false, errors: [`Missing the "${spec.timestamp}" column`] };
  if (!spec.fields.some((f) => columns.includes(f))) {
    return { ok: false, errors: [`No known columns — expected some of: ${spec.fields.join(", ")}`] };
  }
  if (body.length === 0) return { ok: false, errors: ["The file has a header but no rows"] };
  if (body.length > MAX_IMPORT_ROWS) {
    return { ok: false, errors: [`At most ${MAX_IMPORT_ROWS} rows per import (this file has ${body.length})`] };
  }

  const errors: string[] = [];
  const rows: ImportRow[] = [];
  const seen = new Set<number>();
  body.forEach((cells, i) => {
    const line = i + 2; // the header is line 1
    const at = parseImportTimestamp(cells[tsIndex] ?? "");
    if (Number.isNaN(at.getTime())) {
      errors.push(`Line ${line}: "${cells[tsIndex] ?? ""}" is not a date and time`);
      return;
    }
    if (seen.has(at.getTime())) {
      errors.push(`Line ${line}: the same ${spec.timestamp} appears twice in the file`);
      return;
    }
    seen.add(at.getTime());

    const raw: Record<string, unknown> = { userId, [spec.timestamp]: "imported" };
    for (const field of spec.fields) {
      const index = columns.indexOf(field);
      const value = index === -1 ? "" : (cells[index] ?? "").trim();
      raw[field] = field === "notes" ? value || null : value;
    }
    const parsed = spec.schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push(`Line ${line}: ${String(issue.path[0] ?? "")} — ${issue.message}`);
      return;
    }
    const values: Record<string, unknown> = {};
    for (const field of spec.fields) values[field] = (parsed.data as Record<string, unknown>)[field] ?? null;
    rows.push({ at, values });
  });

  if (errors.length > 0) {
    const shown = errors.slice(0, 5);
    if (errors.length > 5) shown.push(`…and ${errors.length - 5} more`);
    return { ok: false, errors: shown };
  }
  return { ok: true, rows };
}
