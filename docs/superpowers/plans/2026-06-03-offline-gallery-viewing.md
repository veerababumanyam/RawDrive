# Offline Gallery Viewing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a gallery client browse a delivered gallery with zero connectivity and keep it as a durable keepsake, caching automatically on view.

**Architecture:** Hybrid (Approach C). Display-image bytes live in Cache Storage (a stable per-gallery bucket managed by the service worker, with token-stripped cache keys). Structured metadata (gallery JSON, asset list, per-asset manifests, key id, expiry/etag, last-viewed) lives in IndexedDB. A client orchestrator caches on view + prefetches the whole gallery and, on reconnect, revalidates and purges revoked galleries. An offline client component re-renders the existing grid from the catalog + cache, decrypting on view with the client-stored gallery key.

**Tech Stack:** Next.js 15 (App Router, client components), TypeScript, vitest + jsdom + fake-indexeddb, Cache Storage + IndexedDB + Service Worker, Web Crypto (reused), Go (Chi) for one ETag header. Playwright (Docker) for E2E.

**Reference:** spec at `docs/superpowers/specs/2026-06-03-offline-gallery-viewing-design.md`. Follow `frontend/AGENTS.md`, `design-tokens.json`, and `GlassIconButton` UI rules. All work on branch `feat/offline-gallery-viewing`.

**Conventions discovered:** named exports only (no default for components); kebab-case route segments; `frontend/src/lib/media-encryption/{media-key-store,asset-media,use-decrypted-asset-url}.ts` provide decrypt + `EncryptedAssetLike`/`PickedAssetMedia`/`MediaEncryptionManifest` + `GRID_VARIANTS`/`LIGHTBOX_VARIANTS`; `frontend/public/service-worker.js` `VERSION="m15-v7"` with transient `GALLERY_CACHE_PREFIX`; `pnpm --dir frontend` for all FE commands.

---

## File structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/offline/catalog.ts` (new) | IndexedDB data layer: persist/read `SavedGalleryMeta` |
| `frontend/src/lib/offline/storage.ts` (new) | Quota (`persist`/`estimate`) + whole-gallery LRU eviction |
| `frontend/src/lib/offline/sync.ts` (new) | Orchestration: cache-on-view + prefetch + reconnect revalidation/purge |
| `frontend/src/lib/offline/types.ts` (new) | Shared `SavedGalleryMeta`, `SavedAsset` types |
| `frontend/public/service-worker.js` (modify) | Stable offline bucket + token-stripped keys + offline gallery navigation |
| `frontend/src/components/gallery/offline-gallery-view.tsx` (new) | Offline client render of the grid from catalog + cache |
| `frontend/src/app/g/[slug]/offline-boot.tsx` (new) | Client boot that hydrates `OfflineGalleryView` from the slug + catalog |
| `frontend/src/app/g/[slug]/page.tsx` (modify) | After online render, fire `cacheGalleryForOffline` |
| `frontend/src/components/offline/manage-offline-storage.tsx` (new) | "Saved offline" list + Remove + usage |
| `backend/internal/handler/public_gallery_handler.go` (modify) | Add `ETag` to `GetBySlug` response |

Tests live beside each module under `__tests__/` (vitest) except E2E under `e2e/`.

---

## Task 1: Test infra — IndexedDB in jsdom

**Files:**
- Modify: `frontend/package.json` (add devDependency)
- Create: `frontend/src/test/setup-indexeddb.ts`
- Modify: `frontend/vitest.config.ts` (register setup file)

- [ ] **Step 1: Add fake-indexeddb**

Run: `pnpm --dir frontend add -D fake-indexeddb@^6`
Expected: added to devDependencies; lockfile updated.

- [ ] **Step 2: Create the setup file**

`frontend/src/test/setup-indexeddb.ts`:
```ts
// Provides a real (in-memory) IndexedDB + structuredClone for jsdom tests.
import "fake-indexeddb/auto";
```

- [ ] **Step 3: Register it in vitest config**

In `frontend/vitest.config.ts`, add to the `test` block:
```ts
setupFiles: ["./src/test/setup-indexeddb.ts"],
```
(If `setupFiles` already exists, append this path to the array.)

- [ ] **Step 4: Smoke-test it**

Create `frontend/src/test/__tests__/indexeddb-smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("indexeddb test env", () => {
  it("exposes indexedDB", () => {
    expect(typeof indexedDB).toBe("object");
    expect(indexedDB).toBeTruthy();
  });
});
```
Run: `pnpm --dir frontend exec vitest run src/test/__tests__/indexeddb-smoke.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/test/setup-indexeddb.ts frontend/vitest.config.ts frontend/src/test/__tests__/indexeddb-smoke.test.ts
git commit -m "test(offline): add fake-indexeddb to the vitest env"
```

---

## Task 2: Shared types

**Files:**
- Create: `frontend/src/lib/offline/types.ts`

- [ ] **Step 1: Write the types**

