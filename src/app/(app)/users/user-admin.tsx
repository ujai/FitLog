"use client";

import { inputCls } from "@/components/controls";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateUser, adminRemoveUser } from "@/server/users";
import { DeleteWithUndo, UndoDeleteButton } from "@/components/delete-with-undo";
import { btnPrimaryCls } from "@/components/controls";

type UserRow = { id: string; name: string; email: string; role: string };


export function UserAdmin({ users }: { users: UserRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "trainer" | "admin">("member");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    startTransition(async () => {
      const result = await adminCreateUser({ name, email, role });
      if (!result.ok) return setError(result.error ?? "Failed");
      setOk(`Created ${email}. They sign in with their Google account.`);
      setName("");
      setEmail("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onCreate} className="space-y-4 rounded-2xl border border-stone-200 bg-white/70 p-5">
        <h2 className="font-medium">Create user</h2>
        <p className="text-xs text-stone-600">
          Use the person&apos;s Google email and make sure it&apos;s whitelisted in <code>ALLOWED_EMAILS</code> —
          otherwise they can&apos;t sign in.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-user-name" className="mb-1 block text-xs font-medium text-stone-600">Name</label>
            <input id="new-user-name" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="new-user-email" className="mb-1 block text-xs font-medium text-stone-600">Email</label>
            <input id="new-user-email" required type="email" autoComplete="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="new-user-role" className="mb-1 block text-xs font-medium text-stone-600">Role</label>
            <select id="new-user-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className={inputCls}>
              <option value="member">Member (own data only)</option>
              <option value="trainer">Trainer (sees all members)</option>
              <option value="admin">Admin (everything)</option>
            </select>
          </div>
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {ok && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</p>}
        <button type="submit" disabled={pending} className={btnPrimaryCls}>
          {pending ? "Creating…" : "Create user"}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="font-medium">Existing users</h2>
        {users.map((u) => (
          <DeleteWithUndo
            key={u.id}
            action={() => adminRemoveUser(u.id)}
            onCommitted={() => router.refresh()}
            className="rounded-2xl border border-stone-200 bg-white/70 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {u.name} <span className="ml-1 rounded bg-stone-200 px-1.5 py-0.5 text-xs uppercase text-stone-600">{u.role}</span>
                </p>
                <p className="text-xs text-stone-600">{u.email}</p>
              </div>
              <UndoDeleteButton className="inline-flex min-h-11 items-center rounded-lg border border-red-300 px-3.5 text-sm text-red-700 transition hover:border-red-400 disabled:opacity-50">
                Remove
              </UndoDeleteButton>
            </div>
          </DeleteWithUndo>
        ))}
      </section>
    </div>
  );
}
