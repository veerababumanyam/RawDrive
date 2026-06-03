// @ts-check
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Offline gallery viewing — Task 11 E2E.
 *
 * Exercises the "offline-gallery-viewing" feature end-to-end:
 *   1. Online view of a delivered gallery at /g/{slug} caches display bytes into
 *      the stable Cache Storage bucket `rawdrive-offline-<galleryId>` and writes
 *      a catalog row to IndexedDB (DB `rawdrive-offline`, store `galleries`,
 *      keyPath `slug`). [frontend/src/components/offline/offline-cacher.tsx,
 *      frontend/src/lib/offline/sync.ts::cacheGalleryForOffline,
 *      frontend/src/lib/offline/cache-keys.ts::offlineBucketName,
 *      frontend/src/lib/offline/catalog.ts]
 *   2. Offline reload — the service worker prefers the cached Next app document
 *      for /g/ navigations (frontend/public/service-worker.js::handleNavigation),
 *      so the React app boots and renders <OfflineGalleryView/> →
 *      PublicGalleryGrid from the IDB catalog + Cache Storage. The vanilla
 *      /offline-gallery.html shell is the cold-boot fallback only.
 *      [frontend/src/components/gallery/public-gallery-offline-gate.tsx,
 *      frontend/src/components/gallery/offline-gallery-view.tsx]
 *   3. On reconnect, OfflineRevalidator re-checks each saved gallery against
 *      GET /api/v1/public/galleries/{slug} and PURGES the local copy ONLY on
 *      403/404/410 (never on transient errors).
 *      [frontend/src/app/g/[slug]/layout.tsx mounts
 *      frontend/src/components/offline/offline-revalidator.tsx →
 *      frontend/src/lib/offline/sync.ts::revalidateSavedGalleries +
 *      ::purgeDecision]
 *   4. Encrypted galleries are stored .enc at rest. The React renderer DECRYPTS
 *      them offline cache-first via useDecryptedAssetUrl using the
 *      localStorage-persisted gallery media key, so the decrypted tiles render
 *      (blob: <img> srcs) — the "open online" message is now only the cold-boot
 *      shell fallback. [frontend/src/lib/media-encryption/use-decrypted-asset-url.ts]
 *
 * SELF-SEEDING + CI-SAFETY: beforeAll seeds a real gallery via the API (login →
 * create → upload tests/photos assets → link → publish public). If ANY step
 * fails or the stack/fixtures are absent, the whole suite `test.skip`s with a
 * clear reason so CI never false-fails without a running feature-branch stack.
 * Live execution is the manual smoke gate for the PR (see the report / commit
 * body for the exact Docker invocation + env vars).
 *
 * Auth is injected via the API + cookies/addInitScript — there is NO UI login
 * (project E2E rule). The public viewer authorizes via the SameSite gallery
 * session cookie [frontend/src/app/g/[slug]/page.tsx line ~67]; a published
 * gallery whose access_mode is "public" needs no session at all
 * [backend/internal/handler/public_gallery_handler.go::GetBySlug line ~760].
 */

// ── Constants ───────────────────────────────────────────────────────────────

// App origin (Next.js). playwright.config.js baseURL defaults to :8229.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8229";
// Go API base. m13 spec uses host.docker.internal:8080 when run inside the
// Docker playwright service; falls back to localhost:8080 on the host.
const API_BASE = process.env.PLAYWRIGHT_API_URL || "http://host.docker.internal:8080";

// Seeded superadmin (backend/seeds). Mirrors m13-gallery-viewer-proofing.spec.js.
const SEED_EMAIL = process.env.E2E_TEST_EMAIL || "superadmin@rawdrive.test";
const SEED_PASSWORD = process.env.E2E_TEST_PASSWORD || "SuperAdmin123!";

// Canonical wedding fixtures. The filename WITH spaces+parens is intentional —
// tests must handle it (project rule). tests/photos/ is gitignored, so it is
// only present where ops materialize it (mounted into the Docker playwright
// service). Resolved relative to process.cwd(), exactly like e2ee-media-upload.
const FIXTURE_RELATIVE_PATHS = [
  "../tests/photos/Wedding (42).jpg",
  "../tests/photos/veera.jpg",
  "../tests/photos/Wedding (44).jpg",
];

