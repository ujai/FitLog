"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/lib/auth-client";
import { clearDraftsForUser } from "@/lib/form-draft";

/** How long the app must have been away before returning re-fetches. */
const RETURN_REFRESH_MS = 30_000;

type NavItem = { href: string; label: string; icon: string; roles?: string[]; desktopOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/scans", label: "Scans", icon: "📊" },
  // Photos lives behind a link on the Scans page on mobile — the thumb bar
  // stays at the five everyday destinations. Points at the real route:
  // /photos only redirects here, and a redirect drops the ?user= below.
  { href: "/scans/photos", label: "Photos", icon: "📷", desktopOnly: true },
  { href: "/workouts", label: "Workouts", icon: "🏋️" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/diet", label: "Diet", icon: "🥗", roles: ["admin", "member"] },
  { href: "/account", label: "Account", icon: "⚙️", desktopOnly: true },
];

const EXTRA_ADMIN: NavItem[] = [{ href: "/users", label: "Users", icon: "👥" }];

/** Destinations that read ?user= — the only ones worth carrying it onto. */
const VIEWER_AWARE = new Set(["/", "/scans", "/workouts", "/diet", "/scans/photos"]);

export function AppShell({
  userName,
  userId,
  role,
  people,
  defaultTargetId,
  children,
}: {
  userName: string;
  userId: string;
  role: string;
  /** everyone this viewer may look at; includes the viewer for members/admins */
  people: Array<{ id: string; name: string }>;
  /** who the pages will show when no ?user= is given */
  defaultTargetId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signingOut, setSigningOut] = useState(false);

  const requestedId = searchParams.get("user");
  const known = requestedId && people.some((p) => p.id === requestedId) ? requestedId : undefined;
  // Mirror what the server will actually resolve to, so the header can never
  // quietly disagree with the page. A member's `people` is only themselves, so
  // this collapses to "no indicator" for them without a special case.
  const effectiveId = known ?? defaultTargetId;
  const viewing =
    effectiveId && effectiveId !== userId
      ? people.find((p) => p.id === effectiveId)
      : undefined;

  const items = [
    ...NAV.filter((item) => !item.roles || item.roles.includes(role)),
    ...(role === "admin" ? EXTRA_ADMIN : []),
  ];
  // Admin-only Users and the desktop-only destinations keep the thumb bar to
  // the everyday five.
  const mobileItems = items.filter(
    (item) => item.href !== "/users" && !item.desktopOnly,
  );

  // Carry the viewed member across taps — otherwise a trainer silently snaps
  // back to whoever the server defaults to. The trainer's Home is a client
  // roster rather than one person's data, so it stays bare.
  const carriesViewer = (item: NavItem) =>
    VIEWER_AWARE.has(item.href) && !(role === "trainer" && item.href === "/");
  const hrefFor = (item: NavItem) =>
    viewing && carriesViewer(item) ? `${item.href}?user=${viewing.id}` : item.href;

  // The trainer's Home is "your clients at a glance", not one member's data.
  const onRosterHome = role === "trainer" && pathname === "/";

  // Segment-aware, longest-match-wins: /scans/photos must light Photos without
  // also lighting Scans.
  const matches = (item: NavItem) =>
    item.href === "/"
      ? pathname === "/"
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const activeHref = items
    .filter(matches)
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const isActive = (item: NavItem) => item.href === activeHref;

  async function handleSignOut() {
    setSigningOut(true);
    // Drafts hold typed body and workout data on a device the household shares,
    // so the next person to sign in must not be able to read this one's.
    clearDraftsForUser(userId);
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  // Opened in bursts, against data other devices also write (the trainer
  // schedules sessions; a member logs meals), so a backgrounded app comes back
  // to a stale snapshot. Re-fetch after a real absence — but leave a quick app
  // switch alone, and note router.refresh() preserves client state, so a
  // half-typed form is not thrown away.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= RETURN_REFRESH_MS) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-emerald-700 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-20 border-b border-stone-200 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden="true" className="text-lg">🏋️</span> FitLog
          </Link>
          {/* Top nav on desktop */}
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {items.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={hrefFor(item)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm transition ${
                    active
                      ? "bg-emerald-700 text-white"
                      : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-800"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex min-w-0 items-center gap-3 text-sm text-stone-600">
            <span className="min-w-0 truncate">
              {viewing && !onRosterHome ? (
                <>
                  Viewing <span className="font-medium text-stone-800">{viewing.name}</span>
                </>
              ) : (
                <>
                  <span className="hidden sm:inline">{userName} </span>
                  <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs uppercase tracking-wide text-stone-600">
                    {role}
                  </span>
                </>
              )}
            </span>
            {role === "admin" && (
              <Link
                href="/users"
                aria-label="Users"
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg md:hidden"
              >
                <span aria-hidden="true">👥</span>
              </Link>
            )}
            <Link
              href="/account"
              aria-label="Account"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-lg md:hidden"
            >
              <span aria-hidden="true">⚙️</span>
            </Link>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-stone-300 px-3 transition hover:border-stone-400 hover:text-stone-700 disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      {/* tabIndex so the skip link actually moves focus, not just scrolls */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6"
      >
        {children}
      </main>

      {/* Bottom nav on mobile */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="flex">
          {mobileItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={hrefFor(item)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                  active ? "font-semibold text-emerald-700" : "text-stone-600"
                }`}
              >
                <span aria-hidden="true" className="text-lg leading-none">{item.icon}</span>
                {item.label}
                <span
                  aria-hidden="true"
                  className={`h-1 w-1 rounded-full ${active ? "bg-emerald-700" : "bg-transparent"}`}
                />
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
