---
name: Health Tracker
description: Warm, quiet light theme for a private household fitness tracker — translucent cards on stone paper, muted emerald as the only voice.
colors:
  page: "#f5f4f0"
  ink: "#292524"
  card: "rgba(255, 255, 255, 0.70)"
  border: "#e7e5e4"
  border-strong: "#d6d3d1"
  accent: "#047857"
  accent-hover: "#065f46"
  accent-soft: "#ecfdf5"
  text-muted: "#57534e"
  text-faint: "#57534e"
  chart-grid: "#e7e5e4"
  chart-axis: "#78716c"
  chart-series-1: "#57534e"
  chart-series-2: "#d97706"
typography:
  body:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  micro-label:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0.025em"
  input:
    fontFamily: "var(--font-sans), system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  card: "16px"
  control: "8px"
spacing:
  card: "20px"
  card-dense: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  input-field:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
---

# Design System: Health Tracker

## Overview

**Creative North Star: "The Paper Ledger"**

The app looks like a well-kept paper health ledger photographed in soft
morning light: a warm off-white page (`#f5f4f0`, the `paper` token) carrying
translucent white cards at 70% opacity, hairline stone borders, and text in a
two-step stone scale — near-black ink and a single readable secondary gray.
Color is rationed — a muted emerald appears only where action or life lives
(primary buttons, active tabs, links, success), never as decoration. There is
no dark mode and no pure-white surface outside print; the warmth of the paper
is the identity.

Density is calm and mobile-first: one column, generous card padding, large
emoji markers standing in for icon libraries. Every screen is designed for a
thumb first. The system deliberately avoids `slate-*`/`zinc-*` cool grays and
any dark backgrounds (no `-900`/`-950`).

**Key Characteristics:**
- Translucent cards (`bg-white/70`) on warm stone paper — never opaque white
- Hairline stone borders do the structural work; shadows are absent
- One accent (emerald-700) used sparingly; everything else is stone
- Every text tone clears WCAG AA (4.5:1) on the page tone *and* on card glass
- Emoji as iconography (`text-3xl` card headers), no icon library
- Rem-based type so Android's system font scaling propagates

## Colors

A warm neutral field with a single quiet green accent.

### Primary
- **Ledger Emerald** (`#047857`, emerald-700): the only action color — primary
  buttons, active/selected tabs and chips, links, AI status. Hover darkens to
  `#065f46` (emerald-800). Soft tint `#ecfdf5` (emerald-50) for success
  banners and tap-highlight glow (`rgba(16, 185, 129, 0.2)`).
  Emerald-600 (`#059669`) is **not** usable for text or as a fill behind white
  text — it measures 3.42:1 as text and 3.77:1 under white, both below AA. It
  survives only as borders, rings, and the `emerald-500` tap glow.

### Neutral
- **Warm Paper** (`#f5f4f0`, the `paper` token → `bg-paper`): page background,
  also the header and bottom-nav bar color at 90–95% opacity with
  `backdrop-blur`. Deliberately not `bg-stone-100` — see The Paper Token Rule.
- **Ink** (`#292524`, stone-800): primary text.
- **Card Veil** (`rgba(255,255,255,0.70)`): card and section surfaces — the
  page tone always shows through.
- **Hairline** (`#e7e5e4`, stone-200): card borders and chart grid lines.
- **Pencil Border** (`#d6d3d1`, stone-300): input borders and small-control
  borders, darkening to stone-400 on hover for inactive controls.
- **Secondary Text** (`#57534e`, stone-600): every non-ink text tone —
  labels, captions, placeholders, inactive nav, meta. The old faint tier
  (stone-400 `#a8a29e` at 2.3:1, stone-500 `#78716c` at 4.36:1 on paper) both
  fail AA, so the ladder collapses to this one step; hierarchy comes from
  size, weight, and uppercase tracking instead of ever-lighter gray.

### Named Rules
**The Translucent Card Rule.** Cards and sections are `bg-white/70`, never
opaque `bg-white` — depth comes from the paper showing through, not shadows.
(Input fields are the sanctioned exception: solid white inside a card.)
**The Quiet Accent Rule.** Emerald is for action and state only, roughly ≤10%
of any screen; it never appears as a background wash or decoration.
**The Contrast Rule.** Body and label text clears 4.5:1 against *both* the
paper (`#f5f4f0`) and card glass (`#fcfcfb`). That means `stone-600` or
darker for text, `emerald-700`/`red-700`/`amber-700` or darker for colored
text, and `emerald-700` as the lightest fill that may carry white text.
Verify with a real computed-style probe, not by reading class names.
**The No Dark Mode Rule.** No dark mode exists and none may be added; no
`slate-*`/`zinc-*` shades and no `-900`/`-950`/`-800` backgrounds anywhere.
**The Paper Token Rule.** Surfaces this doc calls Warm Paper use the `paper`
token (`bg-paper`), never `bg-stone-100`: Tailwind's stone-100 is `#f5f5f4`, one
unit off on two channels, so using it made the page a colour this document does
not describe — a drift nobody can see and nobody can spot in review. Tailwind's
stone ramp stays available for small inset fills and hover tints, which are not
paper surfaces.

