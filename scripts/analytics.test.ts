/**
 * Unit checks for pure analytics/format helpers. No DB, no app server.
 *
 *   pnpm test
 */
import assert from "node:assert/strict";
import {
  exercisePRs,
  exerciseSessionSummary,
  trainingStreak,
  trainingStreakFromDates,
  weeklyVolume,
  nearestReading,
} from "../src/lib/analytics.ts";
import { exerciseHistoryHref } from "../src/lib/exercise-link.ts";
import { packageBalances } from "../src/lib/packages.ts";
import {
  calendarDaysBetween,
  dateKeyAddDays,
  dateKeyInAppTz,
  parseWallTimeInAppTz,
  timeKeyInAppTz,
  toLocalInputInTz,
  weekKeyInAppTz,
} from "../src/lib/tz.ts";
import { csvCell, parseCsv } from "../src/lib/csv.ts";
import { buildImportRows, parseImportTimestamp } from "../src/lib/csv-import.ts";
import { metricDelta, fmtDaysAgo, fmtElapsed, fmtUntil, fmtWeekdayDate } from "../src/lib/format.ts";
import { inferDirection, nextDirection, GOAL_METRICS, GOAL_METRIC_KEYS, isGoalMetric, progressTowardTarget } from "../src/lib/goal-metrics.ts";
import { isRole, roleOf } from "../src/lib/roles.ts";
import { buildWorkoutInput, isWorkoutDraft } from "../src/lib/workout-draft.ts";
import type { WorkoutDraft } from "../src/lib/workout-draft.ts";
import { extractedScanPatch, isScanFields, scanFieldsFrom } from "../src/lib/scan-fields.ts";
import {
  CARD_METRICS,
  HEADLINE_METRICS,
  METRICS,
  OTHER_METRICS,
  TAPE_METRICS,
  isHeadlineMetric,
  metric,
  metricLabel,
  tapeMetric,
} from "../src/lib/metrics.ts";

const DAY = 86_400_000;

/**
 * The Monday of the app-timezone week containing a "YYYY-MM-DD" key. Derived
 * from the calendar key rather than from an instant, so it also checks the
 * instant → key conversion the analysis does.
 */
function mondayKeyOf(key: string): string {
  const day = new Date(key + "T00:00:00Z");
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
}

/**
 * An instant in the app timezone: `offsetWeeksAgo` weeks before the current one,
 * `dayOffset` days into it (0 = Monday), at `time` wall clock. Built from wall
 * time rather than by subtracting milliseconds from now, so the fixtures mean
 * the same thing whatever zone the machine running the tests is in.
 */
function weekOf(offsetWeeksAgo: number, dayOffset = 2, time = "10:00"): Date {
  const monday = dateKeyAddDays(mondayKeyOf(dateKeyInAppTz(new Date())), -7 * offsetWeeksAgo);
  return parseWallTimeInAppTz(`${dateKeyAddDays(monday, dayOffset)}T${time}`);
}

const s = (date: Date) => ({ date, exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 100 }] }] });

// trainingStreak — regression for the 🔥 badge that silently never rendered
assert.equal(trainingStreak([]), 0, "no sessions -> 0");
assert.equal(trainingStreak([s(weekOf(0))]), 1, "current week counts once it has a session");
assert.equal(
  trainingStreak([s(weekOf(0)), s(weekOf(1)), s(weekOf(2))]),
  3,
  "three consecutive weeks -> 3",
);
assert.equal(
  trainingStreak([s(weekOf(1)), s(weekOf(2))]),
  2,
  "empty current week continues the streak from last week",
);
assert.equal(
  trainingStreak([s(weekOf(0)), s(weekOf(2))]),
  1,
  "a gap breaks the streak",
);
assert.equal(
  trainingStreak([s(weekOf(5))]),
  0,
  "an old week alone is not a streak",
);
assert.equal(
  trainingStreak([s(weekOf(0)), s(weekOf(0, 4)), s(weekOf(1))]),
  2,
  "two sessions in one week count once",
);

// metricDelta — small-magnitude changes must not round into a dishonest ±0,
// and the magnitude is unsigned because the arrow carries the direction.
assert.equal(metricDelta(0.9, 0.87).text, "0.03", "BWI-scale change keeps 2 decimals");
assert.equal(metricDelta(87, 90).text, "3", "large magnitudes keep 1 decimal");
assert.equal(metricDelta(100.25, 100).text, "0.25", "values <10 change over 2 decimals");
assert.equal(metricDelta(5, 5).text, "±0", "a true zero stays ±0");
assert.equal(metricDelta(null, 5).text, "", "missing values produce no delta");

// Direction travels in the arrow, and no change is scored good or bad — the
// regression this guards is a weight gain rendering in the accent colour.
assert.equal(metricDelta(75, 72.4).arrow, "▲", "an increase points up");
assert.equal(metricDelta(72.4, 75).arrow, "▼", "a decrease points down");
assert.equal(metricDelta(5, 5).arrow, "", "no change draws no arrow");
assert.equal(metricDelta(75, 72.4).tone, "neutral", "gaining weight is not called good");
assert.equal(metricDelta(72.4, 75).tone, "neutral", "losing weight is not called good either");

