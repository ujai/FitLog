/**
 * App-wide scheduling timezone. This is a single-household app: everyone shares
 * one zone, so zoneless datetime-local inputs ("2026-09-07T09:00") are
 * interpreted as wall time in this zone — not in the server's zone, which is
 * UTC on Vercel and would shift every stored instant.
 *
 * `NEXT_PUBLIC_APP_TIMEZONE` is the same value exposed to the browser, and it is
 * checked first because client components render and seed dates too (the charts,
 * the header, every create form's default). Without it they would silently fall
 * back to the literal default and disagree with the server — so **set both, to
 * the same value**, and rebuild: Next inlines `NEXT_PUBLIC_*` at build time.
 */
export const APP_TZ =
  (process.env.NEXT_PUBLIC_APP_TIMEZONE || process.env.APP_TIMEZONE || "").trim() ||
  "Asia/Kuala_Lumpur";

type ZonedParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

function zonedParts(d: Date, tz: string): ZonedParts {
  const map: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d)) {
    map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24, // "24" can appear for midnight on some runtimes
    minute: Number(map.minute),
  };
}

/** Milliseconds the zone is ahead of UTC at the given instant. */
function tzOffsetMs(d: Date, tz: string): number {
  const p = zonedParts(d, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - d.getTime();
}

/**
 * Interpret a zoneless datetime-local string ("YYYY-MM-DDTHH:MM" or with
 * seconds) as wall time in APP_TZ and return the real instant. Returns an
 * invalid Date for unparseable input, for a calendar date that does not exist
 * ("2026-02-30", which Date.UTC would roll into March), and for a wall time
 * the zone skips at a DST change — every caller only checks for NaN, so
 * anything else would be stored silently as a different moment.
 */
export function parseWallTimeInAppTz(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return new Date(NaN);
  const [y, mo, d, h, mi, se] = m.slice(1).map((part) => Number(part ?? 0));
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || se > 59) return new Date(NaN);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, se);
  if (new Date(asUtc).getUTCDate() !== d) return new Date(NaN);
  // Offset at that wall time (two passes to settle DST edges; KL has none).
  let guess = new Date(asUtc);
  for (let i = 0; i < 2; i++) {
    guess = new Date(asUtc - tzOffsetMs(guess, APP_TZ));
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  if (toLocalInputInTz(guess) !== `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`) return new Date(NaN);
  return guess;
}

/** Local-date key (YYYY-MM-DD) of an instant in APP_TZ. */
export function dateKeyInAppTz(d: Date): string {
  const p = zonedParts(d, APP_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * Shift a "YYYY-MM-DD" calendar key by whole days. Pure calendar arithmetic —
 * it never consults the runtime's zone, so it answers the same on a UTC server
 * as on a laptop in the app's own zone.
 */
export function dateKeyAddDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * Whole calendar days from one "YYYY-MM-DD" key to another — the arithmetic
 * behind "3 days ago" and "in 3 days". Both sides are app-timezone date keys,
 * so the answer never depends on the runtime's zone; and because it compares
 * dates rather than instants, 11pm and 1am are a day apart, not two hours.
 */
export function calendarDaysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * The Monday that starts the app-timezone week containing `d`, as a calendar
 * key. Bucket weeks through this, not date-fns' `startOfWeek`: that reads the
 * *runtime's* zone, so on a UTC server every session before 08:00 in
 * Asia/Kuala_Lumpur on a Monday — when UTC is still Sunday — lands in the
 * previous week, splitting one training week across two buckets.
 */
export function weekKeyInAppTz(d: Date): string {
  const key = dateKeyInAppTz(d);
  const [y, m, day] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, day)).getUTCDay(); // 0 = Sunday
  return dateKeyAddDays(key, -((weekday + 6) % 7));
}

/** "HH:MM" wall-clock time of an instant in APP_TZ. */
export function timeKeyInAppTz(d: Date): string {
  const p = zonedParts(d, APP_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** First instant of a month (00:00 APP_TZ) and the first instant of the next. */
export function monthBoundsInAppTz(year: number, monthIndex: number): { start: Date; end: Date } {
  const bounds = (y: number, m: number) => parseWallTimeInAppTz(`${y}-${String(m + 1).padStart(2, "0")}-01T00:00`);
  return { start: bounds(year, monthIndex), end: bounds(monthIndex === 11 ? year + 1 : year, (monthIndex + 1) % 12) };
}

/** Format an instant as a datetime-local value ("YYYY-MM-DDTHH:MM") in a zone. */
export function toLocalInputInTz(d: Date, tz: string = APP_TZ): string {
  const p = zonedParts(d, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
