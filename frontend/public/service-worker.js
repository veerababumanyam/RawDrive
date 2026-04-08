/// <reference lib="webworker" />

const CACHE_NAME = "rawdrive-v1";
const GALLERY_CACHE = "rawdrive-galleries-v1";

// Static assets to precache
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
];

// Install: precache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== GALLERY_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API, cache-first for gallery images
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return;
  }

  // Gallery image requests: cache-first with network fallback
  if (url.pathname.startsWith("/api/v1/public/galleries/") || isImageRequest(request)) {
    event.respondWith(
      caches.open(GALLERY_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok && isImageRequest(request)) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(async () => {
            const fallback = await caches.match(request);
            return fallback || new Response("", { status: 504 });
          });
        })
      )
    );
    return;
  }

  // API requests: network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }

        return new Response(JSON.stringify({ error: "offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const clone = response.clone();
            const cache = await caches.open(CACHE_NAME);
            void cache.put(request, clone);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) {
            return cached;
          }

          const home = await caches.match("/");
          if (home) {
            return home;
          }

          return new Response(
            "<!doctype html><html><body><p>Offline</p></body></html>",
            {
              status: 503,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }
          );
        })
    );
    return;
  }

  // Navigation and static assets: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          const cache = await caches.open(CACHE_NAME);
          void cache.put(request, clone);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }

        return new Response("", { status: 504 });
      })
  );
});

function isImageRequest(request) {
  const accept = request.headers.get("Accept") || "";
  return accept.includes("image/") || /\.(jpg|jpeg|png|webp|avif)$/i.test(new URL(request.url).pathname);
}