`frontend/src/lib/offline/types.ts`:
```ts
import type { MediaEncryptionManifest } from "@/lib/media-encryption/asset-media";

export type SavedAsset = {
  id: string;
  filename: string;
  displayKey: string;                 // storage key of display_webp(.enc)
  thumbnailUrls: Record<string, string>;
  manifest: MediaEncryptionManifest | null; // null for non-encrypted
  width?: number;
  height?: number;
  blurhash?: string;
};

export type SavedGalleryMeta = {
  slug: string;                       // primary key
  galleryId: string;                  // Cache Storage bucket: rawdrive-offline-<galleryId>
  ws: string | null;                  // ?ws= workspace scope
  title: string;
  isEncrypted: boolean;
  keyId: string | null;               // media-key-store keyId, for decrypt-on-view
  assets: SavedAsset[];
  gallerySettings: Record<string, unknown>;
  etag: string | null;
  expiresAt: string | null;
  lastViewedAt: number;               // epoch ms
  lastValidatedAt: number;            // epoch ms
  approxBytes: number;
};
```
(If `MediaEncryptionManifest` is not exported from `asset-media.ts`, add `export` to its declaration there in this step and commit that one-line change with this task.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --dir frontend exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/offline/types.ts frontend/src/lib/media-encryption/asset-media.ts
git commit -m "feat(offline): shared SavedGalleryMeta/SavedAsset types"
```

---

## Task 3: `offline-catalog` (IndexedDB data layer)

**Files:**
- Create: `frontend/src/lib/offline/catalog.ts`
- Test: `frontend/src/lib/offline/__tests__/catalog.test.ts`

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/offline/__tests__/catalog.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { saveGalleryMeta, getGalleryMeta, listSaved, removeGallery, markValidated, touchViewed } from "../catalog";
import type { SavedGalleryMeta } from "../types";

const base: SavedGalleryMeta = {
  slug: "tey-1", galleryId: "g1", ws: null, title: "Tey", isEncrypted: false,
  keyId: null, assets: [], gallerySettings: {}, etag: "v1", expiresAt: null,
  lastViewedAt: 1000, lastValidatedAt: 1000, approxBytes: 100,
};

describe("offline catalog", () => {
  beforeEach(async () => {
    for (const m of await listSaved()) await removeGallery(m.slug);
  });

  it("saves and reads a gallery by slug", async () => {
    await saveGalleryMeta(base);
    const got = await getGalleryMeta("tey-1");
    expect(got?.title).toBe("Tey");
  });

  it("lists saved galleries", async () => {
    await saveGalleryMeta(base);
    await saveGalleryMeta({ ...base, slug: "tey-2", galleryId: "g2" });
    const all = await listSaved();
    expect(all.map((m) => m.slug).sort()).toEqual(["tey-1", "tey-2"]);
  });

  it("removes a gallery", async () => {
    await saveGalleryMeta(base);
    await removeGallery("tey-1");
    expect(await getGalleryMeta("tey-1")).toBeNull();
  });

  it("markValidated updates etag + lastValidatedAt", async () => {
    await saveGalleryMeta(base);
    await markValidated("tey-1", "v2", 5000);
    const got = await getGalleryMeta("tey-1");
    expect(got?.etag).toBe("v2");
    expect(got?.lastValidatedAt).toBe(5000);
  });

  it("touchViewed bumps lastViewedAt", async () => {
    await saveGalleryMeta(base);
    await touchViewed("tey-1", 9000);
    expect((await getGalleryMeta("tey-1"))?.lastViewedAt).toBe(9000);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `pnpm --dir frontend exec vitest run src/lib/offline/__tests__/catalog.test.ts`
Expected: FAIL ("Cannot find module '../catalog'").

- [ ] **Step 3: Implement the catalog**

`frontend/src/lib/offline/catalog.ts`:
```ts
import type { SavedGalleryMeta } from "./types";

const DB_NAME = "rawdrive-offline";
const DB_VERSION = 1;
const STORE = "galleries";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "slug" });
        store.createIndex("byLastViewed", "lastViewedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    t.oncomplete = () => db.close();
  });
}

export async function saveGalleryMeta(meta: SavedGalleryMeta): Promise<void> {
  await tx("readwrite", (s) => s.put(meta));
}

export async function getGalleryMeta(slug: string): Promise<SavedGalleryMeta | null> {
  const r = await tx<SavedGalleryMeta | undefined>("readonly", (s) => s.get(slug));
  return r ?? null;
}

export async function listSaved(): Promise<SavedGalleryMeta[]> {
  return (await tx<SavedGalleryMeta[]>("readonly", (s) => s.getAll())) ?? [];
}

export async function removeGallery(slug: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(slug));
}

export async function markValidated(slug: string, etag: string | null, at: number): Promise<void> {
  const meta = await getGalleryMeta(slug);
  if (!meta) return;
  await saveGalleryMeta({ ...meta, etag, lastValidatedAt: at });
}

