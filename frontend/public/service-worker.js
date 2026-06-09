/// <reference lib="webworker" />
//
// RawDrive gallery service worker — M15 enterprise caching strategy.
// See _cobolt-output/latest/build/M15/M15-design-decisions.md § 1.
//
// Strategy:
//   • Static shell (HTML/CSS/JS, icons, fonts): cache-first with versioned precache
//   • Thumbnails + display-webp: stale-while-revalidate with per-gallery LRU quota
//   • API calls: network-first with 3s timeout → cache fallback
//   • Navigation: network-first → cached shell → offline page
//
// Per-gallery LRU: each gallery gets its own Cache Storage bucket keyed by
// gallery-${id}-thumbs with a 50MB quota. When a photographer browses 10
// galleries, each client's hot cache is isolated from eviction pressure caused
// by the photographer's navigation.

const VERSION = "m15-v11";
const SHELL_CACHE = `rawdrive-shell-${VERSION}`;
const API_CACHE = `rawdrive-api-${VERSION}`;
const GALLERY_CACHE_PREFIX = `rawdrive-gallery-${VERSION}-`;
const GALLERY_CACHE_QUOTA_BYTES = 50 * 1024 * 1024; // 50MB per gallery
const GALLERY_CACHE_MAX_ENTRIES = 500;
const API_TIMEOUT_MS = 3000;

// Static shell to precache. Keep this list small — everything here is downloaded
// on first visit. Actual page routes come in via navigate handler.
// NOTE: /offline-gallery.html does not exist yet (created in a later task).
// safePrecache() tolerates missing URLs (catches fetch errors and logs a warning),
// so including it here is safe — install will not fail if the file is absent.
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/offline.html",
  "/offline-gallery.html",
];

// ─── Install ──────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => safePrecache(cache, PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: purge stale versions ─────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => {
            if (k === SHELL_CACHE || k === API_CACHE) return false;
            if (k.startsWith(GALLERY_CACHE_PREFIX)) return false;
            // Stable per-gallery offline buckets survive version bumps so saved
            // galleries remain available after a deploy.
            if (k.startsWith("rawdrive-offline-")) return false;
            return true; // kill every other previous-version cache
          })
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// ─── Fetch router ─────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

  const url = new URL(request.url);

  // Do not intercept cross-origin API/storage requests. In particular,
  // api.rawdrive.in image responses may be requested both as no-cors <img>
  // loads and as normal CORS fetches for encrypted/public gallery views. A
  // cached opaque no-cors image response cannot legally satisfy a later CORS
  // fetch and Chromium reports "opaque response was used for a request whose
  // type is not no-cors". Let the browser/network CORS layer handle these.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Upload/security workers must never be served from an old shell cache.
  // They contain the client-side screening/encryption policy; stale code can
  // reject valid camera files or weaken current security checks.
  if (isSecurityCriticalWorker(url)) {
    event.respondWith(fetchNoStore(request));
    return;
  }

  // Gallery thumbnail/image requests → per-gallery LRU cache
  if (isGalleryAssetRequest(url, request)) {
    event.respondWith(handleGalleryAsset(request, url));
    return;
  }

  // API requests → network-first with 3s timeout
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(handleAPI(request));
    return;
  }

  // Navigation → network-first → cached shell → offline page
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Next/Turbopack chunk filenames are not a reliable deploy boundary here.
  // Prefer fresh bytes after each deploy and keep cache only as an offline
  // fallback; otherwise returning cache-first chunks makes production look
  // like an old build until the user manually clears site data.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(handleFreshStatic(request));
    return;
  }

  // Static assets → cache-first
  event.respondWith(handleStatic(request));
});

// ─── Offline helpers (inlined from public/service-worker-helpers.js) ───────
// INTENTIONAL DUPLICATION: Classic service workers cannot `import` ES modules.
// These functions are byte-identical to the exports in service-worker-helpers.js
// so that unit tests can import and verify the contract against one source of
// truth. If you change either copy, update both files.

const AUTH_QUERY_PARAMS = ["at", "gs", "gallery_session", "token", "access_token"];

/**
 * Strip rotating auth query params so the cache key is stable across token refreshes.
 * @param {string} rawUrl - Must be an absolute URL.
 * @returns {string} The URL with auth query params removed.
 */
function normalizeGalleryCacheKey(rawUrl) {
  const url = new URL(rawUrl);
  for (const p of AUTH_QUERY_PARAMS) url.searchParams.delete(p);
  return url.toString();
}

/**
 * Return the stable, version-independent Cache Storage bucket name for a gallery.
 * @param {string} galleryId - Gallery slug or ID.
 * @returns {string} Cache bucket name of the form `rawdrive-offline-<galleryId>`.
 */