const READY_POLL_TIMEOUT_MS = 90_000;
const ASYNC_ASSERT_TIMEOUT_MS = 30_000;
const STEP_TIMEOUT_MS = 15_000;

// ── Seeding state (populated by beforeAll, read by tests) ────────────────────

type SeedResult = {
  galleryId: string;
  slug: string;
  primaryFilename: string;
  assetFilenames: string[];
};

let seed: SeedResult | null = null;
let encryptedSeed: { galleryId: string; slug: string } | null = null;
let skipReason: string | null = null;

// ── Low-level API helpers (all server-to-server fetch, no UI) ────────────────

async function login(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("login returned no access_token");
  return data.access_token;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function createGallery(token: string, title: string): Promise<{ id: string; slug: string }> {
  // POST /api/v1/galleries — handler reads {title, gallery_type}; gallery_type
  // "delivery" matches the offline-viewing surface (vs "proofing").
  // [backend/internal/handler/gallery_handler.go::Create line ~144]
  const res = await fetch(`${API_BASE}/api/v1/galleries`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ title, gallery_type: "delivery" }),
  });
  if (res.status !== 201) throw new Error(`create gallery failed: ${res.status}`);
  const g = (await res.json()) as { id: string; slug: string };
  if (!g.id || !g.slug) throw new Error("create gallery returned no id/slug");
  return { id: g.id, slug: g.slug };
}

async function uploadAsset(token: string, filePath: string): Promise<string> {
  // POST /api/v1/assets — multipart, field name "file". Returns the created
  // asset (status starts non-ready; WebP derivatives generated async).
  // [backend/internal/handler/asset_handler.go::Upload line ~109/177/214]
  const bytes = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/jpeg" }), filename);
  const res = await fetch(`${API_BASE}/api/v1/assets`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }, // let fetch set multipart boundary
    body: form,
  });
  if (res.status !== 201) throw new Error(`upload asset (${filename}) failed: ${res.status}`);
  // POST /api/v1/assets serializes Go's service.UploadResult
  // (backend/internal/service/upload_service.go lines 57-62) via a plain
  // json.NewEncoder().Encode (asset_handler.go line 214/335). UploadResult has
  // NO json tags and no MarshalJSON, so the 201 body is
  // {"Asset":{"id":...},"StorageKey":...,"SHA256":...} — the asset id lives at
  // body.Asset.id (the embedded repository.Asset carries the `json:"id"` tag),
  // NOT a top-level `id`.
  const body = (await res.json()) as { Asset?: { id?: string } };
  const assetId = body.Asset?.id;
  if (!assetId) throw new Error(`upload asset (${filename}) returned no Asset.id`);
  return assetId;
}

async function linkAssetToGallery(
  token: string,
  galleryId: string,
  assetId: string,
  sortOrder: number,
): Promise<void> {
  // POST /api/v1/galleries/{id}/assets {asset_id, sort_order} → 201
  // [backend/internal/handler/gallery_handler.go::AddAsset line ~694]
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/assets`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ asset_id: assetId, sort_order: sortOrder }),
  });
  if (res.status !== 201) throw new Error(`link asset failed: ${res.status}`);
}

async function waitForDerivatives(token: string, assetId: string): Promise<void> {
  // Poll GET /api/v1/assets/{id} until status === "ready" and a display_webp
  // derivative exists — the offline cacher needs the display_webp storage key.
  const deadline = Date.now() + READY_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/api/v1/assets/${assetId}`, { headers: authHeaders(token) });
    if (res.ok) {
      const a = (await res.json()) as {
        status?: string;
        thumbnail_urls?: Record<string, string> | null;
      };
      const thumbs = a.thumbnail_urls ?? {};
      // The offline cacher specifically reads thumbnail_urls.display_webp
      // (frontend/src/lib/offline/sync.ts line 18) — that is the variant whose
      // bytes get persisted into the offline Cache Storage bucket. Gate readiness
      // on display_webp itself, not just any *_webp derivative.
      if (a.status === "ready" && thumbs.display_webp) return;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`asset ${assetId} did not reach ready+derivatives within ${READY_POLL_TIMEOUT_MS}ms`);
}

