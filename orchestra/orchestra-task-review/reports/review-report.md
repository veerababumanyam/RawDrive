# Review — Delete → B2 storage cleanup (end-to-end)

**Scope:** Deletion lifecycle for photos & galleries from the customer web → object removal in
Backblaze B2. Question: *do deletes actually remove the bytes in B2, or do they leak as orphaned,
billable objects?*

**Verdict:** `advisory` — the end-to-end mechanism **is in place** (bytes are deleted immediately on
delete), but there are **real orphan/waste gaps** in the durable backstop. Report-only.

---

## How deletion actually works today (verified, cited)

### Photo (asset) delete — `DELETE /api/v1/assets/{id}` and bulk `action:"delete"`
- `AssetHandler.SoftDelete` → `AssetService.SoftDelete` (`asset_service.go:104`) sets `deleted_at`
  **and** calls `recordDelete` (`asset_service.go:169`).
- `recordDelete` → `deleteStorageObjectsAsync(assetStorageKeys(...))` (`asset_service.go:184`).
- `assetStorageKeys` (`asset_service.go:191`) collects **the original (`StorageKey`) + every
  derivative key (`derivativeRepo.ListByAsset`) + `ThumbnailURLs`** — i.e. all WebP variants.
- `deleteStorageObjectsAsync` (`asset_service.go:249`) fires a **detached, fire-and-forget
  goroutine** (`context.Background()`, 2-min timeout) that calls `storage.Delete(key)` for each key.
- `S3Driver.Delete` → `DeleteObject` (`s3.go:49`, `s3_aws.go:223`) issues the real B2 delete.

➡️ **So on a normal delete the original + all derivatives are removed from B2 immediately.** The
mechanism exists.

### Gallery delete — `DELETE /api/v1/galleries/{id}`
- `GalleryHandler.SoftDelete` (`gallery_handler.go:757`) calls **`SoftDeleteForWorkspace`**
  (`gallery_service.go:592`) — the cascading path, not the bare `SoftDelete`.
- It lists `ListDeletableAssetIDsForGallery` (`gallery_asset_repo.go:253`) → SQL
  (`gallery_asset_repo.go:217`) returns assets whose **only live gallery membership is this
  gallery** (`NOT EXISTS … other live gallery`). Assets shared with another live gallery are
  preserved — correct de-dup, no premature delete.
- Those asset IDs go through `SoftDeleteManyForWorkspace` → same async B2 delete per asset.

➡️ **Deleting a gallery removes its exclusive photos from B2 immediately.** Albums
(`album_service.go:315`) only delete the album grouping, never asset bytes — correct (albums are
views inside a gallery).

### The 30-day purge worker — `AssetPurgeWorker` (`asset_purge_worker.go`)
- Registered & started: `main.go:3367-3368`, logged at `main.go:3412`.
- 30-day retention, polls every 6h (`asset_purge_worker.go:27-28`).
- Atomic claim with `FOR UPDATE SKIP LOCKED` (`asset_purge_worker.go:92`) — multi-node safe. Good.
- **Per row it deletes ONLY `item.storageKey`** (`asset_purge_worker.go:140`), then
  `DELETE FROM asset_derivatives` (`:151`), `gallery_assets` (`:155`), and the asset row (`:158`).

---

## Findings

### F1 — Derivative objects have NO durable cleanup backstop  ·  severity: high  ·  P1
**Evidence:** `asset_purge_worker.go:137-159` deletes only the original (`item.storageKey`) and then
`DELETE FROM asset_derivatives WHERE asset_id=$1` — it never reads/deletes the derivative
**storage keys** from B2. The **only** path that deletes derivative objects is the best-effort async
goroutine (`asset_service.go:249`).
**Impact:** If that goroutine fails — B2 throttle/network blip, or the process is killed mid-flight
(rolling deploys restart app nodes routinely) — the 4 WebP derivatives per photo are **orphaned in
B2 permanently**, and once the purge worker drops `asset_derivatives` their keys are gone from the DB
so they can never be reconciled. For a photo platform derivatives dominate object count → this is the
single biggest silent storage-waste source. Directly the concern raised.

### F2 — Object delete is fire-and-forget with no durability / no reconciliation  ·  severity: medium  ·  P2
**Evidence:** `deleteStorageObjectsAsync` (`asset_service.go:253`) detaches from the request context
and only `log.Printf`s failures (`:258`) — no retry, no durable queue, no dead-letter. A repo-wide
search found **no bucket-scan/orphan reconciler** (no `ListObjects`-vs-DB sweep anywhere in
`backend/internal`).
**Impact:** Any failed delete is an invisible permanent leak; there is no safety net that compares B2
against the DB to recover from F1/F2.

### F3 — "Soft delete" + Restore imply recoverability, but bytes are destroyed immediately  ·  severity: low (semantics)  ·  P3
**Evidence:** `GalleryService.Restore` (`gallery_service.go:754`) un-deletes a gallery, and assets are
"soft" deleted for 30 days — yet `recordDelete` destroys the B2 bytes at delete time. Restore brings
back an empty shell; cascaded assets stay soft-deleted with bytes already gone.
**Note:** Per product direction (E2EE galleries — ciphertext is useless once the gallery/its key is
gone) recoverability is **not wanted**, which makes the 30-day retention dead weight. See the change
request below.

### F4 — Assets never linked to a gallery aren't reachable by gallery-delete cleanup  ·  severity: low  ·  P3
**Evidence:** cleanup discovery is via `gallery_assets` (`gallery_asset_repo.go:217`). An asset whose
gallery link never completed (upload ok, link failed) is only cleanable via direct asset delete.
Minor; bounded by upload-integrity, not deletion.

---

## Answer to the question

> *If photos / a gallery are deleted in the customer web, are they deleted in B2? Is the end-to-end
> mechanism in place, or do they become orphans wasting storage?*

**Yes — the end-to-end mechanism is in place and B2 objects are deleted immediately** on photo delete
and on gallery delete (exclusive photos, original + derivatives). It is **not** silently leaving
everything orphaned. **But** the durable backstop is incomplete: derivative objects rely solely on a
best-effort async delete (F1), and there is no retry/reconciliation (F2), so a fraction of deletes —
especially during deploys/B2 hiccups — **do** leak derivative objects permanently. Fixing F1+F2 closes
the waste.