// A target is what makes a change scoreable — closer to it is the only thing
// that earns the accent colour, when no direction is known.
const near = (target: number) => ({ target });
assert.equal(metricDelta(19, 20, near(18)).tone, "good", "moving toward the target is good");
assert.equal(metricDelta(21, 20, near(18)).tone, "bad", "moving away from the target is bad");
assert.equal(metricDelta(75, 72.4, near(80)).tone, "good", "gaining toward a weight target is good");
assert.equal(metricDelta(5, 5, near(5)).tone, "neutral", "no movement is never scored, even at target");
assert.equal(metricDelta(82, 79, near(80)).tone, "bad", "distance to the target grew");

// With a direction, "achieved" means at or past the target *that way*. This is
// the regression that made hitting your goal and carrying on read as failure.
const down = (target: number) => ({ target, direction: "down" as const });
const up = (target: number) => ({ target, direction: "up" as const });
assert.equal(metricDelta(20, 21, down(20)).tone, "good", "crossing a downward target is good");
assert.equal(metricDelta(18, 19, down(20)).tone, "neutral", "carrying on past a reached target is not a failure");
assert.equal(metricDelta(21, 19, down(20)).tone, "bad", "falling back across a reached target is bad");
assert.equal(metricDelta(21, 22, down(20)).tone, "good", "still short of it, moving toward is good");
assert.equal(metricDelta(23, 22, down(20)).tone, "bad", "still short of it, moving away is bad");
assert.equal(metricDelta(80, 79, up(80)).tone, "good", "crossing an upward target is good");
assert.equal(metricDelta(82, 80, up(80)).tone, "neutral", "holding past an upward target is neutral");
assert.equal(metricDelta(76, 77, up(80)).tone, "bad", "still short of an upward target, moving away is bad");

// inferDirection — a target above where you are means "up", so the one form
// serves a cut and a bulk without asking which one you meant.
assert.equal(inferDirection(18, 20), "down", "a lower target aims down");
assert.equal(inferDirection(80, 77), "up", "a higher target aims up");
assert.equal(inferDirection(20, 20), null, "no distance, no direction");
assert.equal(inferDirection(18, undefined), null, "no reading yet, no direction");

// nextDirection — an unchanged target keeps the direction it already had. This
// is the regression that would have flipped a cut into a bulk: after reaching
// the goal, re-inferring from "now" reads the achieved side as the start.
assert.equal(
  nextDirection({ target: 18, direction: "down" }, 18, 17),
  "down",
  "re-saving a reached target does not flip its meaning",
);
assert.equal(
  nextDirection({ target: 18, direction: "down" }, 16, 17),
  "down",
  "a changed target re-infers, and 16 is below 17",
);
assert.equal(
  nextDirection({ target: 22, direction: "down" }, 22, 24),
  "down",
  "an unchanged target keeps its direction even when it looks like a bulk now",
);
assert.equal(nextDirection(undefined, 18, 20), "down", "a brand-new target infers from where you are");
assert.equal(
  nextDirection({ target: 18, direction: null }, 18, 17),
  "up",
  "an unchanged target with no stored direction can still infer one",
);

// An unrecognised direction must follow distance, not the downward branch. A
// stray value in the column would otherwise invert every verdict for a metric.
assert.equal(
  metricDelta(18, 19, { target: 20, direction: "sideways" as unknown as "up" }).tone,
  "bad",
  "an unknown direction scores by distance (going further away)",
);
assert.equal(metricDelta(18, 19, down(20)).tone, "neutral", "a real downward goal holds past the target");

// Rounding is display-only. A change too small to show must still be scored, or
// a metric could cross its target and be reported as "±0" with no verdict.
assert.equal(
  metricDelta(1.001, 1.004, near(1.005)).text,
  "±0",
  "a sub-rounding change displays as ±0",
);
assert.equal(
  metricDelta(1.001, 1.004, near(1.005)).tone,
  "bad",
  "…but it is still scored as moving away",
);

// trainingStreakFromDates — the dates-only variant the dashboard uses, so the
// streak does not need every workout set loaded.
assert.equal(trainingStreakFromDates([]), 0, "no dates -> 0");
assert.equal(trainingStreakFromDates([weekOf(0), weekOf(1), weekOf(2)]), 3, "matches trainingStreak");

