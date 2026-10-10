import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { requireUser, role } from "@/lib/session";
import { UserAdmin } from "./user-admin";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const session = await requireUser();
  if (role(session) !== "admin") redirect("/");
  const users = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .orderBy(asc(user.name));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-stone-600">
          Only the admin (household owner) sees this page. Create accounts for family and the
          trainer here — sign-up is closed to the public.
        </p>
      </div>
      <UserAdmin users={users} />
    </div>
  );
}
