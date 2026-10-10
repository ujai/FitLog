import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { progressPhotos } from "@/db/schema";
import { getSession, canView } from "@/lib/session";
import { isUuid } from "@/lib/validation";
import { imageEtag, imageResponse, parseImageWidth } from "@/lib/serve-image";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  if (!isUuid(id)) return new NextResponse("Not found", { status: 404 });
  const width = parseImageWidth(req);
  // Metadata only — the megabyte-scale blob must not be read before the
  // permission check, and a 304 should not pay for it at all.
  const [photo] = await db
    .select({ userId: progressPhotos.userId })
    .from(progressPhotos)
    .where(and(eq(progressPhotos.id, id), isNotNull(progressPhotos.imageData)));
  if (!photo) return new NextResponse("Not found", { status: 404 });
  if (!canView(session, photo.userId)) return new NextResponse("Forbidden", { status: 403 });

  const etag = imageEtag("photo", id, width);
  if (req.headers.get("if-none-match")?.split(",").map((t) => t.trim()).includes(etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const [row] = await db
    .select({ mime: progressPhotos.imageMime, data: progressPhotos.imageData })
    .from(progressPhotos)
    .where(eq(progressPhotos.id, id));
  if (!row?.data) return new NextResponse("Not found", { status: 404 });
  return imageResponse(row.data, row.mime, etag, width);
}