## Typography

**Body Font:** system sans (Geist variable → `system-ui`, sans-serif)
**Character:** utilitarian and quiet — the hierarchy is built from size, weight
and uppercase tracking over stable grays, not from weight drama or display
faces.

### Hierarchy
- **Title** (500, 16px): card titles and page-level emphasis.
- **Body** (400, 14px, `text-sm` on desktop): everything else. Long-form prose
  — coach notes, AI review summaries and their bullets — takes a measure of
  `max-w-prose` (65ch); a full-width card would otherwise run to ~160 characters
  a line at desktop width. Stat labels, captions, table cells and short copy
  need no measure; constraining them would be a doctrine with no reader.
- **Card icon** (400, 30px): the leading emoji on a card — bigger than any
  text, it is the visual anchor.
- **Micro label** (400, `text-xs`, uppercase, wide tracking, stone-600): the tiny
  category captions above big stat numbers on dashboard/stat cards
  (`text-xs uppercase tracking-wide text-stone-600`, shared as `microLabelCls`).
- **Input text** (400, 16px mobile / 14px desktop via `text-base sm:text-sm`):
  ≥16px on mobile is load-bearing — iOS Safari zooms on focus below it.

### Named Rules
**The Rem Rule.** Font sizes are always Tailwind steps (`text-xs`…`text-base`),
never fixed `px`, so Android's system font-size setting scales the whole UI.

## Layout

Single-column, mobile-first. Content lives in centered cards; the dashboard
uses a card grid where denser cards take `p-5` and feature cards `p-6`
(`flex flex-col items-center justify-center … text-center`). Header and
bottom navigation are the same warm paper at 90–95% opacity with
`backdrop-blur`. Submit buttons are `w-full` in the phone thumb zone and
`sm:w-auto` from tablet up. Cards stack full-width on phones; grids tighten
at `sm:`/`md:` breakpoints. Anything wider than the phone viewport (data
tables, wide grids) must live in its own `overflow-x-auto` wrapper — the page
itself never scrolls horizontally.

## Elevation & Depth

Flat. There is no shadow vocabulary — depth is tonal: the 70% white veil over
warm paper reads as a surface, hairline stone borders do the separating, and
`backdrop-blur` on the floating header/nav adds the only physical hint.
Hover on interactive cards raises emphasis by border color alone
(`hover:border-emerald-600`), never elevation.

## Shapes

Three radii, by role rather than by surface: 16px (`rounded-2xl`) for cards and
sections, 12px (`rounded-xl`) for the surfaces *inside* a card — tiles, wells and
rows, always one step tighter than the container around them — and 8px
(`rounded-lg`) for controls: buttons, inputs, small tags. Chips and segmented
choices are `rounded-full` pills, deliberately not button-shaped: a pill reads as
"one selected out of N", a rectangle reads as "press me". Borders are 1px stone
hairlines everywhere; there is no filled dark surface, no gradient, no clipped
geometry.

## Components

Feel: "refined and restrained" — components are quiet until interacted with.

### Cards / Containers
- **Corner Style:** 16px (`rounded-2xl`)
- **Background:** `bg-white/70` over the page tone; 1px stone-200 border
- **Internal Padding:** `p-5` (dense) / `p-6` (feature cards)
- **Anatomy (feature cards):** emoji icon (`text-3xl`, or `text-2xl` in
  compact grids) → title (`text-base font-medium`) → supporting text
  (`text-sm text-stone-600`) → content, all centered
- **Clickable:** add `transition hover:border-emerald-600`

### Buttons
- **Shape:** 8px radius (`rounded-lg`)
- **Primary:** `bg-emerald-700 text-white hover:bg-emerald-800`, padding
  `px-3 py-2.5`, full-width on mobile (`w-full sm:w-auto`)
- **Secondary/inactive tab:** `border border-stone-300 text-stone-600
  hover:border-stone-400` on transparent
- **Touch target:** ≥44px (`min-h-11`) on anything tappable — including
  compact chips and inline "view all →" links, which get padding rather than
  a smaller box
- **Disabled:** `disabled:opacity-60` on the element itself