async function setAccessModePublic(token: string, galleryId: string): Promise<void> {
  // New galleries default to access_mode "private"
  // [backend migration 041_m13_gallery_viewer_proofing.up.sql line 102]. A
  // public/published gallery is viewable at /g/{slug} with NO session.
  // PATCH /api/v1/galleries/{id}/access-mode {access_mode}
  // [backend/internal/handler/gallery_access_handler.go::SetAccessMode line ~112;
  //  routes_m2.go line 194]
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}/access-mode`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ access_mode: "public" }),
  });
  if (!res.ok) throw new Error(`set access-mode public failed: ${res.status}`);
}

async function setPublished(token: string, galleryId: string, published: boolean): Promise<void> {
  // PUT /api/v1/galleries/{id} {is_published} — the Update handler reads the
  // is_published key. Unpublishing makes the public GetBySlug return 404
  // (the revocation signal the offline revalidator purges on).
  // [backend/internal/handler/gallery_handler.go::Update line ~291/327;
  //  public_gallery_handler.go::GetBySlug line ~733 returns 404 when !IsPublished]
  const res = await fetch(`${API_BASE}/api/v1/galleries/${galleryId}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ is_published: published }),
  });
  if (!res.ok) throw new Error(`set is_published=${published} failed: ${res.status}`);
}

async function publicGalleryStatus(slug: string): Promise<number> {
  // GET /api/v1/public/galleries/{slug} — the revalidation endpoint.
  // [backend routes_m2.go line 425]
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/galleries/${encodeURIComponent(slug)}`);
    return res.status;
  } catch {
    return 0;
  }
}

function resolveFixtures(count: number): string[] {
  const resolved: string[] = [];
  for (const rel of FIXTURE_RELATIVE_PATHS) {
    const abs = path.resolve(process.cwd(), rel);
    if (fs.existsSync(abs)) resolved.push(abs);
    if (resolved.length >= count) break;
  }
  return resolved;
}

// ── Browser-side helpers (run via page.evaluate, in the page realm) ──────────

// Returns the list of Cache Storage bucket names that start with the given prefix.
async function cacheBucketNames(page: Page, prefix: string): Promise<string[]> {
  return page.evaluate(async (p) => {
    if (typeof caches === "undefined") return [];
    const keys = await caches.keys();
    return keys.filter((k) => k.startsWith(p));
  }, prefix);
}

// Returns true when the IndexedDB catalog has an entry for the slug.
async function idbHasSlug(page: Page, slug: string): Promise<boolean> {
  return page.evaluate(async (s) => {
    if (typeof indexedDB === "undefined") return false;
    return new Promise<boolean>((resolve) => {
      const req = indexedDB.open("rawdrive-offline", 1);
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("galleries")) {
          db.close();
          resolve(false);
          return;
        }
        const tx = db.transaction("galleries", "readonly");
        const get = tx.objectStore("galleries").get(s);
        get.onsuccess = () => {
          db.close();
          resolve(get.result != null);
        };
        get.onerror = () => {
          db.close();
          resolve(false);
        };
      };
      // If the DB doesn't exist yet, onupgradeneeded creates an empty store →
      // get returns undefined → false. That is the correct "not saved" answer.
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("galleries")) {
          db.createObjectStore("galleries", { keyPath: "slug" });
        }
      };
    });
  }, slug);
}

// Wait until the service worker controls the page, so the navigation handler
// (which serves offline-gallery.html for /g/ when offline) is active.
async function waitForServiceWorker(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      return !!reg.active;
    } catch {
      return false;
    }
  });
}

// ── beforeAll: resilient self-seed ───────────────────────────────────────────

test.beforeAll(async () => {
  try {
    const fixtures = resolveFixtures(2);
    if (fixtures.length < 1) {
      skipReason = `tests/photos fixtures not found at process.cwd()=${process.cwd()} (gitignored; mount them into the playwright service)`;
      return;
    }

    const token = await login();

    // Non-encrypted delivery gallery.
    const stamp = Date.now();
    const created = await createGallery(token, `Offline E2E ${stamp}`);
    const assetFilenames: string[] = [];
    let sortOrder = 0;
    for (const fixture of fixtures) {
      const assetId = await uploadAsset(token, fixture);
      await waitForDerivatives(token, assetId);
      await linkAssetToGallery(token, created.id, assetId, sortOrder++);
      assetFilenames.push(path.basename(fixture));
    }
    await setAccessModePublic(token, created.id);
    await setPublished(token, created.id, true);

    seed = {
      galleryId: created.id,
      slug: created.slug,
      primaryFilename: assetFilenames[0],
      assetFilenames,
    };

    // Locate (best-effort) an encrypted gallery for the encrypted-variant test.
    // The plain delivery seed above is NOT encrypted, so we look for any
    // existing encrypted+published+public gallery the seeded user can see. When
    // none exists, the encrypted test self-skips (documented in that test).
    encryptedSeed = await findEncryptedPublicGallery(token);
  } catch (err) {
    skipReason = `offline E2E requires a running feature-branch stack + seeded gallery: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
});

