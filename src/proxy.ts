import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Better Auth prefixes the session cookie with "__Secure-" on HTTPS (production),
// so both names must be checked.
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

/**
 * Optimistic auth check: presence of the session cookie only (no DB call).
 * Real authorization happens in layouts / server actions / route handlers.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = SESSION_COOKIES.some((name) => request.cookies.has(name));

  const publicPaths = ["/login"];
  const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!hasSessionCookie && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Deliberately NO "already signed in -> /" bounce here. A cookie's presence
  // says nothing about whether its session row still exists, and bouncing on
  // presence alone closed a loop with requireUser()'s redirect:
  //   stale cookie -> "/" -> layout finds no session -> "/login"
  //   -> proxy sees the cookie -> "/" -> ERR_TOO_MANY_REDIRECTS
  // The login page redirects home itself once it finds a real session.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|webp)$).*)"],
};
