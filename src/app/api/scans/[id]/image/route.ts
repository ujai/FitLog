import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { scans } from "@/db/schema";
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
  const [scan] = await db
    .select({ userId: scans.userId })
    .from(scans)
    .where(and(eq(scans.id, id), isNotNull(scans.imageData)));
  if (!scan) return new NextResponse("Not found", { status: 404 });
  if (!canView(session, scan.userId)) return new NextResponse("Forbidden", { status: 403 });

  const etag = imageEtag("scan", id, width);
  if (req.headers.get("if-none-match")?.split(",").map((t) => t.trim()).includes(etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const [row] = await db
    .select({ mime: scans.imageMime, data: scans.imageData })
    .from(scans)
    .where(eq(scans.id, id));
  if (!row?.data) return new NextResponse("Not found", { status: 404 });
  return imageResponse(row.data, row.mime, etag, width);
}
