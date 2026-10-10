"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { inputCls } from "@/components/controls";

export function CompareSelect({
  options,
  a,
  b,
  basePath,
  earlierLabel = "Earlier scan",
  laterLabel = "Later scan",
}: {
  options: Array<{ id: string; label: string }>;
  a: string;
  b: string;
  /**
   * The route the picks are written to. The caller's page, never this
   * component's: it is shared by the scan comparison and the photo comparison,
   * and a hardcoded path sent the photo picks to the scan page.
   */
  basePath: string;
  earlierLabel?: string;
  laterLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(which: "a" | "b", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(which, value);
    router.replace(`${basePath}?${params.toString()}`);
  }

  const select = (which: "a" | "b", value: string, title: string) => (
    <div className="min-w-0 flex-1">
      <label
        htmlFor={`compare-${which}`}
        className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-600"
      >
        {title}
      </label>
      <select
        id={`compare-${which}`}
        value={value}
        onChange={(e) => onChange(which, e.target.value)}
        className={inputCls}
      >
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="flex flex-wrap gap-4">
      {select("a", a, earlierLabel)}
      {select("b", b, laterLabel)}
    </div>
  );
}
