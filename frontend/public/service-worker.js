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
  const url = new URL(event.request.url);

  // Gallery image requests: cache-first with network fallback
  if (url.pathname.startsWith("/api/v1/public/galleries/") || isImageRequest(event.request)) {
    event.respondWith(
      caches.open(GALLERY_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok && isImageRequest(event.request)) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // API requests: network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Navigation and static assets: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

function isImageRequest(request) {
  const accept = request.headers.get("Accept") || "";
  return accept.includes("image/") || /\.(jpg|jpeg|png|webp|avif)$/i.test(new URL(request.url).pathname);
}