function offlineBucketName(galleryId) {
  return `rawdrive-offline-${galleryId || "default"}`;
}

// ─── Strategy: per-gallery LRU stale-while-revalidate ──────────────────
// Uses a stable, version-independent bucket (`rawdrive-offline-<galleryId>`)
// so cached assets survive SW version bumps / deploys. Auth query params
// (rotating SEC-1 `?at=` tokens, etc.) are stripped from cache keys so a
// new token does not fragment the cache.
async function handleGalleryAsset(request, url) {
  const galleryID = extractGalleryID(url);
  const cacheName = offlineBucketName(galleryID);
  const cache = await caches.open(cacheName);
  const cacheKey = new Request(normalizeGalleryCacheKey(request.url), { method: "GET" });

  let cached = await cache.match(cacheKey);
  if (cached?.type === "opaque" && request.mode !== "no-cors") {
    await cache.delete(cacheKey);
    cached = undefined;
  }

  // Background refresh — fire and forget
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type !== "opaque") {
        await cache.put(cacheKey, response.clone());
        await enforceLRUQuota(cacheName);
      }
      return response;
    })
    .catch(() => cached || new Response("", { status: 504, statusText: "Gateway Timeout" }));

  // Return cached immediately if present, otherwise wait for network
  return cached || refresh;
}

// enforceLRUQuota trims a gallery cache bucket when it exceeds the entry or
// byte budget. Oldest entries (by insertion order — the order keys() returns)
// are deleted until the bucket fits.
async function enforceLRUQuota(cacheName) {
  const cache = await caches.open(cacheName);
  const requests = await cache.keys();

  // Entry-count eviction
  if (requests.length > GALLERY_CACHE_MAX_ENTRIES) {
    const toEvict = requests.length - GALLERY_CACHE_MAX_ENTRIES;
    for (let i = 0; i < toEvict; i++) {
      await cache.delete(requests[i]);
    }
  }

  // Byte-size eviction — compute total size from response Content-Length.
  // Note: Content-Length can be missing on some responses. In that case we
  // fall back to estimating 200KB per entry (typical thumb size).
  let totalBytes = 0;
  const sizes = [];
  for (const req of requests) {
    const resp = await cache.match(req);
    if (!resp) continue;
    const lenHeader = resp.headers.get("content-length");
    const size = lenHeader ? parseInt(lenHeader, 10) : 200 * 1024;
    totalBytes += size;
    sizes.push({ req, size });
  }

  if (totalBytes <= GALLERY_CACHE_QUOTA_BYTES) return;

  // Evict from the front (oldest first) until we're under budget.
  let freed = 0;
  const overflow = totalBytes - GALLERY_CACHE_QUOTA_BYTES;
  for (const entry of sizes) {
    if (freed >= overflow) break;
    await cache.delete(entry.req);
    freed += entry.size;
  }
}

