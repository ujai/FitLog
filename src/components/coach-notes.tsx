import Link from "next/link";
import { DeleteWithUndo, UndoDeleteButton } from "@/components/delete-with-undo";
import { EditPanel, EditProvider, EditTrigger } from "@/components/row-edit";
import { NoteForm } from "@/components/note-form";
import { deleteTrainerNote } from "@/server/notes";
import { fmtDateTime } from "@/lib/format";

/** The note as the route queries it, with the author's name joined in. */
type CoachNote = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string | null;
  authorName: string | null;
  /** Set when the note is a comment on a workout that still exists. */
  workoutId?: string | null;
  workoutTitle?: string | null;
};

/**
 * Coach notes for one member: the check-in feed under the scan history, or —
 * with `workoutSessionId` — the comments on a single workout. A workout comment
 * is still a coach note, so it also appears in the feed, linked to its workout.
 */
export function CoachNotes({
  notes,
  targetId,
  targetName,
  canNote,
  viewerId,
  isAdmin,
  workoutSessionId,
}: {
  notes: CoachNote[];
  targetId: string;
  targetName: string;
  canNote: boolean;
  viewerId: string;
  isAdmin: boolean;
  workoutSessionId?: string;
}) {
  const onWorkout = Boolean(workoutSessionId);
  return (
    <section className="rounded-2xl border border-stone-200 bg-white/70 p-5">
      <h2 className="mb-3 font-medium">💬 {onWorkout ? "Coach comments" : "Coach notes"}</h2>
      {canNote && (
        <div className="mb-4 rounded-xl border border-stone-200 p-4">
          <NoteForm memberUserId={targetId} workoutSessionId={workoutSessionId} />
        </div>
      )}
      {notes.length === 0 ? (
        <p className="text-sm text-stone-600">
          {canNote
            ? onWorkout
              ? "No comments on this workout yet."
              : "No notes yet — leave the first check-in note above."
            : onWorkout
              ? "No coach comments on this workout yet."
              : `No coach notes for ${targetName} yet.`}
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => {
            const canDelete = note.authorId === viewerId || isAdmin;
            return (
              <DeleteWithUndo
                key={note.id}
                action={deleteTrainerNote.bind(null, note.id)}
                className="rounded-xl bg-stone-50 p-4"
              >
                <EditProvider>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-stone-600">
                      {note.authorName ?? "Unknown"} · {fmtDateTime(note.createdAt)}
                      {!onWorkout && note.workoutId && (
                        <>
                          {" · on "}
                          <Link href={`/workouts/${note.workoutId}`} className="text-emerald-700 hover:underline">
                            {note.workoutTitle ?? "a workout"}
                          </Link>
                        </>
                      )}
                    </p>
                    {canDelete && (
                      <div className="flex items-center gap-2">
                        <EditTrigger />
                        <UndoDeleteButton
                          action={deleteTrainerNote.bind(null, note.id)}
                          className="inline-flex min-h-11 items-center rounded-lg border border-red-300 px-3 text-xs text-red-700 transition hover:border-red-400 print:hidden"
                        >
                          Delete
                        </UndoDeleteButton>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 max-w-prose text-sm leading-relaxed whitespace-pre-wrap">{note.body}</p>
                  {canDelete && (
                    <EditPanel
                      form={
                        <NoteForm memberUserId={targetId} noteId={note.id} initial={note.body} />
                      }
                    />
                  )}
                </EditProvider>
              </DeleteWithUndo>
            );
          })}
        </div>
      )}
    </section>
  );
}