// Best-effort discovery of an encrypted, published, public gallery via the
// authenticated list endpoint. Returns null when none is available.
async function findEncryptedPublicGallery(
  token: string,
): Promise<{ galleryId: string; slug: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/galleries?status=active`, {
      headers: authHeaders(token),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as unknown;
    const list: Array<Record<string, unknown>> = Array.isArray(body)
      ? (body as Array<Record<string, unknown>>)
      : Array.isArray((body as { data?: unknown }).data)
        ? ((body as { data: Array<Record<string, unknown>> }).data)
        : [];
    for (const g of list) {
      const slug = typeof g.slug === "string" ? g.slug : null;
      const id = typeof g.id === "string" ? g.id : null;
      const published = g.is_published === true;
      if (!slug || !id || !published) continue;
      // Confirm via the public assets endpoint that at least one asset is
      // encrypted and the gallery is reachable publicly (status 200).
      const status = await publicGalleryStatus(slug);
      if (status !== 200) continue;
      const assetsRes = await fetch(
        `${API_BASE}/api/v1/public/galleries/${encodeURIComponent(slug)}/assets`,
      );
      if (!assetsRes.ok) continue;
      const assets = (await assetsRes.json()) as Array<{ is_encrypted?: boolean }>;
      if (Array.isArray(assets) && assets.some((a) => a.is_encrypted)) {
        return { galleryId: id, slug };
      }
    }
  } catch {
    /* fall through to null */
  }
  return null;
}

// ── Test 1: renders offline from cache after an online view (non-encrypted) ──

test.describe("offline gallery viewing", () => {
  test.describe.configure({ mode: "serial" });

  test("renders offline from cache after an online view", async ({ page, context }) => {
    test.skip(!!skipReason, skipReason ?? "");
    test.skip(!seed, "no seeded gallery");
    const s = seed!;

    // Online view. Public+published gallery needs no session; the OfflineCacher
    // runs on mount and populates the bucket + IDB catalog.
    await page.goto(`/g/${s.slug}`);

    // Grid + at least the primary tile (alt = filename) paint online.
    const grid = page.locator(`[aria-label="Grid view for gallery ${s.slug}"]`);
    await expect(grid).toBeVisible({ timeout: ASYNC_ASSERT_TIMEOUT_MS });
    const primaryImg = page.locator(`img[alt="${s.primaryFilename}"]`).first();
    await expect(primaryImg).toBeVisible({ timeout: ASYNC_ASSERT_TIMEOUT_MS });
    await expect
      .poll(async () => primaryImg.evaluate((img) => (img as HTMLImageElement).naturalWidth), {
        timeout: ASYNC_ASSERT_TIMEOUT_MS,
      })
      .toBeGreaterThan(0);

    // The service worker must be controlling so the offline navigation handler
    // can serve /offline-gallery.html on reload.
    await expect.poll(() => waitForServiceWorker(page), { timeout: ASYNC_ASSERT_TIMEOUT_MS }).toBe(true);

    // Offline cacher populates the stable bucket `rawdrive-offline-<galleryId>`.
    const bucket = `rawdrive-offline-${s.galleryId}`;
    await expect
      .poll(async () => (await cacheBucketNames(page, bucket)).includes(bucket), {
        timeout: ASYNC_ASSERT_TIMEOUT_MS,
      })
      .toBe(true);
    // ...and the IDB catalog row keyed by slug.
    await expect.poll(() => idbHasSlug(page, s.slug), { timeout: ASYNC_ASSERT_TIMEOUT_MS }).toBe(true);

    // Go offline and reload — the SW prefers the cached Next app document, the
    // React app boots, and PublicGalleryOfflineGate swaps in <OfflineGalleryView/>
    // which renders the REACT grid from the IDB catalog + Cache Storage.
    await context.setOffline(true);
    await page.reload();

    // OfflineGalleryView renders the "Offline · saved copy" chip and the SAME
    // PublicGalleryGrid the online view uses: aria-label="Grid view for gallery
    // <slug>" with one <img alt=filename> per cached asset (Cache Storage blob URL).
    await expect(page.getByText(/Offline/i).first()).toBeVisible({ timeout: ASYNC_ASSERT_TIMEOUT_MS });
    const offlineGrid = page.locator(`[aria-label="Grid view for gallery ${s.slug}"]`);
    await expect(offlineGrid).toBeVisible({ timeout: ASYNC_ASSERT_TIMEOUT_MS });
    const offlineImg = page.locator(`img[alt="${s.primaryFilename}"]`).first();
    await expect(offlineImg).toBeVisible({ timeout: ASYNC_ASSERT_TIMEOUT_MS });
    await expect
      .poll(async () => offlineImg.evaluate((img) => (img as HTMLImageElement).naturalWidth), {
        timeout: ASYNC_ASSERT_TIMEOUT_MS,
      })
      .toBeGreaterThan(0);
    // Cached blob URL, proving the byte came from Cache Storage (not the network,
    // which is offline).
    await expect
      .poll(async () => (await offlineImg.getAttribute("src")) ?? "", { timeout: ASYNC_ASSERT_TIMEOUT_MS })
      .toMatch(/^blob:/);

    // Bucket + catalog entry still present while offline.
    expect((await cacheBucketNames(page, bucket)).includes(bucket)).toBe(true);
    expect(await idbHasSlug(page, s.slug)).toBe(true);

    // Restore network for subsequent serial tests.
    await context.setOffline(false);
  });

  // ── Test 2: purges the local copy on revocation after reconnect ───────────

  test("purges the local copy on revocation after reconnect", async ({ page, context }) => {
    test.skip(!!skipReason, skipReason ?? "");
    test.skip(!seed, "no seeded gallery");
    const s = seed!;

    // Ensure the gallery is saved offline (idempotent re-seed of the local copy:
    // an online view re-runs the OfflineCacher).
    await context.setOffline(false);
    await page.goto(`/g/${s.slug}`);
    const bucket = `rawdrive-offline-${s.galleryId}`;
    await expect
      .poll(async () => (await cacheBucketNames(page, bucket)).includes(bucket), {
        timeout: ASYNC_ASSERT_TIMEOUT_MS,
      })
      .toBe(true);
    await expect.poll(() => idbHasSlug(page, s.slug), { timeout: ASYNC_ASSERT_TIMEOUT_MS }).toBe(true);

    // Revoke server-side: unpublish → public GetBySlug now 404. Poll the API so
    // we don't race the write.
    const token = await login();
    await setPublished(token, s.galleryId, false);
    await expect
      .poll(() => publicGalleryStatus(s.slug), { timeout: STEP_TIMEOUT_MS })
      .toBe(404);

    // Trigger reconnect revalidation. OfflineRevalidator (mounted in
    // app/g/[slug]/layout.tsx) runs on the `online` event and on mount when
    // navigator.onLine — a reload while online re-runs it.
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.reload();

    // Local copy purged: the bucket is gone AND the catalog row is removed.
    await expect
      .poll(async () => (await cacheBucketNames(page, bucket)).includes(bucket), {
        timeout: ASYNC_ASSERT_TIMEOUT_MS,
      })
      .toBe(false);
    await expect.poll(() => idbHasSlug(page, s.slug), { timeout: ASYNC_ASSERT_TIMEOUT_MS }).toBe(false);

    // NEGATIVE (transient error) — NOT exercised live here. purgeDecision keeps
    // the local copy on status 0 / 500 / 503 (transient/network), purging only
    // on the definitive 403/404/410. Simulating a transient 5xx on the public
    // endpoint requires server fault injection that this stack does not expose,
    // and routing the SW-cached app shell's API calls is brittle. This branch is
    // covered deterministically by the unit test
    // frontend/src/lib/offline/__tests__/sync.test.ts ("keeps (does NOT purge)
    // on transient/network errors": status 0, 500, 503 → "keep").

    // Re-publish so the gallery is left publicly viewable for any later run.
    await setPublished(token, s.galleryId, true);
    await setAccessModePublic(token, s.galleryId);
  });

  // ── Test 3: encrypted gallery DECRYPTS offline (decrypt-on-view) ──────────

  test("encrypted gallery decrypts and renders offline via the React grid", async ({
    page,
    context,
  }) => {
    test.skip(!!skipReason, skipReason ?? "");
    test.skip(
      !encryptedSeed,
      "no encrypted+published+public gallery available to seed/locate for the encrypted offline variant",
    );
    const e = encryptedSeed!;

    // Online view of the encrypted gallery. The online render decrypts each tile
    // via useDecryptedAssetUrl, which persists the gallery media key into THIS
    // browser's localStorage (media-key-store), and the OfflineCacher records the
    // catalog entry (isEncrypted=true, keyId) + caches the display_webp `.enc`
    // ciphertext into Cache Storage.
    await page.goto(`/g/${e.slug}`);
    await expect.poll(() => waitForServiceWorker(page), { timeout: ASYNC_ASSERT_TIMEOUT_MS }).toBe(true);
    await expect.poll(() => idbHasSlug(page, e.slug), { timeout: ASYNC_ASSERT_TIMEOUT_MS }).toBe(true);
    // Confirm at least one encrypted tile decrypted online (blob: src) so the
    // offline assertion below isn't masking a never-decrypting gallery.
    const onlineImg = page.locator(`[aria-label="Grid view for gallery ${e.slug}"] img`).first();
    await expect(onlineImg).toBeVisible({ timeout: ASYNC_ASSERT_TIMEOUT_MS });
    await expect
      .poll(async () => (await onlineImg.getAttribute("src")) ?? "", { timeout: ASYNC_ASSERT_TIMEOUT_MS })
      .toMatch(/^blob:/);

    // Go offline + reload → SW prefers the cached Next app document, the React app
    // boots, and OfflineGalleryView decrypts the cached `.enc` bytes cache-first
    // using the localStorage media key. The decrypted tiles render (blob: srcs)
    // rather than the cold-boot shell's "open online" message.
    await context.setOffline(true);
    await page.reload();

    const offlineGrid = page.locator(`[aria-label="Grid view for gallery ${e.slug}"]`);
    await expect(offlineGrid).toBeVisible({ timeout: ASYNC_ASSERT_TIMEOUT_MS });
    const offlineImg = offlineGrid.locator("img").first();
    await expect(offlineImg).toBeVisible({ timeout: ASYNC_ASSERT_TIMEOUT_MS });
    // Decrypted bytes come from Cache Storage (blob:), proving offline decrypt —
    // not the network (offline) and not a ciphertext/broken tile.
    await expect
      .poll(async () => (await offlineImg.getAttribute("src")) ?? "", { timeout: ASYNC_ASSERT_TIMEOUT_MS })
      .toMatch(/^blob:/);
    await expect
      .poll(async () => offlineImg.evaluate((img) => (img as HTMLImageElement).naturalWidth), {
        timeout: ASYNC_ASSERT_TIMEOUT_MS,
      })
      .toBeGreaterThan(0);

    // The cold-boot shell's "open online" message must NOT be what the visitor
    // sees — the app document booted and decrypted instead.
    await expect(
      page.getByText(
        "This gallery is encrypted. Open it from the RawDrive app (online once) to view offline.",
      ),
    ).toHaveCount(0);

    await context.setOffline(false);
  });
});
