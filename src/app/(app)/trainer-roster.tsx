import Link from "next/link";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ptSessions, scanListColumns, scans } from "@/db/schema";
import type { Session } from "@/lib/auth";
import { microLabelCls } from "@/components/controls";
import { fmt, fmtDate, fmtDateTime, metricDelta } from "@/lib/format";
import { CARD_METRICS } from "@/lib/metrics";

/**
 * The trainer's Home: their member clients at a glance, read-only.
 *
 * Split out of the dashboard route, which was two pages in one file — this half
 * shares nothing with the member dashboard except the greeting, and owns the two
 * queries only it needs.
 */
export async function TrainerRoster({
  session,
  clients,
}: {
  session: Session;
  clients: Array<{ id: string; name: string; role: string }>;
}) {
  const now = new Date();
  const [upcoming, scanRows] = await Promise.all([
    db
      .select()
      .from(ptSessions)
      .where(and(gte(ptSessions.startsAt, now), eq(ptSessions.status, "scheduled")))
      .orderBy(ptSessions.startsAt)
      .limit(20),
    clients.length
      ? db
          .select(scanListColumns)
          .from(scans)
          .where(inArray(scans.userId, clients.map((c) => c.id)))
          .orderBy(desc(scans.scannedAt))
      : Promise.resolve([]),
  ]);
  const clientNameById = new Map(clients.map((c) => [c.id, c.name]));
  const latestByClient = clients.map((client) => {
    const own = scanRows.filter((s) => s.userId === client.id).slice(0, 2);
    return { client, latest: own[0], previous: own[1] };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Hi {session.user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm text-stone-600">Your clients at a glance.</p>
        </div>
      </div>

      {/* Next PT session + Log workout */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white/70 p-6 text-center">
          <p className="text-3xl">📅</p>
          <p className="mt-2 text-base font-medium">Next PT session</p>
          {upcoming.length === 0 ? (
            <p className="mt-1 text-sm text-stone-600">
              Nothing scheduled.{" "}
              <Link href="/calendar" className="inline-flex min-h-11 items-center text-emerald-700 hover:underline">
                Open calendar →
              </Link>
            </p>
          ) : (
            <div className="mt-3 w-full space-y-2">
              {upcoming.slice(0, 2).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-emerald-700">{fmtDateTime(s.startsAt)}</span>
                  <span className="text-stone-600">
                    {s.memberUserId === null
                      ? "Couple session"
                      : clientNameById.get(s.memberUserId) ?? "Client session"}
                    {s.location ? ` · ${s.location}` : ""}
                  </span>
                </div>
              ))}
              <Link href="/calendar" className="inline-flex min-h-11 items-center text-xs text-stone-600 hover:text-stone-700">
                View calendar →
              </Link>
            </div>
          )}
        </div>

        <Link
          href="/workouts/new"
          className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white/70 p-6 text-center transition hover:border-emerald-600 print:hidden"
        >
          <p className="text-3xl">🏋️</p>
          <p className="mt-2 text-base font-medium">Log workout</p>
          <p className="mt-1 text-sm text-stone-600">Add the workout details for your clients.</p>
        </Link>
      </section>

      {/* Latest scan for each client */}
      <section className="grid gap-6 md:grid-cols-2">
        {latestByClient.map(({ client, latest, previous }) => (
          <div key={client.id} className="flex flex-col items-center rounded-2xl border border-stone-200 bg-white/70 p-6 text-center">
            <p className="text-3xl">📊</p>
            <p className="mt-2 text-base font-medium">{client.name}&apos;s latest scan</p>
            {!latest ? (
              <p className="mt-1 text-sm text-stone-600">No scans yet.</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-stone-600">{fmtDate(latest.scannedAt)}</p>
                <div className="mt-3 grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
                  {CARD_METRICS.map((m) => {
                    const delta = previous
                      ? metricDelta(latest[m.key] as number | null, previous[m.key] as number | null)
                      : null;
                    return (
                      <div key={m.key} className="rounded-xl bg-stone-50 p-3">
                        <p className={microLabelCls}>{m.label}</p>
                        <p className="text-lg font-semibold">{fmt(latest[m.key] as number | null, m.unit)}</p>
                        {delta?.text && (
                          <p className="text-xs text-stone-600">
                            {delta.arrow ? `${delta.arrow} ` : ""}
                            {delta.text}{m.unit ? ` ${m.unit}` : ""} vs {fmtDate(previous.scannedAt)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