// Weeks are app-timezone weeks (#33). Monday 00:30 in the app's zone is still
// Sunday in UTC, so bucketing with date-fns' startOfWeek on a UTC server put
// that session in the week before — one training week counted as two, and the
// volume chart's last bar was labelled a week early.
assert.equal(
  weekKeyInAppTz(weekOf(0, 0, "00:30")),
  weekKeyInAppTz(weekOf(0, 0, "08:30")),
  "early and late Monday are the same app-timezone week",
);
assert.equal(
  weekKeyInAppTz(weekOf(0, 0, "00:30")),
  mondayKeyOf(dateKeyInAppTz(weekOf(0, 0, "00:30"))),
  "the bucket key is that week's Monday",
);
assert.equal(
  trainingStreakFromDates([weekOf(0, 0, "00:30"), weekOf(0, 3, "19:00")]),
  1,
  "a Monday 00:30 session shares its week with a Thursday one",
);
assert.equal(
  trainingStreakFromDates([weekOf(0, 0, "00:30"), weekOf(1, 2)]),
  2,
  "…and still joins the previous week's session into a two-week streak",
);

const recent = weeklyVolume([s(weekOf(0, 0, "00:30")), s(weekOf(0, 3, "19:00"))], 3);
assert.deepEqual(
  recent.map((w) => w.volume),
  [0, 0, 1000],
  "both sessions land in the current week's bucket",
);
assert.equal(
  dateKeyInAppTz(recent[2].weekStart),
  mondayKeyOf(dateKeyInAppTz(new Date())),
  "the current bucket is labelled with this week's Monday",
);
assert.equal(timeKeyInAppTz(recent[2].weekStart), "00:00", "…at app-timezone midnight");
assert.equal(
  dateKeyInAppTz(recent[0].weekStart),
  dateKeyAddDays(mondayKeyOf(dateKeyInAppTz(new Date())), -14),
  "and the oldest of three buckets is two weeks before it",
);

// fmtDaysAgo — counted in calendar days in the app timezone (+08 by default),
// so a scan at 23:30 and a look at 00:30 read as "yesterday", not "today".
const noon = new Date("2026-09-30T10:00:00Z"); // 18:00 local
assert.equal(fmtDaysAgo(new Date("2026-09-30T02:00:00Z"), noon), "today", "same local day");
assert.equal(fmtDaysAgo(new Date("2026-09-29T10:00:00Z"), noon), "yesterday", "previous local day");
assert.equal(fmtDaysAgo(new Date("2026-09-20T10:00:00Z"), noon), "10 days ago", "counts calendar days");
assert.equal(
  fmtDaysAgo(new Date("2026-09-29T15:30:00Z"), new Date("2026-09-29T16:30:00Z")),
  "yesterday",
  "an hour apart across local midnight is still a day",
);
assert.equal(fmtDaysAgo(new Date("2026-10-05T10:00:00Z"), noon), "today", "a future date never counts negative");

// calendarDaysBetween + fmtUntil — the same rule forwards, for the calendar's
// "next session" lead. A session at 00:30 has to read "tomorrow" at 23:00 the
// night before: it is a day away, not ninety minutes away.
assert.equal(calendarDaysBetween("2026-09-30", "2026-10-01"), 1, "the next day is one day");
assert.equal(calendarDaysBetween("2026-10-01", "2026-09-30"), -1, "and it is signed");
assert.equal(calendarDaysBetween("2026-09-30", "2026-09-30"), 0, "the same day is none");
assert.equal(calendarDaysBetween("2026-02-28", "2026-03-01"), 1, "a month boundary is still one day");
const lateNight = parseWallTimeInAppTz("2026-09-30T23:00");
assert.equal(fmtUntil(parseWallTimeInAppTz("2026-09-30T23:30"), lateNight), "today", "later tonight is today");
assert.equal(fmtUntil(parseWallTimeInAppTz("2026-10-01T00:30"), lateNight), "tomorrow", "half past midnight is tomorrow, not 90 minutes");
assert.equal(fmtUntil(parseWallTimeInAppTz("2026-10-08T09:00"), lateNight), "in 8 days", "counts calendar days");
assert.equal(fmtUntil(parseWallTimeInAppTz("2026-09-29T09:00"), lateNight), "today", "a start already past never counts negative");

// fmtWeekdayDate — the lead line leads with the weekday: "October 1" on its own
// still has to be counted, "Thursday" does not.
assert.equal(fmtWeekdayDate(parseWallTimeInAppTz("2026-10-01T17:00")), "Thursday, October 1", "weekday leads the date");

// fmtElapsed — the gap between two readings, in a unit that means something. Two
// scans the same morning used to read "0 days".
assert.equal(fmtElapsed("2026-09-30T00:00:00Z", "2026-09-30T00:00:20Z"), "less than a minute", "seconds say less than a minute");
assert.equal(fmtElapsed("2026-09-30T00:00:00Z", "2026-09-30T00:01:00Z"), "1 minute", "one minute is singular");
assert.equal(fmtElapsed("2026-09-30T00:00:00Z", "2026-09-30T00:06:00Z"), "6 minutes", "minutes under an hour");
assert.equal(fmtElapsed("2026-09-30T00:00:00Z", "2026-09-30T01:00:00Z"), "1 hour", "one hour is singular");
assert.equal(fmtElapsed("2026-09-30T00:00:00Z", "2026-09-30T06:00:00Z"), "6 hours", "hours under a day");
assert.equal(fmtElapsed("2026-09-30T00:00:00Z", "2026-10-01T00:00:00Z"), "1 day", "a full day");
assert.equal(fmtElapsed("2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z"), "30 days", "and days beyond that");

