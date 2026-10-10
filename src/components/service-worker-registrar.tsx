"use client";

import { useEffect } from "react";

/**
 * Registers the static-asset cache worker (public/sw.js).
 *
 * Service workers require a secure context, so this is a no-op when the app is
 * served over plain HTTP on the LAN — it is the HTTPS deployment that gets
 * installability and the worker. Registration failures are deliberately silent:
 * a missing worker must never surface as an error in the UI.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
