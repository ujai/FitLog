import { requireUser, role } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireUser();
  // Same resolution the pages use, so the shell can never disagree with the
  // page about whose data is on screen. `selectable` is already filtered to
  // what this viewer may see (a member gets only themselves).
  const { selectable, target } = await resolveViewer(session);

  return (
    <AppShell
      userName={session.user.name}
      userId={session.user.id}
      role={role(session)}
      people={selectable.map(({ id, name }) => ({ id, name }))}
      defaultTargetId={target.id}
    >
      {children}
    </AppShell>
  );
}
