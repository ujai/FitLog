# Security

FitLog stores sensitive health data — body scans, meal photos, diet logs —
behind Google-only sign-in with a server-side email allowlist. Take that
seriously in anything you propose or deploy.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting: **Security → Report a
vulnerability** on this repo. Please don't open a public issue for anything
exploitable.

Include what you found, how to reproduce it, and which version it affects.
You'll hear back within a few days.

## Scope

- The app in this repo: pages, server actions, route handlers, the ICS feed,
  the image-serving routes
- The documented deployment paths, if following them leads to an unsafe setup

Out of scope: misconfiguration of your own deployment — an over-broad
`ALLOWED_EMAILS`, a leaked `BETTER_AUTH_SECRET`, or exposed database
credentials are your incident, not the app's.
