/**
 * The metric catalogue: one source of truth for what a metric is called, what
 * it is measured in, and how it is charted.
 *
 * Pure data with no imports, so a client component can read it without pulling
 * Postgres into the browser bundle. `src/lib/format.ts` renders values,
 * `src/lib/goal-metrics.ts` builds the target selection on top of this, and
 * `src/lib/goals.ts` reads the numbers back out of Postgres.
 *
 * There are two key spaces because there are two tables: `scans` holds the
 * Evolt sheet, `measurements` holds tape measurements. `weightKg` appears in
 * both — the same metric from two sources, which is why `goals.ts` merges the
 * two series rather than treating them as different metrics.
 */

/** Numeric columns of the `scans` table, in Evolt sheet order. */
export type MetricKey =
  | "weightKg"
  | "leanBodyMassKg"
  | "skeletalMuscleMassKg"
  | "proteinKg"
  | "mineralKg"
  | "totalBodyWaterKg"
  | "bodyFatMassKg"
  | "subcutaneousFatMassKg"
  | "visceralFatMassKg"
  | "visceralFatAreaCm2"
  | "visceralFatLevel"
  | "bodyFatPct"
  | "icfKg"
  | "ecfKg"
  | "bmr"
  | "teeKcal"
  | "bioAge"
  | "bwiScore"
  | "abdominalCircumferenceCm"
  | "waistToHipRatio";

/** Numeric columns of the `measurements` (tape) table. */
export type TapeMetricKey =
  | "weightKg"
  | "waistCm"
  | "chestCm"
  | "armCm"
  | "thighCm"
  | "hipCm";

export type Metric<TKey extends string = string> = {
  key: TKey;
  label: string;
  unit: string;
  /** true when lower is generally better */
  lowerBetter?: boolean;
  /** plain-language explanation shown as a tooltip for jargon abbreviations */
  hint?: string;
};

/** A scan metric also carries its chart padding. */
type ScanMetric = Metric<MetricKey> & {
  /** one unit of vertical padding around the chart's data range */
  pad: number;
};

export const METRICS: readonly ScanMetric[] = [
  { key: "weightKg", label: "Weight", unit: "kg", pad: 2 },
  { key: "leanBodyMassKg", label: "Lean body mass", unit: "kg", pad: 1 },
  { key: "skeletalMuscleMassKg", label: "Skeletal muscle mass", unit: "kg", pad: 1 },
  { key: "proteinKg", label: "Protein", unit: "kg", pad: 0.5 },
  { key: "mineralKg", label: "Mineral (bone)", unit: "kg", pad: 0.2 },
  { key: "totalBodyWaterKg", label: "Total body water", unit: "kg", pad: 1 },
  { key: "bodyFatMassKg", label: "Body fat mass", unit: "kg", lowerBetter: true, pad: 1 },
  { key: "subcutaneousFatMassKg", label: "Subcutaneous fat mass", unit: "kg", lowerBetter: true, pad: 1 },
  { key: "visceralFatMassKg", label: "Visceral fat mass", unit: "kg", lowerBetter: true, pad: 0.5 },
  { key: "visceralFatAreaCm2", label: "Visceral fat area", unit: "cm²", lowerBetter: true, pad: 5 },
  { key: "visceralFatLevel", label: "Visceral fat level", unit: "", lowerBetter: true, pad: 0.5 },
  { key: "bodyFatPct", label: "Body fat", unit: "%", lowerBetter: true, pad: 1 },
  { key: "icfKg", label: "Intracellular fluid (ICF)", unit: "kg", hint: "Water inside your cells", pad: 0.5 },
  { key: "ecfKg", label: "Extracellular fluid (ECF)", unit: "kg", hint: "Water between your cells and in blood", pad: 0.5 },
  { key: "bmr", label: "BMR", unit: "kcal", hint: "Calories your body burns at complete rest", pad: 50 },
  { key: "teeKcal", label: "TEE", unit: "kcal", hint: "Total calories burned per day including activity", pad: 50 },
  { key: "bioAge", label: "Bio age", unit: "yr", lowerBetter: true, pad: 2 },
  { key: "bwiScore", label: "BWI score", unit: "", hint: "Body Weight Index — Evolt's overall composition quality score", pad: 0.2 },
  { key: "abdominalCircumferenceCm", label: "Abdominal circumference", unit: "cm", lowerBetter: true, pad: 2 },
  { key: "waistToHipRatio", label: "Waist to hip ratio", unit: "", lowerBetter: true, pad: 0.02 },
];

/** Tape measurements, in the order the form asks for them. */
export const TAPE_METRICS: readonly Metric<TapeMetricKey>[] = [
  { key: "weightKg", label: "Weight", unit: "kg" },
  { key: "waistCm", label: "Waist", unit: "cm", lowerBetter: true },
  { key: "chestCm", label: "Chest", unit: "cm" },
  { key: "armCm", label: "Arm", unit: "cm" },
  { key: "thighCm", label: "Thigh", unit: "cm" },
  { key: "hipCm", label: "Hip", unit: "cm" },
];

const SCAN_BY_KEY = new Map<string, ScanMetric>(METRICS.map((m) => [m.key, m]));
const TAPE_BY_KEY = new Map<string, Metric<TapeMetricKey>>(TAPE_METRICS.map((m) => [m.key, m]));

/**
 * Look up a scan metric by a key that is already known to be valid. Throws
 * rather than asserting, so a key that drifts out of the catalogue fails loudly
 * instead of rendering "undefined" into the page.
 */
export function metric(key: MetricKey): ScanMetric {
  const found = SCAN_BY_KEY.get(key);
  if (!found) throw new Error(`Unknown scan metric: ${key}`);
  return found;
}

/** Look up a tape metric by a key that is already known to be valid. */
export function tapeMetric(key: TapeMetricKey): Metric<TapeMetricKey> {
  const found = TAPE_BY_KEY.get(key);
  if (!found) throw new Error(`Unknown tape metric: ${key}`);
  return found;
}

/**
 * For keys that arrive as plain strings — AI extraction output and database
 * rows — where an unknown key is possible and must not throw.
 */
export function findMetric(key: string): ScanMetric | undefined {
  return SCAN_BY_KEY.get(key);
}

/** "Weight (kg)" — the label with its unit, the way forms and targets read it. */
export function metricLabel(m: Pick<Metric, "label" | "unit">): string {
  return m.unit ? `${m.label} (${m.unit})` : m.label;
}

/**
 * The five numbers that lead the app: the scan form's first group and the scan
 * list's summary strip. Order is display order, which is not catalogue order.
 */
const HEADLINE_KEYS: readonly MetricKey[] = [
  "weightKg",
  "bodyFatPct",
  "skeletalMuscleMassKg",
  "visceralFatLevel",
  "bwiScore",
];

export const HEADLINE_METRICS: readonly ScanMetric[] = HEADLINE_KEYS.map(metric);

const HEADLINE = new Set<string>(HEADLINE_KEYS);

/** Whether a metric is one of the five that lead — the form's first group. */
export function isHeadlineMetric(key: string): boolean {
  return HEADLINE.has(key);
}

/** The rest of the Evolt sheet, for the form's collapsed group. */
export const OTHER_METRICS: readonly ScanMetric[] = METRICS.filter((m) => !HEADLINE.has(m.key));

/** The dashboard's cards: the headline five, plus bio age. */
export const CARD_METRICS: readonly ScanMetric[] = [...HEADLINE_METRICS, metric("bioAge")];