// ─── Strategy: network-first API with timeout ─────────────────────────
async function handleAPI(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetchWithTimeout(request, API_TIMEOUT_MS);
    if (response.ok) {
      // Only cache GET responses of sensible size
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      const clone = cached.clone();
      // Add a header so the client can detect stale responses
      const headers = new Headers(clone.headers);
      headers.set("X-RawDrive-Cache", "stale");
      return new Response(await clone.blob(), {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    return new Response(
      JSON.stringify({ error: "offline", cached: false }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ─── Strategy: navigation with offline shell ──────────────────────────
async function handleNavigation(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    // Offline /g/ precedence (supersedes the earlier "Fix A" reorder):
    // 1) Prefer the cached Next app document. It boots the React app, which
    //    renders <OfflineGalleryView/> from the IndexedDB catalog + Cache Storage
    //    and DECRYPTS encrypted (E2EE) galleries cache-first via
    //    useDecryptedAssetUrl, using the localStorage-persisted gallery media key.
    //    This is the deterministic decrypt-on-view path for saved galleries.
    // 2) Only if the app document was never cached (cold boot) do we fall back to
    //    the vanilla offline gallery shell (served below) — it has no crypto
    //    pipeline and shows an "open online" message for encrypted galleries.
    const cached = await caches.match(request);
    if (cached) return cached;

    // Cold-boot fallback for /g/ navigations when the app document is absent.
    // Look up only the current SHELL_CACHE (not globally) to avoid serving a stale-versioned offline page.
    if (url.pathname.startsWith("/g/")) {
      const shellCache = await caches.open(SHELL_CACHE);
      const galleryShell = await shellCache.match("/offline-gallery.html");
      if (galleryShell) return galleryShell;
    }

    const shellCache = await caches.open(SHELL_CACHE);
    const offline = await shellCache.match("/offline.html");
    if (offline) return offline;

    return new Response(
      `<!doctype html><html><head><meta charset="utf-8"><title>Offline</title></head>
       <body style="font-family:sans-serif;padding:2rem;text-align:center">
         <h1>You're offline</h1>
         <p>Please reconnect to view this gallery.</p>
       </body></html>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

// ─── Strategy: cache-first static ─────────────────────────────────────
async function handleStatic(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && new URL(request.url).origin === self.location.origin) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response("", { status: 504 });
  }
}

async function handleFreshStatic(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(new Request(request, { cache: "no-store" }));
    if (response.ok) {
      cache.put(request, response.clone()).catch(() => {});
      return response;
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    if (isMissingNextScript(request, response)) {
      return missingChunkReloadResponse();
    }
    if (isMissingNextStyle(request, response)) {
      return new Response("", {
        status: 200,
        headers: {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response("", { status: 504 });
  }
}

function isMissingNextScript(request, response) {
  if (response.status !== 404) return false;
  const url = new URL(request.url);
  return url.pathname.startsWith("/_next/static/") && /\.js$/i.test(url.pathname);
}

function isMissingNextStyle(request, response) {
  if (response.status !== 404) return false;
  const url = new URL(request.url);
  return url.pathname.startsWith("/_next/static/") && /\.css$/i.test(url.pathname);
}

function missingChunkReloadResponse() {
  return new Response(
    `(() => {
      try {
        const key = "rawdrive:missing-chunk-reload";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          location.reload();
        }
      } catch (_) {
        location.reload();
      }
    })();`,
    {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
async function safePrecache(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(new Request(url, { cache: "reload" }));
        if (response.ok) {
          await cache.put(url, response.clone());
        }
      } catch (error) {
        console.warn("SW precache skipped:", url, error);
      }
    })
  );
}

function isSecurityCriticalWorker(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  return path.includes("/upload-screening.worker") || /\.(?:worker)(?:\.|$)/i.test(path);
}

async function fetchNoStore(request) {
  try {
    return await fetch(new Request(request, { cache: "no-store" }));
  } catch {
    try {
      return await fetch(request);
    } catch {
      return new Response("", { status: 504, statusText: "Gateway Timeout" });
    }
  }
}

function isGalleryAssetRequest(url, request) {
  const path = url.pathname;
  if (/\.(jpg|jpeg|png|webp|avif)$/i.test(path)) return true;
  if (path.startsWith("/api/v1/public/galleries/") && request.headers.get("Accept")?.includes("image/")) return true;
  if (path.startsWith("/api/v1/assets/") && /\/(thumb|display|original)/.test(path)) return true;
  return false;
}

// extractGalleryID tries to identify which gallery an asset request belongs to,
// so we can route it to the correct cache bucket. Common URL shapes:
//   /g/{slug}/...
//   /api/v1/public/galleries/{slug}/...
//   /api/v1/galleries/{id}/assets/...
// Falls back to a search-param lookup (?gallery=...) then "default".
function extractGalleryID(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const gIdx = parts.indexOf("galleries");
  if (gIdx >= 0 && parts.length > gIdx + 1) return parts[gIdx + 1];
  if (parts[0] === "g" && parts.length > 1) return parts[1];
  const param = url.searchParams.get("gallery");
  if (param) return param;
  return null;
}

async function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(request, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Cache admin: allow the app to purge a specific gallery ───────────
// Handles the following message types from the client:
//   {type: "PURGE_GALLERY", galleryID: "..."}  — purge versioned gallery cache bucket
//   {type: "PURGE_ALL"}                         — purge all versioned gallery buckets
//   {type: "offline:deleteBucket", galleryId: "..."} — delete the stable offline bucket
//     (used when a user removes a saved gallery or consent is withdrawn)
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (typeof data !== "object") return;

  if (data.type === "PURGE_GALLERY" && data.galleryID) {
    event.waitUntil(
      caches.delete(`${GALLERY_CACHE_PREFIX}${data.galleryID}`)
        .then(() => { event.ports[0]?.postMessage({ ok: true }); })
    );
  } else if (data.type === "PURGE_ALL") {
    event.waitUntil(
      caches.keys()
        .then((keys) => Promise.all(keys.filter((k) => k.startsWith(GALLERY_CACHE_PREFIX)).map((k) => caches.delete(k))))
        .then(() => { event.ports[0]?.postMessage({ ok: true }); })
    );
  } else if (data.type === "offline:deleteBucket" && data.galleryId) {
    // fire-and-forget: no reply port expected
    event.waitUntil(caches.delete(offlineBucketName(data.galleryId)));
  }
});
