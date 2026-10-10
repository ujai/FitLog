"use client";

import { inputCls, btnPrimaryCls, btnSecondaryCls } from "@/components/controls";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProgressPhoto, updateProgressPhoto } from "@/server/photos";
import { useEditPanel } from "@/components/row-edit";
import { fileToCompressedDataUrl } from "@/lib/image-client";
import { toLocalInputInTz } from "@/lib/tz";

export function PhotoForm({
  defaultUserId,
  photoId,
  initial,
}: {
  defaultUserId: string;
  photoId?: string;
  initial?: Record<string, string>;
}) {
  const router = useRouter();
  const editPanel = useEditPanel();
  const editing = Boolean(photoId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    if (imageDataUrl) formData.set("image", imageDataUrl);
    startSave(async () => {
      const result = photoId
        ? await updateProgressPhoto(photoId, formData)
        : await createProgressPhoto(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that photo. Nothing was lost — try again.");
        return;
      }
      setImageDataUrl(null);
      if (fileRef.current) fileRef.current.value = "";
      if (editing) {
        editPanel?.close();
      } else {
        form.reset();
        // Clearing the form is not confirmation on a thumb flow — say so out loud.
        setNotice("Photo added ✓");
      }
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={async (e) => onSubmit(e)}
      className={`space-y-4 rounded-2xl border border-stone-200 bg-white/70 ${editing ? "p-4" : "p-5"}`}
    >
      <h2 className="font-medium">{editing ? "Edit photo" : "Add a progress photo"}</h2>
      <input type="hidden" name="userId" value={defaultUserId} />

      {/* The image itself can't be swapped in place — delete and re-add to replace it. */}
      {!editing && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                setImageDataUrl(await fileToCompressedDataUrl(file));
              } catch {
                setError("Couldn't read that photo — try a different one.");
              }
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-sm transition hover:border-emerald-600"
          >
            {imageDataUrl ? "Replace photo" : "Choose photo"}
          </button>
          {imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageDataUrl} alt="Preview" className="h-16 rounded-lg border border-stone-300 object-cover" />
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`photo-taken-at${photoId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
            Date &amp; time
          </label>
          <input
            id={`photo-taken-at${photoId ?? ""}`}
            name="takenAt"
            type="datetime-local"
            required
            defaultValue={initial?.takenAt ?? toLocalInputInTz(new Date())}
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor={`photo-notes${photoId ?? ""}`} className="mb-1 block text-xs font-medium text-stone-600">
            Notes (optional)
          </label>
          <input
            id={`photo-notes${photoId ?? ""}`}
            name="notes"
            maxLength={1000}
            defaultValue={initial?.notes ?? ""}
            placeholder="e.g. morning, after cut week 4"
            className={inputCls}
          />
        </div>
      </div>

      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={`${btnPrimaryCls} w-full sm:w-auto`}>
          {saving ? "Saving…" : editing ? "Save changes" : "Add photo"}
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