export async function touchViewed(slug: string, at: number): Promise<void> {
  const meta = await getGalleryMeta(slug);
  if (!meta) return;
  await saveGalleryMeta({ ...meta, lastViewedAt: at });
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --dir frontend exec vitest run src/lib/offline/__tests__/catalog.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/offline/catalog.ts frontend/src/lib/offline/__tests__/catalog.test.ts
git commit -m "feat(offline): IndexedDB gallery catalog"
```

---

## Task 4: `offline-storage` (quota + whole-gallery LRU)

**Files:**
- Create: `frontend/src/lib/offline/storage.ts`
- Test: `frontend/src/lib/offline/__tests__/storage.test.ts`

The eviction policy is pure logic over `listSaved()` + a delete callback, so it is unit-testable without real Cache Storage.

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/offline/__tests__/storage.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { selectGalleriesToEvict } from "../storage";
import type { SavedGalleryMeta } from "../types";

const g = (slug: string, lastViewedAt: number, approxBytes: number): SavedGalleryMeta => ({
  slug, galleryId: slug, ws: null, title: slug, isEncrypted: false, keyId: null,
  assets: [], gallerySettings: {}, etag: null, expiresAt: null,
  lastViewedAt, lastValidatedAt: 0, approxBytes,
});

describe("whole-gallery LRU eviction", () => {
  it("evicts least-recently-viewed whole galleries until under cap", () => {
    const saved = [g("a", 100, 600), g("b", 300, 600), g("c", 200, 600)]; // total 1800
    const evict = selectGalleriesToEvict(saved, 1000); // need to drop >=800
    // oldest first: a(100) then c(200) → 1200 freed ≥ 800, stop before b
    expect(evict).toEqual(["a", "c"]);
  });

  it("returns empty when already under cap", () => {
    expect(selectGalleriesToEvict([g("a", 1, 100)], 1000)).toEqual([]);
  });

  it("never partially evicts — returns whole slugs only", () => {
    const evict = selectGalleriesToEvict([g("a", 1, 5000)], 1000);
    expect(evict).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --dir frontend exec vitest run src/lib/offline/__tests__/storage.test.ts`
Expected: FAIL ("selectGalleriesToEvict is not a function").

- [ ] **Step 3: Implement**

`frontend/src/lib/offline/storage.ts`:
```ts
import type { SavedGalleryMeta } from "./types";
import { listSaved, removeGallery } from "./catalog";

// Default cap: lesser of 2GB or 50% of the device quota (resolved at runtime).
const DEFAULT_CAP_BYTES = 2 * 1024 * 1024 * 1024;

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}

export async function resolveCapBytes(): Promise<number> {
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const { quota } = await navigator.storage.estimate();
    if (quota && quota > 0) return Math.min(DEFAULT_CAP_BYTES, Math.floor(quota * 0.5));
  }
  return DEFAULT_CAP_BYTES;
}

// Pure: pick least-recently-viewed WHOLE galleries to evict until total <= cap.
export function selectGalleriesToEvict(saved: SavedGalleryMeta[], capBytes: number): string[] {
  let total = saved.reduce((sum, m) => sum + m.approxBytes, 0);
  if (total <= capBytes) return [];
  const byOldest = [...saved].sort((a, b) => a.lastViewedAt - b.lastViewedAt);
  const evict: string[] = [];
  for (const m of byOldest) {
    if (total <= capBytes) break;
    evict.push(m.slug);
    total -= m.approxBytes;
  }
  return evict;
}

// Side-effecting: enforce the cap by deleting catalog entries + cache buckets.
export async function enforceQuota(deleteBucket: (galleryId: string) => Promise<void>): Promise<void> {
  const saved = await listSaved();
  const cap = await resolveCapBytes();
  for (const slug of selectGalleriesToEvict(saved, cap)) {
    const meta = saved.find((m) => m.slug === slug);
    if (meta) await deleteBucket(meta.galleryId);
    await removeGallery(slug);
  }
}
```

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --dir frontend exec vitest run src/lib/offline/__tests__/storage.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/offline/storage.ts frontend/src/lib/offline/__tests__/storage.test.ts
git commit -m "feat(offline): quota + whole-gallery LRU eviction"
```

---

## Task 5: Service worker — stable offline bucket + token-stripped keys + offline navigation

**Files:**
- Modify: `frontend/public/service-worker.js`
- Test: `frontend/src/components/pwa/__tests__/service-worker-cache-policy.test.ts` (extend existing)

The SW already routes gallery-asset requests to `handleGalleryAsset`. Changes: (a) a stable, version-independent bucket name `rawdrive-offline-<galleryId>`; (b) **normalize the cache key** by stripping `at`, `gs`, `gallery_session`, `token`, `access_token` query params so the rotating SEC-1 `?at=` token no longer fragments the cache; (c) for `/g/{slug}` navigations that fail the network, serve a precached offline boot shell.

- [ ] **Step 1: Extend the cache-policy test (failing)**

In `frontend/src/components/pwa/__tests__/service-worker-cache-policy.test.ts`, add:
```ts
import { normalizeGalleryCacheKey, offlineBucketName } from "../../../../public/service-worker-helpers.js";

describe("offline cache keying", () => {
  it("strips auth tokens from the cache key", () => {
    const a = normalizeGalleryCacheKey("https://x/storage/derivatives/1/display_webp.webp?at=AAA");
    const b = normalizeGalleryCacheKey("https://x/storage/derivatives/1/display_webp.webp?at=BBB");
    expect(a).toBe(b);
    expect(a).not.toContain("at=");
  });
  it("uses a stable, version-independent offline bucket name", () => {
    expect(offlineBucketName("g123")).toBe("rawdrive-offline-g123");
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --dir frontend exec vitest run src/components/pwa/__tests__/service-worker-cache-policy.test.ts`
Expected: FAIL (cannot import helpers).

- [ ] **Step 3: Extract pure helpers (so they're testable) + use them in the SW**

Create `frontend/public/service-worker-helpers.js`:
```js
// Pure helpers shared with unit tests. No SW globals here.
const AUTH_QUERY_PARAMS = ["at", "gs", "gallery_session", "token", "access_token"];

export function normalizeGalleryCacheKey(rawUrl) {
  const url = new URL(rawUrl);
  for (const p of AUTH_QUERY_PARAMS) url.searchParams.delete(p);
  return url.toString();
}

export function offlineBucketName(galleryId) {
  return `rawdrive-offline-${galleryId || "default"}`;
}
```
In `frontend/public/service-worker.js`, near the top add `importScripts` is not used (it's a module-less SW); instead inline-duplicate the two helpers (SW file is loaded as a classic worker and cannot `import`). Define identical `normalizeGalleryCacheKey` and `offlineBucketName` in `service-worker.js`, and change `handleGalleryAsset` to:
```js
async function handleGalleryAsset(request, url) {
  const galleryID = extractGalleryID(url);
  const cacheName = offlineBucketName(galleryID);
  const cache = await caches.open(cacheName);
  const cacheKey = new Request(normalizeGalleryCacheKey(request.url), { method: "GET" });

  let cached = await cache.match(cacheKey);
  if (cached?.type === "opaque" && request.mode !== "no-cors") { await cache.delete(cacheKey); cached = undefined; }

  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type !== "opaque") {
        await cache.put(cacheKey, response.clone());
        await enforceLRUQuota(cacheName);
      }
      return response;
    })
    .catch(() => cached || new Response("", { status: 504 }));

  return cached || refresh;
}
```
Update the `activate` handler's keep-list to also preserve `rawdrive-offline-` buckets, and update `extractGalleryID` only if needed (keep as-is).

> NOTE on duplication: the SW cannot import ES modules, so the two helpers are intentionally duplicated between `service-worker.js` (runtime) and `service-worker-helpers.js` (unit-tested). Keep them byte-identical; the test guards the contract.

- [ ] **Step 4: Add offline navigation for `/g/{slug}`**

In `handleNavigation`, when the network fetch rejects (offline) and `url.pathname.startsWith("/g/")`, respond with the precached offline boot shell `/offline-gallery.html` instead of `/offline.html`. Add `/offline-gallery.html` to `PRECACHE_URLS`. (The shell is created in Task 7.)
```js
async function handleNavigation(request) {
  const url = new URL(request.url);
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    if (url.pathname.startsWith("/g/")) {
      const shell = await cache.match("/offline-gallery.html");
      if (shell) return shell;
    }
    return (await cache.match("/offline.html")) || new Response("offline", { status: 503 });
  }
}
```
Add a `message` handler so the app can ask the SW to delete a bucket (used by eviction/purge):
```js
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "offline:deleteBucket" && data.galleryId) {
    event.waitUntil(caches.delete(offlineBucketName(data.galleryId)));
  }
});
```

- [ ] **Step 5: Run helper test — expect pass**

Run: `pnpm --dir frontend exec vitest run src/components/pwa/__tests__/service-worker-cache-policy.test.ts`
Expected: PASS.

- [ ] **Step 6: Bump SW VERSION + commit**

Bump `VERSION` in `service-worker.js` to `m15-v8` (forces clients to pick up the new SW; offline buckets are version-independent so saved galleries survive).
```bash
git add frontend/public/service-worker.js frontend/public/service-worker-helpers.js frontend/src/components/pwa/__tests__/service-worker-cache-policy.test.ts
git commit -m "feat(offline): SW stable offline bucket, token-stripped keys (SEC-1 fix), offline gallery navigation"
```

---

## Task 6: `offline-sync` — cache-on-view, prefetch, revalidation decisions

**Files:**
- Create: `frontend/src/lib/offline/sync.ts`
- Test: `frontend/src/lib/offline/__tests__/sync.test.ts`

The purge decision is pure and is the security-critical bit; test it in isolation.

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/offline/__tests__/sync.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { purgeDecision } from "../sync";

describe("revalidation purge decision", () => {
  it("purges on definitive access-denied statuses", () => {
    for (const status of [403, 404, 410]) {
      expect(purgeDecision({ ok: false, status })).toBe("purge");
    }
  });
  it("keeps on success", () => {
    expect(purgeDecision({ ok: true, status: 200 })).toBe("keep");
  });
  it("keeps (does NOT purge) on transient/network errors", () => {
    expect(purgeDecision({ ok: false, status: 0 })).toBe("keep");   // network failure
    expect(purgeDecision({ ok: false, status: 500 })).toBe("keep"); // server error
    expect(purgeDecision({ ok: false, status: 503 })).toBe("keep");
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --dir frontend exec vitest run src/lib/offline/__tests__/sync.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sync.ts`**