// The metric catalogue. Metric identity used to live in five overlapping lists
// across five files, which is how a label drifts out of step with its key.
// These pin the invariants that keep it one list.
const dupes = (keys: readonly string[]) => keys.filter((k, i) => keys.indexOf(k) !== i);
assert.deepEqual(dupes(METRICS.map((m) => m.key)), [], "scan metric keys are unique");
assert.deepEqual(dupes(TAPE_METRICS.map((m) => m.key)), [], "tape metric keys are unique");
assert.equal(METRICS.length, 20, "the Evolt sheet has twenty numbers");
assert.equal(TAPE_METRICS.length, 6, "six tape fields");

// Headline and the rest must partition the sheet: every metric is in exactly one
// group, which is what lets the form lead with five and collapse the other fifteen.
assert.equal(HEADLINE_METRICS.length, 5, "five metrics lead");
assert.deepEqual(
  [...HEADLINE_METRICS, ...OTHER_METRICS].map((m) => m.key).sort(),
  METRICS.map((m) => m.key).sort(),
  "the form's two groups together are the whole sheet",
);
assert.equal(OTHER_METRICS.length, METRICS.length - HEADLINE_METRICS.length, "the rest is everything else");
assert.ok(HEADLINE_METRICS.every((m) => isHeadlineMetric(m.key)), "headline membership agrees with the group");
assert.equal(isHeadlineMetric("proteinKg"), false, "a collapsed metric is not a headline one");

// The dashboard's cards are the headline five plus bio age, in that order —
// body fat leads because it is what the household's logging actually moves.
assert.deepEqual(
  CARD_METRICS.map((m) => m.key),
  ["weightKg", "bodyFatPct", "skeletalMuscleMassKg", "visceralFatLevel", "bwiScore", "bioAge"],
  "the dashboard cards are the headline five plus bio age",
);

// Labels carry their unit exactly once, from the one catalogue.
assert.equal(metricLabel(metric("bodyFatPct")), "Body fat (%)", "labels carry their unit");
assert.equal(metricLabel(metric("bwiScore")), "BWI score", "…unless the metric has none");
assert.equal(metricLabel(tapeMetric("waistCm")), "Waist (cm)", "tape labels come from the same catalogue");

// Every target key must be a real metric, and nothing else may pass for one.
assert.equal(GOAL_METRICS.length, GOAL_METRIC_KEYS.length, "every goal key resolves to a catalogue entry");
assert.ok(GOAL_METRICS.every((m) => m.label.length > 0), "goal metrics carry a label");
assert.ok(GOAL_METRIC_KEYS.every(isGoalMetric), "the goal list agrees with isGoalMetric");
assert.equal(isGoalMetric("chestCm"), false, "a tape metric that is not a target is rejected");
assert.equal(isGoalMetric("nonsense"), false, "an unknown key is rejected");

// The role vocabulary. Better Auth types `role` as `string`, its admin plugin only
// knows its own user/admin, and member/trainer are written by direct Drizzle
// updates — so the value is checked rather than asserted, and an unrecognised one
// reads as the least privileged role instead of being handed on as a `Role`.
assert.equal(isRole("admin"), true, "a known role passes");
assert.equal(isRole("trainer"), true, "…all three of them");
assert.equal(isRole("member"), true, "…and member");
assert.equal(isRole("superuser"), false, "an unknown role does not");
assert.equal(isRole("Admin"), false, "the check is case-sensitive");
assert.equal(isRole(""), false, "nor does an empty one");
assert.equal(roleOf("admin"), "admin", "a known role comes back unchanged");
assert.equal(roleOf("superuser"), "member", "an unknown role reads as the least privileged");
assert.equal(roleOf(null), "member", "…as does an absent one, which Better Auth's type allows");
assert.equal(roleOf(undefined), "member", "…in either form");

// progressTowardTarget — the fill behind the BWI ring. The baseline is the
// person's own first reading, so the arithmetic has to work in both directions and
// stay honest at the edges: past the target is full, backwards is empty, and a
// target is the only thing that makes a ring possible at all.
//
// Fractions are compared with a tolerance: (1.1 - 1.0) / (1.2 - 1.0) is
// 0.5000000000000006, which is the right answer in binary floating point. The ring
// does not care, and rounding inside the helper would just be invented precision.
const near01 = (actual: number | null, expected: number, message: string) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 1e-9,
    `${message} (got ${actual})`,
  );

