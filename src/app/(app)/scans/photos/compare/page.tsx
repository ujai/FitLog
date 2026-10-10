import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { measurements, progressPhotos } from "@/db/schema";
import { requireUser, canView } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { fmt, fmtDate } from "@/lib/format";
import { nearestReading } from "@/lib/analytics";
import { CompareSelect } from "@/components/compare-select";
import { UserTabs } from "@/components/user-tabs";
import { PhotoWipe } from "./photo-wipe";

export const metadata: Metadata = { title: "Compare photos" };

type Reading = { at: Date; weightKg: number | null; waistCm: number | null };

/** "Sep 30, 2026", plus that day's numbers when a reading is near enough to describe it. */
function caption(takenAt: Date, reading: Reading | undefined): string {
  const day = fmtDate(takenAt);
  if (!reading) return day;
  const parts = [
    reading.weightKg === null ? null : fmt(reading.weightKg, "kg"),
    reading.waistCm === null ? null : fmt(reading.waistCm, "cm"),
  ].filter((p): p is string => p !== null);
  return parts.length ? `${day} · ${parts.join(" · ")}` : day;
}

export default async function PhotoComparePage({
  searchParams,
}: PageProps<"/scans/photos/compare">) {
  const session = await requireUser();
  const params = await searchParams;
  const { user: userParam, a, b } = params;
  const { selectable, target } = await resolveViewer(session, userParam);
  if (!canView(session, target.id)) {
    return <p className="text-red-700">Not allowed.</p>;
  }

  const [photos, readings] = await Promise.all([
    db
      .select({ id: progressPhotos.id, takenAt: progressPhotos.takenAt })
      .from(progressPhotos)
      .where(eq(progressPhotos.userId, target.id))
      .orderBy(desc(progressPhotos.takenAt)),
    db
      .select({
        at: measurements.measuredAt,
        weightKg: measurements.weightKg,
        waistCm: measurements.waistCm,
      })
      .from(measurements)
      .where(eq(measurements.userId, target.id)),
  ]);

  if (photos.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-600">
        Need at least two photos to compare.
        <div className="mt-3">
          <Link href="/scans/photos" className="inline-flex min-h-11 items-center text-emerald-700 hover:underline">
            Back to photos →
          </Link>
        </div>
      </div>
    );
  }

  // The picks arrive unordered, so settle them by date: "earlier" and "later" are what
  // the captions and the divider promise.
  const pickedLater = photos.find((p) => p.id === b) ?? photos[0];
  const pickedEarlier =
    photos.find((p) => p.id === a && p.id !== pickedLater.id) ??
    photos.find((p) => p.id !== pickedLater.id) ??
    photos[0];
  const [earlier, later] = [pickedEarlier, pickedLater].sort(
    (x, y) => x.takenAt.getTime() - y.takenAt.getTime(),
  );

  const options = photos.map((p) => ({ id: p.id, label: fmtDate(p.takenAt) }));
  const readingFor = (takenAt: Date) => nearestReading(readings, takenAt);
  const earlierCaption = caption(earlier.takenAt, readingFor(earlier.takenAt));
  const laterCaption = caption(later.takenAt, readingFor(later.takenAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Compare photos — {target.name}</h1>
        <Link href="/scans/photos" className="inline-flex min-h-11 items-center text-sm text-stone-600 hover:text-stone-700">
          ← All photos
        </Link>
      </div>

      <UserTabs users={selectable} activeId={target.id} />

      <div className="rounded-2xl border border-stone-200 bg-white/70 p-5">
        <CompareSelect
          options={options}
          a={earlier.id}
          b={later.id}
          basePath="/scans/photos/compare"
          earlierLabel="Earlier photo"
          laterLabel="Later photo"
        />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white/70 p-5">
        {/* Wide: two panes, so both photos can be looked at at once. */}
        <div className="hidden gap-4 sm:grid sm:grid-cols-2">
          {[
            { photo: earlier, caption: earlierCaption },
            { photo: later, caption: laterCaption },
          ].map(({ photo, caption: text }) => (
            <figure key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${photo.id}/image`}
                alt={`Progress photo from ${fmtDate(photo.takenAt)}`}
                className="w-full rounded-2xl border border-stone-200 bg-black/80 object-contain"
              />
              <figcaption className="mt-2 text-sm text-stone-600">{text}</figcaption>
            </figure>
          ))}
        </div>

        {/* Phones: one frame, wiped between by the divider. */}
        <div className="sm:hidden">
          <PhotoWipe
            beforeSrc={`/api/photos/${earlier.id}/image`}
            afterSrc={`/api/photos/${later.id}/image`}
            beforeLabel={earlierCaption}
            afterLabel={laterCaption}
          />
        </div>

        <p className="mt-4 text-xs text-stone-600">
          Photos are fit to the frame by height — the distance from the camera is not recorded, so
          this is not a true-scale comparison. Same lighting, same pose and same distance will read
          closest.
        </p>
      </div>
    </div>
  );
}
