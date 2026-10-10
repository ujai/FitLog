# Product

## Platform

web

## Users

A small private household: the members track their own health data, and their
personal trainer coaches them. Everyone uses it from phones (Android and
iOS are equal first-class targets) with occasional desktop use. The household
runs the app for itself — it is not a commercial product and has no marketing
surface.

## Product Purpose

A self-hostable fitness tracker for a small household plus PT. It records and
makes sense of Evolt 360 body-composition scans (screenshot upload, AI reads
the numbers, side-by-side comparison, trends, AI-generated reviews with
actionable pointers), workout logs, a shared PT calendar with personal ICS
feeds, and a diet diary with photos/macros and a print-friendly weekly handout
for the dietician. Success = the household actually keeps logging, and the
trainer can see and steer member progress without friction.

## Positioning

Not applicable in a market sense — this is a private tool for a small group.
Its differentiating mechanism vs. generic fitness apps: full data ownership
(Postgres + `pg_dump`, images in the DB), AI reading of real Evolt scan
screenshots, and strict household-level privacy (whitelist sign-in, no public
surface at all).

## Operating Context

- Body scans come from an Evolt 360 machine; the user photographs/screenshots
  the result sheet and the AI extracts the numbers — the scan form stays
  strictly first-person (nobody logs body data on a member's behalf).
- The trainer logs workouts and schedules PT sessions; the shared month
  calendar feeds each user's personal ICS URL into Google/Apple Calendar.
- The dietician is an outside human: the diet week is handed over as a
  printout, so the print stylesheet is a real deliverable, not decoration.
- The app can run as an always-on systemd service on a home server (LAN
  access), with a Vercel+Neon free-tier deployment path documented for
  portability.

## Capabilities and Constraints

- Sign-in is Google OAuth only, gated by a server-side email allowlist
  (`ALLOWED_EMAILS`). Public sign-up and password login are disabled by design.
- Roles: `admin` > `trainer` > `member`, enforced server-side on every
  action; members see only their own data.
- Scans and tape measurements are strictly first-person writes; the trainer
  can log workouts and view, but never write a member's body data.
- Images (scan screenshots, meal photos) are stored as `bytea` in Postgres
  and served only through authenticated routes — no public URLs.
- AI features (screenshot extraction, progress reviews) run on Gemini and are
  optional — the app is fully usable without the API key.
- Installable PWA; no dark mode by deliberate decision.

## Brand Commitments

- The app's voice is plain and short ("Print", not "Print week for
  dietician") — short labels beat verbose ones.
- No dark mode, ever: the visual identity is a warm light theme (recorded in
  DESIGN.md, which is normative for visuals).

## Evidence on Hand

- Real usage data lives in the household's Postgres (scans, workouts, meals).
- No marketing content, testimonials, or press exists and none may be
  fabricated — there is no public surface to put it on.
- QA evidence: `pnpm qa` runs a ~43-check role-based HTTP suite (roles, image
  routes, ICS feed) against the live app.

## Product Principles

- **Privacy is structural, not a feature.** Whitelist auth, server-side role
  checks, authenticated image routes, secrets out of git — assume the data is
  sensitive because it is health data.
- **Strict first-person ownership of body data.** Only a member writes their
  scans and measurements; nobody else's hands touch them.
- **Household-grade, not enterprise-grade.** A few users; favor simple,
  legible code and free-tier hosting over scale machinery.
- **Mobile thumbs come first.** Every flow must work one-handed on a phone;
  desktop is the secondary case.
- **The computer assists, the human verifies.** AI extracts numbers and
  drafts reviews, but values and edits remain human-confirmed.

## Accessibility & Inclusion

- Touch targets ≥44px (`min-h-11`, WCAG 2.2); inputs ≥16px on mobile so iOS
  Safari doesn't zoom on focus.
- Android parity is a requirement, not an afterthought: rem-based font sizes
  so the system font-size setting scales the UI.
- Color-adjacent visual choices are verified in a real browser, not assumed
  from class names.