near01(progressTowardTarget(1.0, 0.9, { target: 0.8, direction: "down" }), 0.5, "halfway from the first reading toward a lower target");
near01(progressTowardTarget(1.0, 1.1, { target: 1.2, direction: "up" }), 0.5, "an upward goal counts the same way");
near01(progressTowardTarget(1.0, 0.9, { target: 0.8, direction: null }), 0.5, "with no stored direction, distance decides");
assert.equal(progressTowardTarget(1.0, 0.8, { target: 0.8, direction: "down" }), 1, "reaching the target fills it");
assert.equal(progressTowardTarget(1.0, 0.7, { target: 0.8, direction: "down" }), 1, "…and passing it stays full rather than overflowing");
assert.equal(progressTowardTarget(1.0, 1.1, { target: 0.8, direction: "down" }), 0, "moving away empties it, never below zero");
assert.equal(progressTowardTarget(1.0, 1.0, { target: 0.8 }), 0, "an unmoved reading has gone nowhere");
assert.equal(progressTowardTarget(1.0, 1.0, { target: 1.0, direction: "down" }), 1, "a start already at the target fills it");

// nearestReading — which reading, if any, labels a progress photo. A photo taken
// between measurements must not be captioned with one from weeks away, so "near
// enough to describe that day" is a real boundary, not a preference.
const reading = (iso: string) => ({ at: new Date(iso) });
const day = new Date("2026-09-30T00:00:00Z");
assert.equal(nearestReading([], day), undefined, "no readings, nothing to show");
assert.equal(
  nearestReading([reading("2026-09-29T00:00:00Z")], day)?.at.toISOString(),
  "2026-09-29T00:00:00.000Z",
  "the nearest reading wins",
);
assert.equal(
  nearestReading([reading("2026-09-23T00:00:00Z")], day)?.at.toISOString(),
  "2026-09-23T00:00:00.000Z",
  "seven days is close enough to describe the day",
);
assert.equal(
  nearestReading([reading("2026-09-22T00:00:00Z")], day),
  undefined,
  "eight days is not — the date alone is more honest",
);
assert.equal(
  nearestReading([reading("2026-09-10T00:00:00Z"), reading("2026-09-28T00:00:00Z")], day)?.at.toISOString(),
  "2026-09-28T00:00:00.000Z",
  "the closest of several wins",
);
assert.equal(
  nearestReading([reading("2026-09-29T00:00:00Z"), reading("2026-10-01T00:00:00Z")], day)?.at.toISOString(),
  "2026-09-29T00:00:00.000Z",
  "an equal gap goes to the earlier reading",
);
assert.equal(
  nearestReading([reading("2026-10-01T00:00:00Z"), reading("2026-09-29T00:00:00Z")], day)?.at.toISOString(),
  "2026-09-29T00:00:00.000Z",
  "…whichever order they arrive in",
);
assert.equal(
  nearestReading([reading("2026-09-01T00:00:00Z")], day, 60)?.at.toISOString(),
  "2026-09-01T00:00:00.000Z",
  "the window is a parameter, so a caller can loosen it deliberately",
);

// buildWorkoutInput — the workout form's save rules, in the order a person meets
// them. Split out of the component (#43) so the four refusals and the trimming
// are pinned rather than only observable by hand.
const cell = (reps = "", weightKg = "", notes = "") => ({ reps, weightKg, notes });
const draftOf = (over: Partial<WorkoutDraft> = {}): WorkoutDraft => ({
  selected: ["ana"],
  date: "2026-10-01",
  title: "Legs",
  notes: "",
  exercises: [{ name: "Squat", sets: [{ ana: cell("5", "100") }] }],
  ...over,
});
const athleteNames: Record<string, string> = { ana: "Ana", bo: "Bo" };
const refusal = (draft: WorkoutDraft) => {
  const built = buildWorkoutInput(draft, (uid) => athleteNames[uid] ?? "Someone");
  return built.ok ? null : built.error;
};

assert.equal(refusal(draftOf({ selected: [] })), "Select at least one person to log for", "nobody selected is refused first");
assert.equal(refusal(draftOf({ title: "   " })), "Give the workout a title", "a whitespace-only title is no title");
assert.equal(
  refusal(draftOf({ exercises: [{ name: "  ", sets: [{ ana: cell("5", "100") }] }] })),
  "Add at least one exercise",
  "an unnamed exercise is dropped before the emptiness check",
);
assert.equal(
  refusal(draftOf({ selected: ["ana", "bo"] })),
  "Add at least one set for Bo — or unselect them",
  "a selected person left with no sets is named, not counted",
);

const built = buildWorkoutInput(
  draftOf({
    selected: ["ana", "bo"],
    title: "  Legs  ",
    notes: "  ",
    exercises: [
      { name: " Squat ", sets: [{ ana: cell("5", "100", " deep ") }, { ana: cell() }, { bo: cell("8") }] },
      { name: "", sets: [{ ana: cell("1", "1") }] },
    ],
  }),
  (uid) => athleteNames[uid] ?? "Someone",
);
assert.ok(built.ok, "a filled-in draft builds");
if (built.ok) {
  assert.equal(built.input.title, "Legs", "the title is trimmed");
  assert.equal(built.input.notes, null, "blank notes are null, not an empty string");
  assert.equal(built.input.exercises.length, 1, "the unnamed exercise is dropped");
  assert.equal(built.input.exercises[0].name, "Squat", "the exercise name is trimmed");
  assert.deepEqual(
    built.input.exercises[0].participants.map((p) => p.userId),
    ["ana", "bo"],
    "every selected person gets a participant row, in selection order",
  );
  assert.deepEqual(
    built.input.exercises[0].participants[0].sets,
    [{ reps: 5, weightKg: 100, notes: "deep" }],
    "an empty set row is dropped; blank fields become nulls",
  );
  assert.deepEqual(
    built.input.exercises[0].participants[1].sets,
    [{ reps: 8, weightKg: null, notes: null }],
    "a person with no cell in the row still gets the row everyone else filled",
  );
}

