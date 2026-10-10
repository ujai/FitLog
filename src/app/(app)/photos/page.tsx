import { redirect } from "next/navigation";

/** Photos now live under Scans; keep old links and bookmarks working. */
export default async function PhotosRedirect({ searchParams }: PageProps<"/photos">) {
  const params = await searchParams;
  const user = Array.isArray(params.user) ? params.user[0] : params.user;
  // Carry the viewed member through, or a bookmarked /photos?user=X lands on
  // the wrong person's photos.
  redirect(user ? `/scans/photos?user=${encodeURIComponent(user)}` : "/scans/photos");
}
