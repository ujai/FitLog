import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { progressPhotos } from "@/db/schema";
import { requireUser, role } from "@/lib/session";
import { resolveViewer } from "@/lib/view";
import { UserTabs } from "@/components/user-tabs";
import { PhotoForm } from "@/components/photo-form";
import { MealPhoto } from "@/components/meal-photo";
import { DeleteWithUndo, UndoDeleteButton } from "@/components/delete-with-undo";
import { EditPanel, EditProvider, EditTrigger } from "@/components/row-edit";
import { deleteProgressPhoto } from "@/server/photos";
import { fmtDate } from "@/lib/format";
import { toLocalInputInTz } from "@/lib/tz";

export const metadata: Metadata = { title: "Photos" };

export default async function PhotosPage({
  searchParams,
}: PageProps<"/scans/photos">) {
  const session = await requireUser();
  const { user: userParam } = await searchParams;
  const { selectable, target } = await resolveViewer(session, userParam);
  const isTrainer = role(session) === "trainer";

  const photos = await db
    .select({
      id: progressPhotos.id,
      takenAt: progressPhotos.takenAt,
      notes: progressPhotos.notes,
    })
    .from(progressPhotos)
    .where(eq(progressPhotos.userId, target.id))
    .orderBy(desc(progressPhotos.takenAt));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Progress photos</h1>
        {photos.length >= 2 && (
          <Link
            href={`/scans/photos/compare${target.id !== session.user.id ? `?user=${target.id}` : ""}`}
            className="inline-flex min-h-11 items-center text-sm text-emerald-700 hover:underline"
          >
            Compare two →
          </Link>
        )}
      </div>

      <UserTabs users={selectable} activeId={target.id} />

      {!isTrainer && <PhotoForm defaultUserId={target.id} />}

      {photos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-center text-stone-600">
          <p className="mb-2 text-3xl">📷</p>
          No photos yet for {target.name}.
          <br />
          Same pose, same lighting, every few weeks — that&apos;s how you see real change.
        </div>
      ) : (
        <section>
          <h2 className="mb-3 font-medium">All photos ({photos.length})</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((p) => (
              <DeleteWithUndo
                key={p.id}
                action={deleteProgressPhoto.bind(null, p.id)}
                className="flex flex-col gap-2 rounded-2xl border border-stone-200 bg-white/70 p-3"
              >
                <EditProvider>
                  <MealPhoto
                    src={`/api/photos/${p.id}/image?w=320`}
                    fullSrc={`/api/photos/${p.id}/image`}
                    alt={`Progress photo from ${fmtDate(p.takenAt)}`}
                  />
                  <p className="text-sm font-medium">{fmtDate(p.takenAt)}</p>
                  {p.notes && <p className="text-xs text-stone-600">{p.notes}</p>}
                  {!isTrainer && (
                    <div className="flex flex-wrap items-center gap-2">
                      <EditTrigger />
                      <UndoDeleteButton action={deleteProgressPhoto.bind(null, p.id)}>
                        Delete
                      </UndoDeleteButton>
                    </div>
                  )}
                  {!isTrainer && (
                    <EditPanel
                      form={
                        <PhotoForm
                          defaultUserId={target.id}
                          photoId={p.id}
                          initial={{
                            takenAt: toLocalInputInTz(p.takenAt),
                            notes: p.notes ?? "",
                          }}
                        />
                      }
                    />
                  )}
                </EditProvider>
              </DeleteWithUndo>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