// isWorkoutDraft — what may be restored from localStorage on a shared device.
assert.equal(isWorkoutDraft(draftOf()), true, "a draft this form wrote is restorable");
assert.equal(isWorkoutDraft(null), false, "nothing stored");
assert.equal(isWorkoutDraft("nope"), false, "not an object");
assert.equal(isWorkoutDraft({ ...draftOf(), selected: [1] }), false, "a non-string selection is rejected");
assert.equal(isWorkoutDraft({ ...draftOf(), title: undefined }), false, "a missing field is rejected");
assert.equal(
  isWorkoutDraft({ ...draftOf(), exercises: [{ name: "Squat", sets: ["nope"] }] }),
  false,
  "a set row that is not an object is rejected rather than rendered",
);

// isScanFields — what the scan form may restore from localStorage on a shared
// device. A draft the form wrote is all strings; anything else is ignored rather
// than rendered into a field map the form assumes it can trust.
assert.equal(isScanFields({ weightKg: "77.5", notes: "" }), true, "a draft this form wrote is restorable");
assert.equal(isScanFields({}), true, "an empty object is still a shape it can render");
assert.equal(isScanFields(null), false, "nothing stored");
assert.equal(isScanFields("nope"), false, "not an object");
assert.equal(isScanFields([["weightKg", "77.5"]]), false, "an array is not a field map");
assert.equal(isScanFields({ weightKg: 77.5 }), false, "a non-string value is rejected");

// scanFieldsFrom — the edit form's seed: the scan's own numbers as input
// strings, with a null metric empty (not "null") and the date as app-timezone
// wall clock, which is the only thing a datetime-local input can hold.
const storedScan = {
  scannedAt: parseWallTimeInAppTz("2026-09-30T08:15"),
  notes: "morning scan",
  weightKg: 77.5,
  bodyFatPct: null,
};
const seeded = scanFieldsFrom(storedScan);
assert.match(seeded.scannedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "the seed is a zoneless datetime-local value");
assert.equal(
  parseWallTimeInAppTz(seeded.scannedAt).getTime(),
  storedScan.scannedAt.getTime(),
  "…that round-trips to the stored instant",
);
assert.equal(seeded.notes, "morning scan", "notes carry over");
assert.equal(seeded.weightKg, "77.5", "a stored number becomes the input's string");
assert.equal(seeded.bodyFatPct, "", "a null metric seeds empty");
assert.equal(METRICS.every((m) => m.key in seeded), true, "every metric has a field");

// extractedScanPatch — the AI's reading as a patch, plus the metric keys it
// filled. A patch rather than whole fields because extraction is asynchronous:
// the caller merges it functionally, so typing during the read survives.
const read = extractedScanPatch({
  scannedAt: "2026-09-30T00:43:00.000Z",
  weightKg: 77.5,
  bmi: 23.4,
  bodyFatPct: null,
  notes: undefined,
  focus: { area: "diet" },
});
assert.equal(
  parseWallTimeInAppTz(read.patch.scannedAt).getTime(),
  new Date("2026-09-30T00:43:00.000Z").getTime(),
  "the instant is converted to app-timezone wall time",
);
assert.equal(read.patch.weightKg, "77.5", "a number is stringified for the input");
assert.equal(read.patch.bmi, "23.4", "…an unknown scalar too, so nothing the model read is dropped");
assert.equal("bodyFatPct" in read.patch, false, "a null is not written");
assert.equal("notes" in read.patch, false, "an undefined is not written");
assert.equal("focus" in read.patch, false, "an object is not stringified into a field");
assert.deepEqual(
  [...read.filled].sort(),
  ["weightKg"],
  "only keys the form renders are marked AI-filled, not every scalar it read",
);
assert.equal("scannedAt" in extractedScanPatch({ scannedAt: "not a date" }).patch, false, "an unparseable date is ignored");
assert.equal("scannedAt" in extractedScanPatch({ scannedAt: "" }).patch, false, "…as is an empty one");
assert.deepEqual(extractedScanPatch(null).patch, {}, "no reading, no patch");
assert.equal(extractedScanPatch(null).filled.size, 0, "…and nothing marked");
assert.equal(
  { scannedAt: "typed", notes: "typed", ...read.patch }.notes,
  "typed",
  "merging keeps a field the read did not return",
);

