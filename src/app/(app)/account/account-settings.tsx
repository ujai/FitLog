"use client";

import { btnPrimaryCls } from "@/components/controls";

import { useRef, useState, useTransition } from "react";
import { regenerateIcsToken } from "@/server/calendar";

/** Google/Apple fetch the feed themselves, so a LAN or localhost address is unusable. */
function isExternallyReachable(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) {
      return false;
    }
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    // No APP_URL configured — don't nag.
    return true;
  }
}

export function AccountSettings({
  email,
  icsUrl,
  origin,
}: {
  email: string;
  icsUrl: string;
  origin: string;
}) {
  const [regenerating, startTransition] = useTransition();
  const [ics, setIcs] = useState(icsUrl);
  const [copied, setCopied] = useState(false);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function onCopyIcs() {
    const text = `${origin}${ics}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Legacy path for non-secure contexts where the async clipboard API is unavailable
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.appendChild(helper);
      helper.select();
      try {
        document.execCommand("copy");
      } catch {
        return;
      } finally {
        helper.remove();
      }
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  // Minting a new token cannot be undone — the old link dies immediately — so
  // this is an explicit two-step confirm. An undo overlay would be a lie here.
  function onRegenerate() {
    setRegenerateError(null);
    startTransition(async () => {
      const result = await regenerateIcsToken();
      setConfirmingRegenerate(false);
      if (result.ok && result.url) setIcs(result.url);
      else if (!result.ok) setRegenerateError(result.error ?? "Couldn't regenerate the link. The old one still works.");
    });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white/70 p-5">
        <h2 className="font-medium">Account</h2>
        <p className="text-sm text-stone-600">
          Signed in as <span className="font-medium text-stone-700">{email}</span> via Google.
        </p>
        <p className="text-xs text-stone-600">
          Passwords are disabled — access is managed by Google sign-in and the admin allowlist.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white/70 p-5">
        <h2 className="font-medium">Calendar subscription (ICS)</h2>
        <p className="text-sm text-stone-600">
          Add this link to Google Calendar (→ Other calendars → From URL) or Apple Calendar to
          see PT sessions automatically.
        </p>
        <code className="block overflow-x-auto rounded-lg bg-stone-100 px-3 py-2 text-xs text-emerald-700">
          {origin}{ics}
        </code>
        {!isExternallyReachable(origin) && (
          <p className="text-xs text-amber-700">
            This address only resolves on your home network, so Google and Apple Calendar cannot
            fetch it. Point <code>APP_URL</code> at a public address before subscribing.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopyIcs}
            className={btnPrimaryCls}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <span role="status" className="sr-only">{copied ? "Calendar link copied to clipboard" : ""}</span>
          {confirmingRegenerate ? (
            <span
              role="alert"
              className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-stone-300 px-3 py-1.5"
            >
              <span className="text-xs text-amber-700">The old link stops working.</span>
              <button
                type="button"
                onClick={onRegenerate}
                disabled={regenerating}
                className={`${btnPrimaryCls} px-3.5`}
              >
                {regenerating ? "Regenerating…" : "Regenerate"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingRegenerate(false)}
                className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-3.5 text-sm text-stone-600 transition hover:border-stone-400"
              >
                Keep old link
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingRegenerate(true)}
              className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-sm text-stone-600 transition hover:border-emerald-600"
            >
              Regenerate link
            </button>
          )}
        </div>
        {regenerateError && (
          <p role="alert" className="text-xs text-red-700">
            {regenerateError}
          </p>
        )}
      </section>
    </div>
  );
}
