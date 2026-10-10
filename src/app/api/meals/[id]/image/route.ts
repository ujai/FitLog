import { NextResponse } from "next/server";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { meals } from "@/db/schema";
import { getSession, canViewDiet } from "@/lib/session";
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
  // Metadata only — the megabyte-scale blob must not leave the database before
  // the permission check, and a 304 should not pay for it at all. The hash is
  // computed in Postgres because an edit can replace the photo.
  const [meal] = await db
    .select({ userId: meals.userId, hash: sql<string>`md5(${meals.imageData})` })
    .from(meals)
    .where(and(eq(meals.id, id), isNotNull(meals.imageData)));
  if (!meal) return new NextResponse("Not found", { status: 404 });
  if (!canViewDiet(session, meal.userId)) return new NextResponse("Forbidden", { status: 403 });

  const etag = imageEtag("meal", id, width, meal.hash.slice(0, 12));
  if (req.headers.get("if-none-match")?.split(",").map((t) => t.trim()).includes(etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const [row] = await db
    .select({ mime: meals.imageMime, data: meals.imageData })
    .from(meals)
    .where(eq(meals.id, id));
  if (!row?.data) return new NextResponse("Not found", { status: 404 });
  return imageResponse(row.data, row.mime, etag, width);
}
