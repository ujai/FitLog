"use client";

import { inputCls, btnPrimaryCls, btnSecondaryCls } from "@/components/controls";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTrainerNote, updateTrainerNote } from "@/server/notes";
import { useEditPanel } from "@/components/row-edit";

export function NoteForm({
  memberUserId,
  noteId,
  initial,
  workoutSessionId,
}: {
  memberUserId: string;
  noteId?: string;
  initial?: string;
  /** Makes a new note a comment on this workout. */
  workoutSessionId?: string;
}) {
  const router = useRouter();
  const editPanel = useEditPanel();
  const editing = Boolean(noteId);
  const [body, setBody] = useState(initial ?? "");
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    startSave(async () => {
      const result = noteId
        ? await updateTrainerNote(noteId, body)
        : await createTrainerNote(memberUserId, body, workoutSessionId);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the note. Nothing was lost — try again.");
        return;
      }
      if (editing) {
        editPanel?.close();
      } else {
        setBody("");
        // Clearing the form is not confirmation on a thumb flow — say so out loud.
        setNotice(workoutSessionId ? "Comment added ✓" : "Note added ✓");
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label htmlFor={`coach-note${noteId ?? ""}`} className="block text-xs font-medium text-stone-600">
        {editing ? "Edit this note" : workoutSessionId ? "Comment on this workout" : "Leave a check-in note"}
      </label>
      <textarea
        id={`coach-note${noteId ?? ""}`}
        rows={3}
        maxLength={2000}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          workoutSessionId
            ? "e.g. Squat depth was much better today — add 2.5 kg next time."
            : "e.g. Great progress on body fat — keep protein high this week and we'll add a rest day."
        }
        className={inputCls}
      />
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={btnPrimaryCls}>
          {saving ? "Saving…" : editing ? "Save changes" : workoutSessionId ? "Add comment" : "Add note"}
        </button>
        {editing && (
          <button type="button" onClick={() => editPanel?.close()} className={btnSecondaryCls}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