// ── Wall-time parsing rejects dates that do not exist ──
const invalid = (s: string) => Number.isNaN(parseWallTimeInAppTz(s).getTime());
assert.ok(invalid("2026-02-30T09:00"), "Feb 30 is rejected, not rolled into March");
assert.ok(invalid("2026-02-29T09:00"), "Feb 29 in a non-leap year is rejected");
assert.ok(!invalid("2028-02-29T09:00"), "Feb 29 in a leap year is accepted");
assert.ok(invalid("2026-13-01T09:00"), "month 13 is rejected");
assert.ok(invalid("2026-04-31T09:00"), "April 31 is rejected");
assert.ok(invalid("2026-10-07T24:00"), "hour 24 is rejected");
assert.ok(invalid("2026-10-07T09:60"), "minute 60 is rejected");
assert.equal(
  toLocalInputInTz(parseWallTimeInAppTz("2026-10-07T09:30")),
  "2026-10-07T09:30",
  "a valid wall time round-trips",
);

// ── Exercise history: one session's summary ──
{
  const summary = exerciseSessionSummary([
    { reps: 10, weightKg: 60 },
    { reps: 5, weightKg: 70 },
    { reps: 12, weightKg: null },
  ]);
  assert.equal(summary.best?.weightKg, 70, "the top 1RM estimate wins, not the most reps");
  assert.equal(summary.best?.estOneRepMax, 70 * (1 + 5 / 30), "Epley estimate of the best set");
  assert.equal(summary.volume, 10 * 60 + 5 * 70, "volume ignores sets without weight");
  assert.equal(summary.setCount, 3, "every set counts toward the set count");
  const bodyweight = exerciseSessionSummary([{ reps: 15, weightKg: null }]);
  assert.equal(bodyweight.best, null, "bodyweight work has no 1RM");
  assert.equal(bodyweight.volume, 0, "…and no volume");
  assert.equal(
    exerciseSessionSummary([{ reps: 20, weightKg: 50 }]).best?.estOneRepMax,
    50 * (1 + 12 / 30),
    "reps are capped at 12 for the estimate",
  );
  const prs = exercisePRs([
    { date: new Date("2026-09-01"), exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 100 }] }] },
    { date: new Date("2026-09-08"), exercises: [{ name: "Squat", sets: [{ reps: 5, weightKg: 90 }] }] },
  ]);
  assert.equal(prs.length, 1, "one PR per exercise");
  assert.equal(prs[0].bestSet.weightKg, 100, "the PR is the heavier session");
  assert.equal(prs[0].achievedAt.toISOString().slice(0, 10), "2026-09-01", "…dated when it happened");
}

// ── Exercise history links ──
assert.equal(exerciseHistoryHref("Bench press", "me", "me"), "/workouts/exercise?name=Bench+press", "own link omits user");
assert.equal(
  exerciseHistoryHref("Pull-up & hang", "m1", "me"),
  "/workouts/exercise?name=Pull-up+%26+hang&user=m1",
  "a member link carries user, and the name is encoded",
);

// ── PT packages: a punch card per participant ──
{
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const balances = packageBalances(
    [
      { memberUserId: null, sessions: 10, startsOn: d("2026-09-01") },
      { memberUserId: null, sessions: 5, startsOn: d("2026-10-01") },
      { memberUserId: "m1", sessions: 2, startsOn: d("2026-09-15") },
    ],
    [
      { memberUserId: null, startsAt: d("2026-08-20") }, // before any package
      { memberUserId: null, startsAt: d("2026-09-05") },
      { memberUserId: null, startsAt: d("2026-09-12") },
      { memberUserId: "m1", startsAt: d("2026-09-20") },
      { memberUserId: "m1", startsAt: d("2026-09-27") },
      { memberUserId: "m1", startsAt: d("2026-10-04") },
      { memberUserId: "m2", startsAt: d("2026-10-04") }, // no package, never counted
    ],
  );
  const couple = balances.find((b) => b.memberUserId === null)!;
  assert.equal(couple.purchased, 15, "packages pool");
  assert.equal(couple.used, 2, "a session before the first package does not count");
  assert.equal(couple.remaining, 13, "remaining = purchased − used");
  assert.equal(couple.since.toISOString().slice(0, 10), "2026-09-01", "counting starts at the earliest package");
  const m1 = balances.find((b) => b.memberUserId === "m1")!;
  assert.equal(m1.remaining, -1, "sessions beyond the package show as over, not clamped");
  assert.equal(balances.length, 2, "a participant without a package has no balance");
}

