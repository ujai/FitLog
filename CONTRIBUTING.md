# Contributing

Thanks for helping improve FitLog. The app is deliberately small — a few
users, free-tier hosting, no scale machinery — and it should stay that way.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in values (README → "Google sign-in" for OAuth setup)
docker compose up -d db      # local Postgres
pnpm db:migrate && pnpm db:seed
pnpm dev                     # http://localhost:3457
```

## Before opening a PR

Run the gate — typecheck, lint, production build:

```bash
pnpm verify
```

Unit tests for the pure analytics/format helpers:

```bash
pnpm test
```

`pnpm qa` is a ~43-check HTTP smoke + authorization suite that runs against a
live app on :3457 (it seeds and cleans up `qa-*@test.local` fixtures). Run it
when you touch auth, roles, image routes, or the ICS feed — not needed
otherwise.

## Ground rules

- **Read `AGENTS.md` first** — stack conventions, the Next.js 16 and Better
  Auth gotchas, and the authorization model. Every server action and route
  handler must call a `require*`/`can*` helper from `src/lib/session.ts`;
  never trust client-side role checks.
- **`DESIGN.md` is normative for visual work** — tokens, contrast rules, no
  dark mode. Verify visual changes in a real browser (computed styles, not
  class names).
- Mutations are server actions in `src/server/` — call `revalidatePath` after
  writes.
- Keep PRs small, and say what you verified (which of the checks above you
  ran).
- Health data is sensitive: never add public file serving, client-side auth
  checks, or new env vars without documenting them in `.env.example`.
- New DB fields: edit `src/db/schema.ts`, then `pnpm db:generate` — never edit
  files in `drizzle/` by hand.
