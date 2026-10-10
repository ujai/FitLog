"use client";

/**
 * Downscale + compress an image file in the browser so uploads stay small
 * (target: max 1600px, JPEG q0.85 → usually well under 500 KB).
 */
export async function fileToCompressedDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 1600;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Prepare an Evolt screenshot for the scan form.
 *
 * - `storage`: the whole image downscaled (max 1600px, JPEG q0.85) — what gets
 *   saved to the database and shown as preview.
 * - `slices`: what gets sent to the AI. Evolt result sheets are very tall
 *   (4000px+); crushing them into 1600px makes the small text unreadable.
 *   Instead, cap the width at a phone-screen width and cut the image into
 *   slightly overlapping full-resolution slices.
 */
export async function prepareScanScreenshot(file: File): Promise<{
  storage: string;
  slices: string[];
}> {
  const bitmap = await createImageBitmap(file);
  try {
    const storageScale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const storage = renderRegion(
      bitmap,
      0,
      0,
      bitmap.width,
      bitmap.height,
      Math.round(bitmap.width * storageScale),
      Math.round(bitmap.height * storageScale),
      0.85,
    );

    const widthScale = Math.min(1, MAX_AI_WIDTH / bitmap.width);
    const width = Math.round(bitmap.width * widthScale);
    const height = Math.round(bitmap.height * widthScale);

    const slices: string[] = [];
    if (height <= AI_SLICE_HEIGHT) {
      slices.push(renderRegion(bitmap, 0, 0, bitmap.width, bitmap.height, width, height, 0.9));
    } else {
      for (
        let top = 0;
        top < height && slices.length < MAX_SLICES;
        top += AI_SLICE_HEIGHT - AI_SLICE_OVERLAP
      ) {
        const sliceHeight = Math.min(AI_SLICE_HEIGHT, height - top);
        if (sliceHeight < AI_SLICE_OVERLAP && slices.length > 0) break;
        slices.push(
          renderRegion(
            bitmap,
            0,
            top,
            bitmap.width,
            sliceHeight,
            width,
            sliceHeight,
            0.9,
          ),
        );
        if (top + sliceHeight >= height) break;
      }
    }
    return { storage, slices };
  } finally {
    bitmap.close();
  }
}

const MAX_DIM = 1600;
const MAX_AI_WIDTH = 1100;
const AI_SLICE_HEIGHT = 1600;
const AI_SLICE_OVERLAP = 80;
const MAX_SLICES = 6;

/** Read a file as a data URL without re-encoding (used for PDFs). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/** Draw a region of a bitmap onto a canvas and return it as a JPEG data URL. */
function renderRegion(
  bitmap: ImageBitmap,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  quality: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas.toDataURL("image/jpeg", quality);
}