### Chips (mutually exclusive options, ≤5)
- **Style:** sr-only radio `<input>` inside a styled `<label>`; unselected is
  a stone-300 hairline chip, selected is solid emerald
  (`has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-700
  has-[:checked]:text-white`), visible focus ring
  (`has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500/60`)
- **Rule:** chips replace dropdowns for ≤5 options; pre-suggestions (e.g.
  meal type guessed from time) must stay overridable

### Inputs / Fields
- **Style:** solid white, 1px stone-300 border, 8px radius, `px-3 py-2.5`
- **Focus:** border shifts to emerald-500 with a soft ring
  (`focus:ring-2 focus:ring-emerald-500/25`)
- **Mobile sizing:** `text-base sm:text-sm` (16px on phones — non-negotiable)
- **Optional extras** (photo/macros/notes) hide behind a `<details>`
  ("Add details (optional)") so the fast path stays short

### Navigation
- **Style:** bottom nav on mobile + header, both `bg-stone-100/90 …/95` with
  `backdrop-blur`; inactive items `text-stone-600`, active items emerald —
  solid chips (`bg-emerald-700 text-white`) in the header, emerald-700 label
  in the mobile bar
- **User switcher** (trainer/admin viewing members) renders as tabs above content

### Destructive actions
Deletes are never `confirm()` dialogs: the card dims in place under a
"Deleted · Undo" overlay for a timed window (`src/components/delete-with-undo.tsx`);
navigating away commits the delete.

### Media
Images (scan screenshots, meal photos) are never bare `<img>` at thumbnail
size — reuse the `MealPhoto` pattern: a `<button>` thumbnail opening a fixed
`role="dialog"` lightbox (Escape and click-outside close it), with `src`
always pointing at the authenticated image routes, never a public URL. Both
lightboxes go through the shared `Overlay` with `tone="dark"`, which owns
scroll lock, focus trap and focus restore.

**The Dark Mat Rule.** The lightbox mat is the one sanctioned dark surface
(`bg-black/80`) — a photo has to read true, and a paper-toned mat degrades the
most important verification task in the app (checking AI-read numbers against
the Evolt sheet). It is never used for chrome or layout.

### Charts (Recharts)
Grid lines `#e7e5e4` (stone-200), axis text `#78716c` (stone-500, graphical
labels only), white tooltip with the card border color. Chart chrome stays
stone; series colors come from a fixed two-color scheme — `#57534e`
(stone-600) then `#d97706` (amber-600, used for "lower is better" metrics like
waist) — never random hues.

### Print (dietician handout)
`globals.css` has a `@media print` block that forces black-on-white and
strips `header`/`nav`/`footer`. Don't fight it with `print:` overrides; use
`print:hidden` on controls that shouldn't print. Every printed number goes
through the same formatter as the screen — never mix `fmt()` with
`toLocaleString()` in one document.

## Do's and Don'ts

### Do:
- **Do** use `bg-white/70` for every card/section surface, `border-stone-200`
  borders, `rounded-2xl`.
- **Do** keep all interactive targets ≥44px (`min-h-11`) and inputs ≥16px on
  mobile (`text-base sm:text-sm`).
- **Do** keep text at `stone-600` or darker and colored text at
  `emerald-700`/`red-700`/`amber-700` or darker; verify the computed ratio.
- **Do** use chips for ≤5 mutually exclusive options and `<details>` for
  optional fields.
- **Do** verify visual changes in a real browser (agent-browser) — screenshot
  or `eval` the computed `background-color`/`color` against these tokens.
- **Do** match an existing card/form implementation (reference:
  `src/app/(app)/page.tsx`, `src/components/meal-form.tsx`) before inventing.

### Don't:
- **Don't** introduce dark mode, `slate-*`/`zinc-*` shades, or any
  `-900`/`-950`/`-800` background.
- **Don't** use `text-stone-400` or `text-stone-500` — both fail AA on the
  paper tone; stone-600 is the lightest permitted text.
- **Don't** use `bg-emerald-600` behind white text or `text-emerald-600` on
  light — use emerald-700 (emerald-600 is for borders and rings only).
- **Don't** use opaque `bg-white` for cards or pure `#fff` page backgrounds
  (inputs and print are the only solid-white surfaces).
- **Don't** reach for shadows, gradients, or bounce easing for depth or
  delight — the system is flat and tonal.
- **Don't** use a dropdown where ≤5 chips fit, or a `confirm()` dialog where
  an undo overlay fits.
- **Don't** hardcode `px` font sizes, frame mobile work as iPhone-only, or
  serve images from public URLs instead of authenticated routes.
- **Don't** let a data table or wide grid scroll the page itself horizontally.
