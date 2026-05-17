// RawDrive Gallery Service Worker — offline caching for public gallery viewer
const CACHE_NAME = "rawdrive-gallery-v1";
const SHELL_ASSETS = ["/manifest.json"];

// Cache strategies:
// - App shell: cache-first (fast loads)
// - Gallery thumbnails: cache-first with network fallback (offline support)
// - API responses: network-first with cache fallback (fresh data)
// - Full images: network-only (too large to cache by default)

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Synthesizes a minimal valid Response so event.respondWith() never gets
// undefined. Earlier revisions had three branches that ended with
//     .catch(() => caches.match(event.request))
// — when the network fetch rejects AND there's no cached entry, caches
// .match() resolves to `undefined`, then event.respondWith(undefined)
// throws "Failed to convert value to 'Response'" in the browser console.
// This is the SW error users reported when interacting with the design
// studio: a parallel GET (font, thumbnail, manifest) would fail offline
// or against a stopped dev server, the SW would crash with that error,
// and the failure surfaced as an Uncaught (in promise) TypeError that
// looked like it was breaking unrelated UI actions.
function offlineFallback(request) {
  return new Response(
    JSON.stringify({ error: "offline", url: request.url }),
    {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "application/json", "X-RawDrive-SW": "offline" },
    },
  );
}

async function cacheOrOffline(request) {
  const cached = await caches.match(request);
  return cached || offlineFallback(request);
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Thumbnail images: cache-first (offline gallery browsing)
  if (
    url.pathname.includes("/thumb/") ||
    url.pathname.includes("/derivatives/") ||
    url.pathname.includes("/thumbnails/")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => offlineFallback(event.request));
      }),
    );
    return;
  }

  // API calls: network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cacheOrOffline(event.request)),
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(event.request).catch(() => cacheOrOffline(event.request)),
  );
});
