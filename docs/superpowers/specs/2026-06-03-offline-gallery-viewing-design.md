# Offline Gallery Viewing for Clients — Design

**Date:** 2026-06-03
**Status:** Design (awaiting approval)
**Branch:** `feat/offline-gallery-viewing`

## Context & goal

RawDrive is a Next.js 15 PWA + Go API. Clients receive photography galleries at
`/g/{slug}`. Today there is an *opportunistic* service-worker cache
(`frontend/public/service-worker.js`: a per-gallery LRU image bucket + an
`offline.html` fallback) but **no real offline-viewing feature**: the gallery
page is server-rendered (won't cold-load offline), the cache is small and
deploy-versioned, and the just-shipped SEC-1 change made image URLs carry a
**rotating `?at=` token** that defeats the URL-keyed cache.

**Goal:** let a client **browse a delivered gallery with zero connectivity** and
keep it as a **durable keepsake** that survives app restarts.

### Decisions locked in (with the user)
| Decision | Choice |
|---|---|
| Primary use case | Client browses offline **and** durable keepsake |
| Offline quality | **Display quality** (`display_webp`, ~2400px) — not originals |
| Trigger | **Automatic on view** — every gallery the client opens is saved |
| Encrypted galleries | **Store encrypted (`.enc`) at rest, decrypt on view** with the locally-stored gallery key |
| Revocation | **Purge on reconnect** — if the gallery is later expired/unpublished/revoked/deleted, wipe the local copy on next online check (DPDP/GDPR-aware) |
| Architecture | **Hybrid (C):** Cache Storage for bytes + IndexedDB for the structured catalog |

### Non-goals (YAGNI)
- Storing **originals** offline (display quality only).
- An explicit "Download" button (caching is automatic on view).
- Offline **mutations** (favorites/proofing submit) — those stay online-only; offline is **read-only** browsing.
- Offline support for galleries the client **never opened online** (nothing to serve).

## Architecture

Six well-bounded units. Backend impact is one optional ETag header; everything
else is frontend.

```
View online  ─▶ SW caches display bytes ─▶ Cache Storage  (rawdrive-offline-<galleryId>)
             └▶ offline-sync writes meta ─▶ IndexedDB      (rawdrive-offline / galleries store)
Offline nav  ─▶ SW serves render-shell  ─▶ OfflineGalleryView reads IDB + Cache, decrypts on view
Reconnect    ─▶ offline-sync revalidates each saved gallery ─▶ purge if 404/410/403
```

### Units & interfaces
1. **`lib/offline/catalog.ts` (IndexedDB data layer).** Pure storage, no network/UI.
   - `saveGalleryMeta(meta)`, `getGalleryMeta(slug)`, `listSaved()`, `removeGallery(slug)`, `markValidated(slug, etag)`, `touchViewed(slug)`.
2. **Service worker (extend `public/service-worker.js`).** Caches display-image byte responses into a **stable, version-independent** per-gallery bucket `rawdrive-offline-<galleryId>`; serves them offline; LRU within a gallery. **SEC-1 fix:** normalize `?at=`/`?gs=`/`token` out of the cache key. Serves an offline **render-shell** for `/g/{slug}` navigations when the network is unreachable.
3. **`lib/offline/sync.ts` (orchestrator).** After an online render: write the catalog entry, request `navigator.storage.persist()`, and **prefetch every display image** of the gallery into the byte cache (so the *whole* gallery is offline, not just scrolled photos). On reconnect: revalidate + purge.
4. **`OfflineGalleryView` (client component).** Rendered by the offline shell. Reads the catalog for the slug and renders the **existing** `public-gallery-grid` from the saved asset list; images resolve from Cache Storage; encrypted bytes decrypt-on-view via the **existing `useDecryptedAssetUrl`** + local key. Online path (`/g/[slug]/page.tsx`) is unchanged.
5. **`lib/offline/storage.ts` (quota & eviction).** `navigator.storage.persist()` + `estimate()`; a total cap; **whole-gallery LRU eviction** (evict the least-recently-viewed *entire* gallery — never partially, to keep keepsake integrity); powers the manage-storage view.
6. **Backend (minimal).** Revalidation reuses `GET /api/v1/public/galleries/{slug}` (status `404`/`410`/`403` ⇒ purge). Add an **`ETag`/`version`** to that response so we can cheaply detect "still valid" vs "changed" without re-downloading (enables future auto-refresh; Phase 1 only uses it for cheap revalidation).

**Boundaries:** Cache Storage = bytes; IndexedDB = structured metadata; sync = orchestration; render = presentation; storage = quota. Each is independently testable; the decrypt path and the per-gallery SW bucket are reused, not reinvented.

## Data model

**IndexedDB** `rawdrive-offline` (v1), object store `galleries` (keyPath `slug`),
index `byLastViewed` on `lastViewedAt`:
```ts
type SavedGalleryMeta = {
  slug: string;             // /g/{slug}
  galleryId: string;        // for the Cache Storage bucket name
  ws: string | null;        // workspace subdomain scope (?ws=)
  title: string;
  isEncrypted: boolean;
  keyId?: string;           // media-key-store keyId for decrypt-on-view
  assets: Array<{
    id: string;
    filename: string;
    displayKey: string;     // storage key of display_webp(.enc)
    manifest?: unknown;     // per-asset decrypt manifest (encrypted galleries)
    width?: number; height?: number; blurhash?: string;
  }>;
  gallerySettings: Record<string, unknown>; // render-needed subset (cover, design, watermark)
  etag?: string;            // from the gallery API response
  expiresAt?: string | null;
  lastViewedAt: number;
  lastValidatedAt: number;
  approxBytes: number;      // for quota accounting
};
```
**Cache Storage** bucket per gallery: `rawdrive-offline-<galleryId>` (stable across
deploys — distinct from the existing deploy-versioned resilience cache, which is
left as-is). Entries keyed by **normalized** display-image URL (auth query params
stripped). `asset_access_token` is **never** persisted.

## Flows

**Auto-cache on view (online).** SSR loads the gallery as today → the client grid
fetches display images → the SW writes each response into
`rawdrive-offline-<galleryId>` (normalized key, stale-while-revalidate). After
first render, `offline-sync` writes the catalog meta, calls `persist()`, and
prefetches any not-yet-fetched display images so the full gallery is saved. Then
runs eviction if over the total cap.

**Offline render.** Client offline navigates to `/g/{slug}` → SW navigation
handler: network fails → serve the precached **offline render-shell** instead of
generic `offline.html`. The shell boots `OfflineGalleryView`, which reads the
catalog by slug and renders `public-gallery-grid`; images come from Cache Storage;
encrypted bytes decrypt-on-view with the local key. If the slug isn't in the
catalog → show "This gallery isn't saved for offline viewing."

**Revocation / revalidation (reconnect).** On the `online` event (and on app
focus while online), `offline-sync` iterates `listSaved()` and calls the gallery
endpoint with the stored session:
- `404`/`410`/`403` (deleted/expired/unpublished/revoked) ⇒ `removeGallery` (drop the IDB entry **and** delete the Cache Storage bucket).
- `200` ⇒ `markValidated`; if `ETag` changed, refresh meta + changed images (Phase 2 may extend this).
- Network/5xx (transient) ⇒ **do nothing** (never purge on a flaky connection — only definitive access-denied statuses purge).

## Quota, eviction & UX
- `navigator.storage.persist()` requested on first save (best-effort; granted more readily for installed PWAs).
- Total cap (config, default the lesser of ~2 GB or 50% of `estimate().quota`). Over cap ⇒ evict whole least-recently-viewed galleries until under budget.
- **Manage offline storage** view (reached from the gallery overflow menu and a `/g`-scoped settings affordance): list saved galleries (title, size, last viewed) + per-gallery **Remove** + total used / available. Uses semantic design tokens + `GlassIconButton` per project UI rules.
- **Indicators:** an "Available offline" chip on a saved gallery; an "Offline" badge when viewing from cache.

## Error handling
- Storage full / `persist()` denied ⇒ cache what fits, surface a non-blocking "couldn't fully save offline" notice; **never** block online viewing.
- Decrypt failure offline (missing/mismatched key) ⇒ reuse the existing `MEDIA_KEY_UNAVAILABLE_MESSAGE`.
- `estimate()` unavailable ⇒ fall back to the SW's existing entry/byte heuristics.
- Slug not in catalog offline ⇒ "not saved for offline" message (not a crash).
- Revalidation transient errors ⇒ keep the copy (purge only on 404/410/403).

## Testing
- **Unit (vitest):** `catalog` (fake-indexeddb), `storage` eviction (whole-gallery LRU), SW cache-key normalization (extend the existing `service-worker-cache-policy.test.ts`), `sync` revalidation decisions (purge ONLY on 404/410/403; never on transient).
- **Component:** `OfflineGalleryView` renders the grid from a seeded catalog; encrypted path decrypts a cached `.enc` blob with a local key.
- **E2E (Playwright in Docker, `tests/photos/` assets):** view a gallery online → `context.setOffline(true)` → reload `/g/{slug}` → grid + images render from cache; then revoke/unpublish the gallery → back online → confirm the local copy is purged. Encrypted-gallery variant included.

## Phasing
- **Phase 1 (this spec):** auto-cache-on-view, full-gallery prefetch, offline render, decrypt-on-view, SEC-1 cache-key fix, purge-on-reconnect revocation, quota + whole-gallery LRU, manage-storage view, indicators.
- **Phase 2 (later):** ETag-driven auto-refresh of changed saved galleries; optional per-gallery "keep offline" pin that is exempt from LRU eviction.

## Security & privacy notes
- E2EE galleries remain **encrypted at rest** on device (decrypt-on-view).
- `asset_access_token` / session tokens are **never** written to IndexedDB or used in cache keys.
- Purge-on-reconnect honors photographer revocation + DPDP/GDPR erasure for reconnected devices. (A device kept permanently offline cannot be reached — an inherent limit of any offline feature; documented, not solvable.)