// ── CSV cells neutralise spreadsheet formulas ──
assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`, "a formula is prefixed and quoted");
assert.equal(csvCell("+1"), "'+1", "a leading plus in text is neutralised");
assert.equal(csvCell("-2 sets"), "'-2 sets", "…and a leading minus");
assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)", "…and a leading at-sign");
assert.equal(csvCell(-2.5), "-2.5", "a negative number stays a number");
assert.equal(csvCell("Bench press"), "Bench press", "plain text is unchanged");
assert.equal(csvCell("a,b"), `"a,b"`, "a comma is still quoted");
assert.equal(csvCell(null), "", "null is empty");

// ── CSV parsing ──
assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]], "CRLF rows");
assert.deepEqual(parseCsv('\ufeffa\n"x, ""y""\nz"\n'), [["a"], ['x, "y"\nz']], "BOM, quotes, embedded comma/quote/newline");
assert.deepEqual(parseCsv("a,b\n\n1,\n"), [["a", "b"], ["1", ""]], "blank lines dropped, trailing empty cell kept");
assert.deepEqual(parseCsv(csvCell("=SUM(A1)") + "\n"), [["=SUM(A1)"]], "the export's formula guard is removed on import");
assert.deepEqual(parseCsv("'plain\n"), [["'plain"]], "a leading quote on ordinary text is kept");

// ── Import timestamps ──
assert.equal(parseImportTimestamp("2026-09-30T00:43:00.000Z").toISOString(), "2026-09-30T00:43:00.000Z", "an exported instant is kept");
assert.equal(parseImportTimestamp("2026-09-30T08:43+08:00").toISOString(), "2026-09-30T00:43:00.000Z", "an offset is honoured");
assert.equal(
  parseImportTimestamp("2026-09-30 08:43").getTime(),
  parseWallTimeInAppTz("2026-09-30T08:43").getTime(),
  "a zoneless time is wall time in APP_TZ, never the server's zone",
);
assert.equal(
  parseImportTimestamp("2026-09-30").getTime(),
  parseWallTimeInAppTz("2026-09-30T00:00").getTime(),
  "a bare date is local midnight",
);
assert.ok(Number.isNaN(parseImportTimestamp("30/09/2026").getTime()), "an ambiguous format is rejected");

// ── Import rows ──
{
  const ok = buildImportRows(
    "measurements",
    "measuredAt,weightKg,waistCm,notes,unknownColumn\n2026-01-05 07:00,80.5,90,morning,x\n2026-01-12,79.9,,,\n",
    "u1",
  );
  assert.ok(ok.ok, "a valid file builds");
  if (ok.ok) {
    assert.equal(ok.rows.length, 2, "one row per line");
    assert.equal(ok.rows[0].values.weightKg, 80.5, "numbers are parsed");
    assert.equal(ok.rows[1].values.waistCm, null, "an empty cell is null");
    assert.equal(ok.rows[1].values.notes, null, "an empty note is null");
    assert.equal("unknownColumn" in ok.rows[0].values, false, "unknown columns are ignored");
  }
  const bad = buildImportRows("measurements", "measuredAt,weightKg\n2026-01-05,abc\nnot a date,80\n2026-02-30,70\n", "u1");
  assert.ok(!bad.ok, "a bad row fails the whole file");
  if (!bad.ok) {
    assert.equal(bad.errors.length, 3, "every bad line is reported");
    assert.match(bad.errors[0], /^Line 2: weightKg/, "errors name the line and column");
    assert.match(bad.errors[2], /^Line 4/, "an impossible date is a bad line, not a rolled-over one");
  }
  const dup = buildImportRows("measurements", "measuredAt,weightKg\n2026-01-05,80\n2026-01-05,81\n", "u1");
  assert.ok(!dup.ok && dup.errors[0].includes("appears twice"), "a timestamp repeated in the file is rejected");
  const noTs = buildImportRows("meals", "description\nOats\n", "u1");
  assert.ok(!noTs.ok && noTs.errors[0].includes("loggedAt"), "the timestamp column is required");
  const meal = buildImportRows("meals", "loggedAt,mealType,description,calories\n2026-01-05 08:00,brunch,Eggs,300\n", "u1");
  assert.ok(!meal.ok && meal.errors[0].includes("mealType"), "the meal type must be one of the four");
  const tooMany = buildImportRows("measurements", "measuredAt,weightKg\n" + "2026-01-05,80\n".repeat(2001), "u1");
  assert.ok(!tooMany.ok && tooMany.errors[0].includes("At most"), "row cap enforced");

  // An export of scans imports back unchanged.
  const exported = [
    ["scannedAt", ...METRICS.map((m) => m.key), "notes", "hasImage"],
    ["2026-09-30T00:43:00.000Z", ...METRICS.map((m) => (m.key === "weightKg" ? 72.4 : null)), "-after a cold", true],
  ]
    .map((cells) => cells.map(csvCell).join(","))
    .join("\r\n");
  const round = buildImportRows("scans", exported, "u1");
  assert.ok(round.ok, "a scans export imports back");
  if (round.ok) {
    assert.equal(round.rows[0].at.toISOString(), "2026-09-30T00:43:00.000Z", "…at the same instant");
    assert.equal(round.rows[0].values.weightKg, 72.4, "…with the same numbers");
    assert.equal(round.rows[0].values.notes, "-after a cold", "…and a guarded note restored");
  }
}

console.log("analytics tests passed");
