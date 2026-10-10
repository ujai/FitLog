import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireUser, role, canEditScanData, canBeScanTarget } from "@/lib/session";
import { ScanForm } from "@/components/scan-form";

export const metadata: Metadata = { title: "New scan" };

export default async function NewScanPage({
  searchParams,
}: PageProps<"/scans/new">) {
  const session = await requireUser();
  if (role(session) === "trainer") redirect("/");
  const { user: userParam } = await searchParams;

  const users = await db
    .select({ id: user.id, name: user.name, role: user.role })
    .from(user)
    .orderBy(asc(user.name));

  const editable = users.filter((u) => canEditScanData(session, u.id) && canBeScanTarget(u.role));
  const defaultUserId =
    editable.find((u) => u.id === userParam)?.id ??
    editable.find((u) => u.id === session.user.id)?.id ??
    editable[0].id;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">New body scan</h1>
      <p className="text-sm text-stone-600">
        Upload the Evolt screenshot and AI will read the numbers for you — then double-check
        and save. You can also type values manually.
      </p>
      <ScanForm userIds={editable} defaultUserId={defaultUserId} />
    </div>
  );
}
