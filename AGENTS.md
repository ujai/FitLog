<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# FitLog — agent guide

Self-hosted fitness tracker: Evolt body-scan tracking (AI screenshot extraction + reviews), workout log, PT calendar (with ICS feeds), diet diary. Members track their own data, a personal trainer coaches them, an admin manages accounts. Built for a small household — keep it simple.

## Stack

- Next.js 16 App Router + TypeScript + Tailwind CSS 4 (src dir, `@/*` alias)
- Better Auth v1.7 (Drizzle adapter) — sessions in Postgres; Google-only sign-in with a server-side email allowlist (`ALLOWED_EMAILS`); public sign-up and password login disabled
- Drizzle ORM + PostgreSQL; images stored as `bytea` in DB (pg_dump carries everything)
- AI SDK v7 + Google Gemini for screenshot extraction and progress reviews

## Commands

```bash
pnpm dev                 # dev server on :3457 (needs .env.local + docker compose up -d db)
pnpm build               # production build (also typechecks)
pnpm verify              # one-command gate: tsc --noEmit + lint + build
pnpm lint                # eslint
pnpm test                # unit checks for pure analytics/format helpers (scripts/analytics.test.ts; no DB, no server)
pnpm qa                  # smoke + authz suite (scripts/qa.ts): seeds qa-*@test.local fixtures, runs ~43 HTTP checks against the running app (roles, image routes, ICS feed, and that each entity's Edit/Repeat control is gated like its server action), cleans up. Needs the app running on :3457 (pnpm dev or any running instance). Flags: --keep, --base-url <url>
docker compose up -d db  # local Postgres (127.0.0.1:5432, health/health)
pnpm db:generate         # after editing src/db/schema.ts → generates SQL in drizzle/
pnpm db:migrate          # apply migrations
pnpm db:seed             # seed admin/member/trainer accounts (email rows only — sign-in is Google)
pnpm db:backup           # pg_dump to ~/backups/health-tracker (keeps 14); the deploy/systemd timer automates this nightly
```

Always run `pnpm verify` before finishing a task, and `pnpm qa` whenever auth, roles, image routes, or the ICS feed were touched.

## Next.js 16 conventions (differ from older training data)

- `src/proxy.ts` replaces middleware.ts — optimistic cookie check only; real authz is server-side
- Typed route props: `PageProps<"/path">`, `LayoutProps<"/path">` (no manual typing)
- `params` and `searchParams` are Promises — await them
- Mutations = server actions in `src/server/*.ts` (`"use server"`), call `revalidatePath` after writes
- Refresh client state via `refresh()` from `next/cache` or `router.refresh()`

## Better Auth v1.7 gotchas (verified the hard way)

- Sign-in is Google OAuth + email allowlist: enforcement lives in `user.validateUserInfo` (fires on `create-user`, `sign-in`, and `link-account` — removing an email from `ALLOWED_EMAILS` blocks the next sign-in)
- New/admin-created user rows must have `emailVerified: true` so the first Google sign-in implicitly links the Google identity (requires matching whitelisted email)
- `hooks` takes a single `createAuthMiddleware` (not an array of matcher/handler objects)
- Admin plugin endpoints are `auth.api.createUser` / `removeUser` (old `adminCreateUser` etc. don't exist); `createUser` takes no password now
- The admin plugin's role field only accepts `user`/`admin` — our custom roles (`member`, `trainer`) are set via direct Drizzle update after account creation (see `src/server/users.ts`)
- `account` table requires the `issuer` column; `user.icsToken` needs `.$defaultFn()` (Better Auth inserts don't know about custom NOT NULL columns)
- Trusted origins: `APP_URL` + comma-separated `TRUSTED_ORIGINS` env (dev ports). Serving on an untrusted port → CSRF 403 on sign-in

## Auth & authorization (non-negotiable)

Roles: `admin` > `trainer` > `member`. Helpers in `src/lib/session.ts`:
`requireUser()`, `requireRole(...)`, `canView(session, targetUserId)`, `canViewDiet(session, targetUserId)`, `canEditOwnData(session, targetUserId)` (diet/photos), `canEditScanData(session, targetUserId)` (scans/tape measurements — strictly first-person: only the owner writes them, nobody logs body data on a member's behalf), `canLogWorkout(session, targetUserId, targetRole)`.

Every server action and route handler must call one of these. Pages use `resolveViewer()` (`src/lib/view.ts`) for the user-switcher tabs. Never trust client-side role checks. Images are served through authenticated routes (`/api/scans/[id]/image`, `/api/meals/[id]/image`), never as public files.

Role-gated pages `redirect()` during render, so a non-admin may get a 200 whose streamed body contains a soft-redirect payload (`NEXT_REDIRECT;replace;/`) instead of a hard 307 — the restricted content must never render. `pnpm qa` encodes this (see `expectRedirectedAway` in `scripts/qa.ts`).

## Database workflow

Edit `src/db/schema.ts` → `pnpm db:generate` → `pnpm db:migrate`. Never edit files in `drizzle/` by hand. Local DB is disposable (docker volume); seed after recreating.

`db:migrate` only touches whatever `DATABASE_URL` points at. If you deploy against a managed Postgres (e.g. Neon), run `pnpm db:migrate` against that database **before** deploying code that adds a migration — a deploy serves new code against the old schema otherwise, and pages error on the missing tables.

## UI — design system (follow strictly)

Visual work is governed by the root `DESIGN.md` (normative tokens + rules) and `PRODUCT.md` (product truth). Key invariants: warm off-white `#f5f4f0` background, translucent `bg-white/70` cards, stone borders/text, muted emerald accents, **no dark mode, no pure white surfaces** (inputs + print aside). Mobile-first: ≥44px touch targets, ≥16px inputs on phones, rem-based type for Android font scaling.

Visual changes must be verified in a real browser, not just via code checks — screenshot or eval the computed `background-color`/`color` against the tokens in `DESIGN.md`.

## Env

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `APP_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (required — Google sign-in), `ALLOWED_EMAILS` (required — exact whitelist of sign-in emails), `APP_TIMEZONE` (optional — IANA zone for scheduling/display, default `Asia/Kuala_Lumpur`; zoneless datetime-local inputs are parsed as wall time in this zone via `src/lib/tz.ts`, never in the server's zone; **set `NEXT_PUBLIC_APP_TIMEZONE` to the same value too**, or client-rendered dates silently fall back to the default), `TRUSTED_ORIGINS` (optional), `GEMINI_API_KEY` (optional — enables AI features), `GEMINI_MODEL` (default `gemini-3.6-flash`). See `.env.example`.

## Deployment

Vercel + Neon free tiers for a small household; a VPS path (docker compose + any Node host behind Caddy) and home-server systemd self-hosting (`deploy/systemd/`) are documented in README.md. Keep the codebase host-agnostic (no Vercel-only APIs beyond what Next.js provides).
