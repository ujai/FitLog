import { NextResponse } from "next/server";
import sharp from "sharp";

/**
 * Width variants image routes may serve via the `?w=` param. Anything else
 * falls back to the original — keeps the resize CPU budget bounded.
 */
const IMAGE_WIDTHS = new Set([320]);

export function parseImageWidth(req: Request): number | null {
  const raw = new URL(req.url).searchParams.get("w");
  if (raw === null) return null;
  const width = Number(raw);
  return IMAGE_WIDTHS.has(width) ? width : null;
}

/**
 * Scan and photo bytes are write-once per row id, so the id identifies the
 * content. Meal photos can be replaced by an edit, so their route passes a
 * `version` (a hash of the bytes) — without it a revalidating browser gets a
 * 304 and keeps showing the old photo. Width variants get their own ETag so
 * cache entries never cross-contaminate.
 */
export function imageEtag(kind: string, id: string, width: number | null, version?: string): string {
  return `"${kind}:${id}${version ? `:${version}` : ""}${width ? `:w${width}` : ""}"`;
}

/**
 * Serve image bytes. `private, no-cache` keeps the browser from reusing a copy
 * without asking: the ETag is already known here, so the ask is a 304, and the
 * revalidating request is what re-runs the route's authorization on a shared
 * device — which `immutable` for a year quietly made dead code.
 */
export async function imageResponse(
  data: Buffer,
  mime: string | null,
  etag: string,
  width: number | null,
): Promise<NextResponse> {
  const body = width
    ? await sharp(data)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
    : data;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": width ? "image/jpeg" : (mime ?? "image/jpeg"),
      "Cache-Control": "private, no-cache",
      "Content-Disposition": "inline",
      ETag: etag,
    },
  });
}
