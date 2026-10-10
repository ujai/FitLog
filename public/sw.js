/**
 * FitLog service worker.
 *
 * Scope of trust: this app serves one household's private health data through
 * authenticated routes on a shared household device, so the worker NEVER caches
 * HTML or any authenticated response — a cached page could be handed to the
 * wrong person after they switch accounts. It caches only immutable,
 * content-hashed build assets, which is all a fetch handler needs to exist for
 * the app to be installable.
 *
 * Every other request is left alone and goes to the network as normal.
 */

const CACHE = "fitlog-static-v1";

/** Content-hashed build output: safe to serve from cache forever. */
const IMMUTABLE = /^\/_next\/static\//;
/** The app's own marks, which change only when the artwork does. */
const ICONS = /^\/(icon-(?:192|512|maskable-512)\.png|icon\.svg|apple-icon\.png)$/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop anything an older version of this worker left behind.
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Content-hashed build output: the URL changes when the bytes do, so a cached
  // copy can never be stale — answer from cache without asking the network.
  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;

        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  if (!ICONS.test(url.pathname)) return;

  // The marks are NOT content-hashed: the same URL carries new artwork after a
  // deploy, so the network decides and the cache is only the offline fallback.
  // Bumping a version constant would work too, but it is one more thing to
  // remember; this way replacing the artwork reaches installed clients by itself.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch (e) {
        const hit = await cache.match(request);
        if (hit) return hit;
        throw e;
      }
    })(),
  );
});
