"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { choiceCls, choiceOffCls, choiceOnCls } from "@/components/controls";

export function UserTabs({
  users,
  activeId,
}: {
  users: Array<{ id: string; name: string; role: string }>;
  activeId: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (users.length <= 1) return null;

  return (
    <div role="group" aria-label="Switch member" className="mb-4 flex flex-wrap gap-2 print:hidden">
      {users.map((u) => {
        const params = new URLSearchParams(searchParams.toString());
        if (u.id === activeId) params.delete("user");
        else params.set("user", u.id);
        const href = u.id === activeId ? pathname : `${pathname}?${params.toString()}`;
        const active = u.id === activeId;
        return (
          <Link
            key={u.id}
            href={href}
            aria-current={active ? "true" : undefined}
            className={`${choiceCls} px-4 text-sm ${
              active ? choiceOnCls : choiceOffCls
            }`}
          >
            {u.name}
            {u.role === "trainer" && <span className="ml-1.5 text-xs opacity-70">PT</span>}
          </Link>
        );
      })}
    </div>
  );
}
