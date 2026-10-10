import { microLabelCls } from "@/components/controls";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { meals } from "@/db/schema";
import { requireUser, role, canEditOwnData } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { UserTabs } from "@/components/user-tabs";
import { MealForm } from "@/components/meal-form";
import { MealCard } from "@/components/meal-card";
import { PrintButton } from "@/components/print-button";
import { fmt, fmtDate } from "@/lib/format";
import { getDietTargets } from "@/lib/diet-targets";
import { DIET_TARGET_FIELDS } from "@/lib/diet-target-fields";
import { dateKeyInAppTz, parseWallTimeInAppTz, timeKeyInAppTz, toLocalInputInTz } from "@/lib/tz";

export const metadata: Metadata = { title: "Diet diary" };

const DAY_MS = 86_400_000;

/**
 * Calendar dates are handled as UTC-anchored midnights (safe date arithmetic in
 * any server zone); instants for DB range queries are derived via the app
 * timezone, never the server's local zone (UTC on Vercel).
 */
function parseDateParam(param: string | string[] | undefined): Date {
  if (typeof param === "string" && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const anchored = new Date(param + "T00:00:00Z");
    if (!Number.isNaN(anchored.getTime())) return anchored;
  }
  return new Date(dateKeyInAppTz(new Date()) + "T00:00:00Z");
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDay(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

export default async function DietPage({
  searchParams,
}: PageProps<"/diet">) {
  const session = await requireUser();
  if (role(session) === "trainer") redirect("/");
  const params = await searchParams;
  const { user: userParam, date: dateParam, view } = params;
  const { selectable, target } = await resolveViewer(session, userParam);

  const day = parseDateParam(dateParam);
  const weekMode = view === "week";

  const weekStart = shiftDay(day, -((day.getUTCDay() + 6) % 7));
  const periodStart = weekMode ? weekStart : day;
  const days = weekMode ? 7 : 1;
  const start = parseWallTimeInAppTz(`${isoDay(periodStart)}T00:00`);
  const end = parseWallTimeInAppTz(`${isoDay(shiftDay(periodStart, days))}T00:00`);

  const [targets, entryRows] = await Promise.all([
    getDietTargets(target.id),
    db
    .select({
      id: meals.id,
      userId: meals.userId,
      loggedAt: meals.loggedAt,
      mealType: meals.mealType,
      description: meals.description,
      calories: meals.calories,
      proteinG: meals.proteinG,
      carbsG: meals.carbsG,
      fatG: meals.fatG,
      notes: meals.notes,
      imageMime: meals.imageMime,
    })
    .from(meals)
    .where(and(eq(meals.userId, target.id), gte(meals.loggedAt, start), lt(meals.loggedAt, end)))
    .orderBy(asc(meals.loggedAt)),
  ]);

  // The card seeds its edit form from the meal's own wall-clock date/time.
  const entries = entryRows.map((m) => ({ ...m, loggedAtLocal: toLocalInputInTz(m.loggedAt) }));
  // A day with nothing logged is a gap in the diary, not a day of fasting, so it
  // must not drag the weekly average down.
  const loggedDays = new Set(entries.map((m) => dateKeyInAppTz(m.loggedAt))).size;

  const canLog = canEditOwnData(session, target.id);
  const weekTotals = {
    calories: entries.reduce((sum, m) => sum + (m.calories ?? 0), 0),
    proteinG: entries.reduce((sum, m) => sum + (m.proteinG ?? 0), 0),
    carbsG: entries.reduce((sum, m) => sum + (m.carbsG ?? 0), 0),
    fatG: entries.reduce((sum, m) => sum + (m.fatG ?? 0), 0),
  };
  const now = new Date();
  const defaultTime = timeKeyInAppTz(now);
  const todayAnchored = new Date(dateKeyInAppTz(now) + "T00:00:00Z");
  const isCurrentPeriod = weekMode
    ? isoDay(weekStart) === isoDay(shiftDay(todayAnchored, -((todayAnchored.getUTCDay() + 6) % 7)))
    : isoDay(day) === dateKeyInAppTz(now);

  const daysToRender = Array.from({ length: days }, (_, i) => shiftDay(periodStart, i));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Diet diary — {target.name}</h1>
        <div className="flex items-center gap-2 print:hidden">
          <div className="flex overflow-hidden rounded-lg border border-stone-300 text-sm">
            <Link
              href={`/diet?user=${target.id}&date=${isoDay(day)}`}
              className={`inline-flex min-h-11 items-center px-4 ${!weekMode ? "bg-emerald-700 text-white" : "text-stone-600"}`}
            >
              Day
            </Link>
            <Link
              href={`/diet?user=${target.id}&date=${isoDay(day)}&view=week`}
              className={`inline-flex min-h-11 items-center px-4 ${weekMode ? "bg-emerald-700 text-white" : "text-stone-600"}`}
            >
              Week
            </Link>
          </div>
          <PrintButton />
        </div>
      </div>

      <UserTabs users={selectable} activeId={target.id} />

      {/* The period header prints (the dietician handout needs its range);
          only the navigation controls hide. */}
      <div className="flex items-center justify-between text-sm">
        <Link
          href={`/diet?user=${target.id}&date=${isoDay(shiftDay(periodStart, weekMode ? -7 : -1))}${weekMode ? "&view=week" : ""}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 transition hover:border-stone-400 print:hidden"
        >
          ← {weekMode ? "Previous week" : "Previous day"}
        </Link>
        <div className="text-center">
          <p className="font-medium">
            {weekMode
              ? `${fmtDate(periodStart)} – ${fmtDate(shiftDay(periodStart, days - 1))}`
              : fmtDate(day)}
          </p>
          {!isCurrentPeriod && (
            <Link
              href={`/diet?user=${target.id}${weekMode ? "&view=week" : ""}`}
              className="inline-flex min-h-11 items-center text-xs text-emerald-700 hover:underline print:hidden"
            >
              Jump to today
            </Link>
          )}
        </div>
        <Link
          href={`/diet?user=${target.id}&date=${isoDay(shiftDay(periodStart, weekMode ? 7 : 1))}${weekMode ? "&view=week" : ""}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 transition hover:border-stone-400 print:hidden"
        >
          {weekMode ? "Next week" : "Next day"} →
        </Link>
      </div>

      {canLog && !weekMode && (
        <MealForm defaultUserId={target.id} defaultDate={isoDay(day)} defaultTime={defaultTime} />
      )}

      {(weekMode || entries.length > 0 || targets) && (
        <section className="rounded-2xl border border-stone-200 bg-white/70 p-5 print:break-inside-avoid">
          <h2 className="mb-1 font-medium">{weekMode ? "Week totals" : "Day totals"}</h2>
          {weekMode && targets && (
            <p className="mb-3 text-sm text-stone-600">
              Compared with the daily targets as an average over the {loggedDays}{" "}
              {loggedDays === 1 ? "day" : "days"} with meals logged.
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DIET_TARGET_FIELDS.map((f) => {
              const total = weekTotals[f.key];
              const target = targets?.[f.key] ?? null;
              const compared = weekMode ? (loggedDays > 0 ? total / loggedDays : 0) : total;
              return (
                <div key={f.key} className="rounded-xl bg-stone-50 p-3">
                  <p className={microLabelCls}>{f.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{fmt(total, f.unit)}</p>
                  {target !== null && (
                    <>
                      <p className="mt-1 text-xs text-stone-600 tabular-nums">
                        {weekMode ? `${fmt(compared, f.unit)}/day · ` : ""}target {fmt(target, f.unit)}
                      </p>
                      <div
                        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200"
                        role="img"
                        aria-label={`${Math.round((compared / target) * 100)}% of the daily ${f.label.toLowerCase()} target`}
                      >
                        <div
                          className="h-full rounded-full bg-stone-600"
                          style={{ width: `${Math.min(100, (compared / target) * 100)}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {daysToRender.map((d) => {
        const dayEntries = entries.filter((m) => dateKeyInAppTz(m.loggedAt) === isoDay(d));
        const totalKcal = dayEntries.reduce((sum, m) => sum + (m.calories ?? 0), 0);
        return (
          <section key={isoDay(d)} className="space-y-3 print:break-inside-avoid">
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium print:break-after-avoid">
                {weekMode ? fmtDate(d) : "Meals"}
                {dayEntries.length === 0 && <span className="ml-2 text-sm text-stone-600">nothing logged</span>}
              </h2>
              {totalKcal > 0 && (
                <span className="text-sm text-stone-600 tabular-nums">
                  {fmt(totalKcal, "kcal")}
                </span>
              )}
            </div>
            {dayEntries.map((meal) => (
              <MealCard key={meal.id} meal={meal} canLog={canLog} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