`frontend/src/lib/offline/sync.ts`:
```ts
import type { Gallery, PublicAsset } from "@/lib/api/galleries";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { galleryKeyId } from "@/lib/media-encryption/media-key-store";
import { variantManifest } from "@/lib/media-encryption/asset-media";
import { saveGalleryMeta, listSaved, removeGallery, markValidated } from "./catalog";
import { requestPersistentStorage, enforceQuota } from "./storage";
import type { SavedAsset, SavedGalleryMeta } from "./types";

// Pure: decide what to do with a saved gallery given a revalidation response.
export function purgeDecision(res: { ok: boolean; status: number }): "purge" | "keep" {
  if (res.ok) return "keep";
  return res.status === 403 || res.status === 404 || res.status === 410 ? "purge" : "keep";
}

function toSavedAsset(a: PublicAsset): SavedAsset {
  const displayKey = a.thumbnail_urls?.["display_webp"] ?? "";
  return {
    id: a.id, filename: a.filename, displayKey,
    thumbnailUrls: a.thumbnail_urls ?? {},
    manifest: variantManifest(a as never, "display_webp"),
    width: a.width, height: a.height, blurhash: a.blurhash,
  };
}

async function deleteBucketViaSW(galleryId: string): Promise<void> {
  const reg = await navigator.serviceWorker?.ready;
  reg?.active?.postMessage({ type: "offline:deleteBucket", galleryId });
}

// Called after an online gallery render. Writes meta + prefetches display bytes.
export async function cacheGalleryForOffline(
  gallery: Gallery, assets: PublicAsset[], ws: string | null, assetAccessToken: string | null,
): Promise<void> {
  if (typeof navigator === "undefined" || !("caches" in self)) return;
  await requestPersistentStorage();
  const isEncrypted = assets.some((a) => a.is_encrypted);
  const savedAssets = assets.map(toSavedAsset);

  const meta: SavedGalleryMeta = {
    slug: gallery.slug, galleryId: gallery.id, ws, title: gallery.title,
    isEncrypted, keyId: isEncrypted ? galleryKeyId(gallery.id) : null,
    assets: savedAssets,
    gallerySettings: (gallery.settings as Record<string, unknown>) ?? {},
    etag: null, expiresAt: gallery.expires_at ?? null,
    lastViewedAt: Date.now(), lastValidatedAt: Date.now(), approxBytes: 0,
  };
  await saveGalleryMeta(meta);

  // Prefetch every display image into the SW-managed bucket (the SW caches on fetch).
  let bytes = 0;
  for (const a of savedAssets) {
    if (!a.displayKey) continue;
    try {
      const res = await fetch(getStorageBackedUrl(a.displayKey, null, assetAccessToken), { credentials: "include" });
      if (res.ok) { const len = Number(res.headers.get("content-length") || 0); bytes += len || 300 * 1024; }
    } catch { /* offline mid-prefetch — keep what we have */ }
  }
  await saveGalleryMeta({ ...meta, approxBytes: bytes });
  await enforceQuota(deleteBucketViaSW);
}

// Called on reconnect. Revalidates each saved gallery; purges revoked.
export async function revalidateSavedGalleries(
  check: (slug: string, ws: string | null) => Promise<{ ok: boolean; status: number; etag: string | null }>,
): Promise<void> {
  for (const meta of await listSaved()) {
    let res: { ok: boolean; status: number; etag: string | null };
    try { res = await check(meta.slug, meta.ws); }
    catch { continue; } // network error → keep
    if (purgeDecision(res) === "purge") {
      await deleteBucketViaSW(meta.galleryId);
      await removeGallery(meta.slug);
    } else if (res.ok) {
      await markValidated(meta.slug, res.etag, Date.now());
    }
  }
}
```
(Verify `Gallery`/`PublicAsset` field names in `frontend/src/lib/api/galleries.ts` — `slug`, `id`, `title`, `settings`, `expires_at`, `thumbnail_urls`, `is_encrypted`, `width`, `height`, `blurhash`. Adjust property accesses to match exactly; do not invent fields.)

