import { cache } from "react";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import type { Session } from "@/lib/auth";
import { canView, role } from "@/lib/session";

type ViewerContext = {
  /** all users whose data the viewer may look at */
  selectable: Array<{ id: string; name: string; role: string }>;
  /** the user whose data is currently displayed */
  target: { id: string; name: string; role: string };
};

/**
 * `cache()` for the same reason `getSession` uses it: the (app) layout and the
 * page both resolve a viewer, and without this each paid its own `user` query
 * for the same answer. Keyed on the argument values, so the common case (no
 * `?user=`) dedupes; a page that passes its own `opts` object will not.
 */
export const resolveViewer = cache(
  async (
    session: Session,
    requestedUserId?: string | string[],
    opts?: { hideTrainer?: boolean },
  ): Promise<ViewerContext> => {
    const users = await db
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .orderBy(asc(user.name));

    const r = role(session);

    // A trainer has no personal data to browse: they switch between their
    // member clients. Members only see themselves; admins see everyone.
    // hideTrainer drops the trainer tab for admins (e.g. scans — trainers
    // never have scan data).
    let selectable = users.filter((u) => canView(session, u.id));
    if (r === "trainer") {
      selectable = selectable.filter((u) => u.role === "member");
    } else if (opts?.hideTrainer) {
      selectable = selectable.filter((u) => u.role !== "trainer");
    }

    const requested = Array.isArray(requestedUserId) ? requestedUserId[0] : requestedUserId;
    // Never undefined. A trainer with no member clients can see nobody at all, and
    // every page dereferences `target`; falling back to the viewer keeps this type
    // truthful and shows them an empty view of their own data instead of an error
    // page. They will not appear in `selectable`, which the user tabs already
    // handle by rendering no active tab.
    const target =
      selectable.find((u) => u.id === requested) ??
      selectable.find((u) => u.id === session.user.id) ??
      selectable[0] ?? {
        id: session.user.id,
        name: session.user.name,
        role: role(session),
      };
    return { selectable, target };
  },
);
