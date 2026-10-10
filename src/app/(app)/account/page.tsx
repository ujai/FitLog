import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { requireUser, role } from "@/lib/session";
import { getMetricGoals } from "@/lib/goals";
import { GoalsForm } from "@/components/goals-form";
import { DietTargetsForm } from "@/components/diet-targets-form";
import { getDietTargets } from "@/lib/diet-targets";
import { ImportForm } from "@/components/import-form";
import { AccountSettings } from "./account-settings";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const session = await requireUser();
  const [me] = await db.select().from(userTable).where(eq(userTable.id, session.user.id));
  const [goals, dietTargets] = await Promise.all([
    getMetricGoals(session.user.id),
    getDietTargets(session.user.id),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Account</h1>
      <AccountSettings
        email={me.email}
        icsUrl={`/api/ics/${me.icsToken}`}
        origin={process.env.APP_URL ?? ""}
      />

      <GoalsForm goals={goals} />

      {/* Trainers have no diet diary, so a food target would have nowhere to show. */}
      {role(session) !== "trainer" && <DietTargetsForm targets={dietTargets} />}

      {/* Same domain rules as the server action: trainers keep no scans or diet. */}
      <ImportForm domains={role(session) === "trainer" ? ["measurements"] : ["scans", "measurements", "meals"]} />

      <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
        <h2 className="mb-2 font-medium">Download my data</h2>
        <p className="mb-3 text-sm text-stone-600">
          Everything stored about you — scans, measurements, workouts and meals (photos not included).
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <a
            href="/api/export?format=json"
            className="inline-flex min-h-11 items-center rounded-lg border border-emerald-600 px-4 font-medium text-emerald-700 transition hover:bg-emerald-50"
          >
            JSON (all data)
          </a>
          <a
            href="/api/export?format=csv&domain=scans"
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-stone-600 transition hover:border-emerald-600"
          >
            Scans CSV
          </a>
          <a
            href="/api/export?format=csv&domain=measurements"
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-stone-600 transition hover:border-emerald-600"
          >
            Measurements CSV
          </a>
          <a
            href="/api/export?format=csv&domain=workouts"
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-stone-600 transition hover:border-emerald-600"
          >
            Workouts CSV
          </a>
          <a
            href="/api/export?format=csv&domain=meals"
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-stone-600 transition hover:border-emerald-600"
          >
            Meals CSV
          </a>
        </div>
      </section>
    </div>
  );
}