- [ ] **Step 4: Run — expect pass**

Run: `pnpm --dir frontend exec vitest run src/lib/offline/__tests__/sync.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --dir frontend exec tsc --noEmit` → exit 0.
```bash
git add frontend/src/lib/offline/sync.ts frontend/src/lib/offline/__tests__/sync.test.ts
git commit -m "feat(offline): cache-on-view + prefetch + reconnect revalidation/purge"
```

---

## Task 7: Offline render — `OfflineGalleryView` + boot shell + SW shell page

**Files:**
- Create: `frontend/src/components/gallery/offline-gallery-view.tsx`
- Create: `frontend/src/app/g/[slug]/offline-boot.tsx` (client)
- Create: `frontend/public/offline-gallery.html` (precached boot shell — minimal HTML that loads the app and routes to the offline view by reading `location.pathname`)
- Test: `frontend/src/components/gallery/__tests__/offline-gallery-view.test.tsx`

`OfflineGalleryView` reads `SavedGalleryMeta` from the catalog by slug and renders the existing `PublicGalleryGrid` with `assets` adapted from `SavedAsset`. It passes `assetAccessToken={null}` and `gallerySessionToken={null}` — images resolve from Cache Storage via the SW (token-stripped keys), and encrypted assets decrypt-on-view through `useDecryptedAssetUrl` with the local key.

