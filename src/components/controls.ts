/**
 * Shared control class strings — one source of truth so inputs, chips and
 * buttons can't drift between forms. Plain constants (no "use client") so both
 * server and client components can import them.
 */

export const inputCls =
  "min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 sm:text-sm";

/**
 * Shared shape for a one-of-N choice — chips, toggles and tab pills. The three
 * had drifted apart (two paddings, button vs label, and one had no focus ring
 * at all), so the shape and the focus treatment live here now.
 */
export const choiceCls =
  "inline-flex min-h-11 items-center rounded-full font-medium transition focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:outline-none";

/** Selected / unselected halves of a one-of-N choice. */
export const choiceOnCls = "bg-emerald-700 text-white";
export const choiceOffCls = "border border-stone-300 text-stone-600 hover:border-stone-400";

/**
 * sr-only radio inside a styled label, for ≤5 mutually exclusive options.
 * Composed from the same shape as the buttons above; its selected state comes
 * from `:checked` on the wrapped input rather than a prop.
 */
export const chipCls = `${choiceCls} cursor-pointer px-4 py-2.5 text-sm leading-6 ${choiceOffCls} has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-700 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500/60`; // impeccable-disable-line gray-on-color

/** Solid emerald call to action. */
export const btnPrimaryCls =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white transition hover:bg-emerald-800 disabled:opacity-60";

/** Hairline outline control — secondary actions and inactive tabs. */
export const btnSecondaryCls =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 px-4 text-sm text-stone-600 transition hover:border-stone-400";

/** Tiny uppercase caption above a big stat number. */
export const microLabelCls = "text-xs uppercase tracking-wide text-stone-600";

/**
 * Colour for a metric delta. Neutral unless the metric has a target — the app
 * only judges a change when it knows which direction the person is going.
 */
export function deltaToneCls(tone: "neutral" | "good" | "bad"): string {
  if (tone === "good") return "text-emerald-700";
  if (tone === "bad") return "text-amber-700";
  return "text-stone-600";
}

/** Native select — same geometry as inputCls, but sized to its content. */
export const selectCls =
  "min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 sm:text-sm";

/**
 * Dense input for table-like grids (workout set rows). Same 44px height and
 * 16px-on-mobile rule as inputCls — only the horizontal padding is tighter.
 */
export const cellInputCls =
  "min-h-11 rounded-lg border border-stone-300 bg-white px-2 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 sm:text-sm";

/** inputCls with the AI-read highlight — same geometry, emerald tint. */
export const aiInputCls =
  "min-h-11 w-full rounded-lg border border-emerald-500 bg-emerald-50/50 px-3 py-2.5 text-base outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 sm:text-sm";
