/**
 * The month a page is showing, from a `?month=YYYY-MM` param.
 *
 * Shared by the calendar and the month-in-review handout so "which month" means
 * exactly the same thing on both — including the fallback when the param is
 * absent or malformed, which is what keeps the handout's header and its data
 * from ever disagreeing with the calendar's.
 */
import { fmtMonthYear } from "./format.ts";
import { dateKeyInAppTz, monthBoundsInAppTz } from "./tz.ts";

type MonthRange = {
  /** First instant of the month (00:00 APP_TZ) and the first instant of the next */
  start: Date;
  end: Date;
  /** "September 2026" */
  label: string;
  /** `YYYY-MM` of the month on screen — the value a link should carry */
  key: string;
  prev: string;
  next: string;
  year: number;
  /** 0-indexed, unlike the 1-indexed param */
  month: number;
};

export function monthRange(monthParam?: string | string[]): MonthRange {
  const now = new Date();
  // The opening month is the app timezone's, not the server's: on Vercel (UTC) the
  // first eight hours of every month would otherwise open on the previous one.
  const [todayYear, todayMonth] = dateKeyInAppTz(now).split("-").map(Number);
  let year = todayYear;
  let month = todayMonth - 1;
  if (typeof monthParam === "string" && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    // The shape test alone accepts 2026-00 and 2026-13, which `monthBoundsInAppTz`
    // would roll over JS-style — leaving the label, the `key` link and the data
    // window able to disagree. Anything outside a real month is not a month.
    if (m >= 1 && m <= 12) {
      year = y;
      month = m - 1;
    }
  }
  const { start, end } = monthBoundsInAppTz(year, month);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start,
    end,
    label: fmtMonthYear(start),
    key: `${year}-${pad(month + 1)}`,
    prev: `${month === 0 ? year - 1 : year}-${pad(month === 0 ? 12 : month)}`,
    next: `${month === 11 ? year + 1 : year}-${pad(month === 11 ? 1 : month + 2)}`,
    year,
    month,
  };
}