- [ ] **Step 1: Write the failing component test**

`frontend/src/components/gallery/__tests__/offline-gallery-view.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineGalleryView } from "../offline-gallery-view";
import { saveGalleryMeta, removeGallery, listSaved } from "@/lib/offline/catalog";
import type { SavedGalleryMeta } from "@/lib/offline/types";

const meta: SavedGalleryMeta = {
  slug: "tey-1", galleryId: "g1", ws: null, title: "Tey Wedding", isEncrypted: false,
  keyId: null, assets: [{ id: "a1", filename: "1.jpg", displayKey: "thumbnails/a1/display_webp.webp", thumbnailUrls: { display_webp: "thumbnails/a1/display_webp.webp" }, manifest: null }],
  gallerySettings: {}, etag: null, expiresAt: null, lastViewedAt: 1, lastValidatedAt: 1, approxBytes: 1,
};

describe("OfflineGalleryView", () => {
  beforeEach(async () => { for (const m of await listSaved()) await removeGallery(m.slug); });

  it("renders the saved gallery title from the catalog", async () => {
    await saveGalleryMeta(meta);
    render(<OfflineGalleryView slug="tey-1" />);
    expect(await screen.findByText("Tey Wedding")).toBeInTheDocument();
  });

  it("shows a not-saved message for an unknown slug", async () => {
    render(<OfflineGalleryView slug="nope" />);
    expect(await screen.findByText(/isn't saved for offline/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `pnpm --dir frontend exec vitest run src/components/gallery/__tests__/offline-gallery-view.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `OfflineGalleryView`**

`frontend/src/components/gallery/offline-gallery-view.tsx` (named export, `"use client"`):
```tsx
"use client";
import { useEffect, useState } from "react";
import { getGalleryMeta, touchViewed } from "@/lib/offline/catalog";
import type { SavedGalleryMeta, SavedAsset } from "@/lib/offline/types";
import { PublicGalleryGrid } from "./public-gallery-grid";
import type { PublicAsset } from "@/lib/api/galleries";

function toPublicAsset(a: SavedAsset): PublicAsset {
  return {
    id: a.id, filename: a.filename, content_type: "image/webp",
    width: a.width, height: a.height, blurhash: a.blurhash,
    thumbnail_urls: a.thumbnailUrls, is_encrypted: !!a.manifest,
    media_encryption: a.manifest as never,
  } as PublicAsset;
}

export function OfflineGalleryView({ slug }: { slug: string }) {
  const [meta, setMeta] = useState<SavedGalleryMeta | null | "loading">("loading");
  useEffect(() => {
    let cancelled = false;
    getGalleryMeta(slug).then((m) => { if (!cancelled) { setMeta(m); if (m) void touchViewed(slug, Date.now()); } });
    return () => { cancelled = true; };
  }, [slug]);

  if (meta === "loading") return <div className="p-8 text-text-secondary">Loading saved gallery…</div>;
  if (!meta) return <div className="p-8 text-text-secondary">This gallery isn&apos;t saved for offline viewing. Reconnect to load it.</div>;

  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 py-4">
        <span className="rounded-full bg-surface-container-low px-3 py-1 text-xs text-text-secondary">Offline · saved copy</span>
        <h1 className="mt-2 text-2xl font-semibold text-text-primary">{meta.title}</h1>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <PublicGalleryGrid
          slug={meta.slug}
          assets={meta.assets.map(toPublicAsset)}
          galleryType={(meta.gallerySettings["gallery_type"] as string) ?? "proofing"}
          maxSelections={0}
          downloadEnabled={false}
          gallerySessionToken={null}
          assetAccessToken={null}
          workspaceScope={meta.ws}
        />
      </div>
    </div>
  );
}
```
(Match `PublicGalleryGrid`'s required props exactly — read its `Props` type and supply the minimum; `downloadEnabled={false}` since offline is read-only and downloads need network. Use only semantic token classes.)

- [ ] **Step 4: Run component test — expect pass**

Run: `pnpm --dir frontend exec vitest run src/components/gallery/__tests__/offline-gallery-view.test.tsx`
Expected: 2 passed. (If `PublicGalleryGrid` pulls browser-only deps, mock them in the test or render a thin wrapper; keep the assertions on title + not-saved message.)

- [ ] **Step 5: Boot shell + route wiring**

Create `frontend/src/app/g/[slug]/offline-boot.tsx` (client) that reads the slug and renders `OfflineGalleryView`. Create `frontend/public/offline-gallery.html` — a minimal precached document that boots the Next client and mounts the offline view based on `location.pathname` (`/g/<slug>`). Wire so that when the SW serves `offline-gallery.html` for a `/g/{slug}` navigation, the client mounts `OfflineGalleryView slug={parsedSlug}`. Keep this shell tiny and dependency-light.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/gallery/offline-gallery-view.tsx frontend/src/app/g/[slug]/offline-boot.tsx frontend/public/offline-gallery.html frontend/src/components/gallery/__tests__/offline-gallery-view.test.tsx
git commit -m "feat(offline): OfflineGalleryView + offline boot shell"
```

---

## Task 8: Wire cache-on-view into the live gallery page + reconnect revalidation

**Files:**
- Create: `frontend/src/components/offline/offline-cacher.tsx` (client, fire-and-forget)
- Modify: `frontend/src/app/g/[slug]/page.tsx` (render `<OfflineCacher .../>` with the gallery + assets + token)
- Create: `frontend/src/components/offline/offline-revalidator.tsx` (client, mounted in `/g` layout; listens for `online`)

- [ ] **Step 1: OfflineCacher (client)**

`frontend/src/components/offline/offline-cacher.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import type { Gallery, PublicAsset } from "@/lib/api/galleries";
import { cacheGalleryForOffline } from "@/lib/offline/sync";

export function OfflineCacher(props: { gallery: Gallery; assets: PublicAsset[]; ws: string | null; assetAccessToken: string | null }) {
  useEffect(() => {
    void cacheGalleryForOffline(props.gallery, props.assets, props.ws, props.assetAccessToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.gallery?.id]);
  return null;
}
```

- [ ] **Step 2: Render it from the gallery page**

In `frontend/src/app/g/[slug]/page.tsx`, after the existing render tree (near the grid), add:
```tsx
<OfflineCacher gallery={gallery} assets={assets} ws={ws ?? null} assetAccessToken={assetAccessToken} />
```
(`assetAccessToken` already exists in that file from SEC-1. Import `OfflineCacher`.)

- [ ] **Step 3: OfflineRevalidator (client) in the `/g` layout**

`frontend/src/components/offline/offline-revalidator.tsx`:
```tsx
"use client";
import { useEffect } from "react";
import { revalidateSavedGalleries } from "@/lib/offline/sync";
import { withWorkspaceScope } from "@/lib/api/galleries"; // if not exported, build the path inline

export function OfflineRevalidator() {
  useEffect(() => {
    const run = () => void revalidateSavedGalleries(async (slug, ws) => {
      const path = ws ? `/api/v1/public/galleries/${slug}?ws=${encodeURIComponent(ws)}` : `/api/v1/public/galleries/${slug}`;
      try {
        const res = await fetch(path, { credentials: "include" });
        return { ok: res.ok, status: res.status, etag: res.headers.get("etag") };
      } catch { return { ok: false, status: 0, etag: null }; }
    });
    window.addEventListener("online", run);
    if (navigator.onLine) run();
    return () => window.removeEventListener("online", run);
  }, []);
  return null;
}
```
Mount `<OfflineRevalidator />` in `frontend/src/app/g/[slug]/layout.tsx` (the SW-registering layout).

- [ ] **Step 4: Build + lint**

Run: `pnpm --dir frontend exec tsc --noEmit` → 0; `pnpm --dir frontend run lint` → 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/offline/ frontend/src/app/g/[slug]/page.tsx frontend/src/app/g/[slug]/layout.tsx
git commit -m "feat(offline): auto-cache on view + reconnect revalidation wiring"
```

---

## Task 9: "Manage offline storage" view

**Files:**
- Create: `frontend/src/components/offline/manage-offline-storage.tsx`
- Test: `frontend/src/components/offline/__tests__/manage-offline-storage.test.tsx`

A list of saved galleries (title, size, last viewed) with a per-row Remove (uses `removeGallery` + SW `offline:deleteBucket`) and total usage from `navigator.storage.estimate()`. Reached from the public gallery overflow menu. Use `GlassIconButton` + semantic tokens.

- [ ] **Step 1: Failing test** — render with two seeded catalog entries, assert both titles show and clicking Remove drops one (assert `listSaved()` length goes 2→1). [Provide the full test mirroring Task 7's seeding pattern.]
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** the component (named export, `"use client"`): `listSaved()` on mount, render rows with `formatBytes(approxBytes)` + `new Date(lastViewedAt)`, a `GlassIconButton label="Remove offline copy" variant="danger"` per row calling `removeGallery(slug)` + posting `offline:deleteBucket`. Show total used via `navigator.storage.estimate()`.
- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Commit** `feat(offline): manage offline storage view`.

---

## Task 10: Backend — ETag on the public gallery response

**Files:**
- Modify: `backend/internal/handler/public_gallery_handler.go` (`GetBySlug`, before the final `respondJSON`)
- Test: `backend/internal/handler/public_gallery_etag_test.go`

The ETag is a cheap content/version fingerprint enabling reconnect revalidation to say "unchanged" without re-downloading. Derive it from a stable gallery signature (e.g., `gallery.UpdatedAt` + asset count) — do NOT include the rotating `asset_access_token`.

- [ ] **Step 1: Failing test** — `GetBySlug` for an accessible gallery sets a non-empty `ETag` header and it is stable across two calls for unchanged data. [Use the existing public-gallery handler test harness/seed helpers; mirror an existing `*_handler_test.go` in this package.]
- [ ] **Step 2: Run — fails** (`go test ./internal/handler/ -run TestGetBySlug_ETag -count=1`).
- [ ] **Step 3: Implement** — before `respondJSON(w, http.StatusOK, gallery)`, compute `etag := fmt.Sprintf("\"g-%s-%d-%d\"", gallery.ID, gallery.UpdatedAt.Unix(), len(galleryAssets))` (omit `asset_access_token`), `w.Header().Set("ETag", etag)`. Verify `gallery.UpdatedAt` exists; otherwise use a hash of the rendered settings minus the token.
- [ ] **Step 4: Run — passes;** then `go build ./... && go vet ./internal/handler/`.
- [ ] **Step 5: Commit** `feat(offline): ETag on public gallery response for cheap revalidation`.

---

## Task 11: E2E — offline viewing + revocation purge (Playwright in Docker)

**Files:**
- Create: `e2e/offline-gallery.spec.ts`

Use `tests/photos/` assets and `storageState`/`addInitScript` for any auth (no UI login), per `frontend/AGENTS.md`. Run inside the Docker `playwright` service.

- [ ] **Step 1: Write the spec**
  - Seed/serve a published gallery with a few assets (reuse existing E2E seed helpers if present).
  - Visit `/g/{slug}` online; wait for images to load; assert the catalog has the gallery (`page.evaluate` reading IndexedDB) and image requests to `/storage/...` returned 200.
  - `context.setOffline(true)`; reload `/g/{slug}`; assert the grid renders and at least one `<img>` has natural width > 0 (served from cache).
  - Revocation: unpublish/expire the gallery (DB or API); `context.setOffline(false)`; trigger revalidation (reload or dispatch `online`); assert the catalog entry + cache bucket are gone (`page.evaluate`).
  - Encrypted variant: repeat for an E2EE gallery, asserting the image renders offline (decrypt-on-view) and bytes in cache are the `.enc` ciphertext.
- [ ] **Step 2: Run** `docker compose run --rm playwright npx playwright test offline-gallery.spec.ts`. Expected: pass.
- [ ] **Step 3: Commit** `test(offline): e2e offline viewing + revocation purge`.

---

## Task 12: Final integration check + PR

- [ ] Run full FE suite: `pnpm --dir frontend run test` → green; `pnpm --dir frontend run lint` → 0; `pnpm --dir frontend exec tsc --noEmit` → 0.
- [ ] Run backend: `(cd backend && go build ./... && go vet ./... && go test ./internal/handler/ -count=1)` → green.
- [ ] Manual smoke (dev stack rebuilt): view a gallery, DevTools → Application → IndexedDB shows `rawdrive-offline`, Cache Storage shows `rawdrive-offline-<id>`; go offline; reload; gallery renders.
- [ ] Open PR `feat/offline-gallery-viewing` → main with the spec linked. Do NOT merge without the manual offline smoke + a reviewer.
- [ ] Commit any final docs.

---

## Self-review notes (author)
- **Spec coverage:** auto-cache-on-view (T6/T8), display-quality only (T6 `toSavedAsset` uses `display_webp`), encrypted-at-rest decrypt-on-view (T7 reuses `useDecryptedAssetUrl`, bytes cached as `.enc`), purge-on-reconnect (T6 `purgeDecision` + T8 revalidator), Cache Storage bytes + IDB catalog (T3/T5), quota + whole-gallery LRU (T4), manage UI (T9), SEC-1 cache-key fix (T5), backend ETag (T10), E2E incl. encrypted + revocation (T11). All covered.
- **Token consistency:** `cacheGalleryForOffline`, `revalidateSavedGalleries`, `purgeDecision`, `selectGalleriesToEvict`, `enforceQuota`, `saveGalleryMeta`/`getGalleryMeta`/`listSaved`/`removeGallery`/`markValidated`/`touchViewed`, `normalizeGalleryCacheKey`/`offlineBucketName` — names used consistently across tasks.
- **Known verification points for the implementer (not placeholders):** confirm exact `Gallery`/`PublicAsset`/`PublicGalleryGrid Props` field names in `frontend/src/lib/api/galleries.ts` + `public-gallery-grid.tsx`, and `gallery.UpdatedAt` in the Go model, before finalizing T6/T7/T10. These are real types in the repo; match them exactly rather than inventing fields.
