# Build task — backend signed-CDN-URL minter (activates the live CDN)

**Owner:** a fresh build terminal. **Status:** ready to build. **Risk:** ships behind a flag (default OFF) → safe.

## Context (what's already done)
The Cloudflare Worker `rawdrive-cdn-worker` is **deployed and verified** on `cdn.rawdrive.in/*`
(IaC: `deploy/cloudflare/cdn-worker/`; design: `docs/runbooks/cdn-b2-signed-urls.md`). It validates a
short-lived HMAC-signed URL, SSE-C-decrypts the object from B2 (`rawdriveclientfiles`), and edge-caches
it. **It works but is unused** — the backend still emits `/storage/*` URLs. This task makes the app emit
signed `cdn.rawdrive.in` URLs for **derivatives**, behind a flag.

## The contract (must match the Worker byte-for-byte)
- URL: `https://cdn.rawdrive.in/<percent-encoded-key>?exp=<unix>&sig=<hex>`
- Canonical signed string: `<raw-key>` + `"\n"` (0x0A) + `<exp>` (decimal unix seconds)
- `sig` = lowercase hex of `HMAC-SHA256(canonical, CDN_HMAC_SECRET)`, secret used as **UTF-8 string bytes** (do NOT hex-decode)
- TTL ≈ 1h.

## Config (resolve via the standard platform_settings → env order)
Add a `cdn` category (or reuse `storage`):
| key / env | meaning |
|---|---|
| `CDN_SIGNED_URLS` (bool, default **false**) | master flag — emit CDN URLs only when true |
| `CDN_BASE_URL` (default `https://cdn.rawdrive.in`) | edge base |
| `CDN_HMAC_SECRET` (secret) | **must equal the Worker's** = `9ec34bb2d8c97ea06be91a6d2b8954aa3e432912ace00cd5198556d2198251af` |
Add all three to `.env.example` + seed in `sync-platform-settings-from-env`.

## Helper (new file `backend/internal/storage/cdn.go`)
```go
package storage

import (
    "crypto/hmac"; "crypto/sha256"; "encoding/hex"; "fmt"; "net/url"; "strings"; "time"
)

// SignedCDNURL builds a signed cdn.rawdrive.in URL for a derivative storage key.
// Canonical = rawKey + "\n" + exp ; sig = hex(HMAC-SHA256(canonical, secret-as-string-bytes)).
func SignedCDNURL(base, rawKey, secret string, ttl time.Duration) string {
    exp := time.Now().Add(ttl).Unix()
    m := hmac.New(sha256.New, []byte(secret))
    fmt.Fprintf(m, "%s\n%d", rawKey, exp)
    sig := hex.EncodeToString(m.Sum(nil))
    segs := strings.Split(rawKey, "/")
    for i, s := range segs { segs[i] = url.PathEscape(s) }
    return fmt.Sprintf("%s/%s?exp=%d&sig=%s", strings.TrimRight(base, "/"), strings.Join(segs, "/"), exp, sig)
}
```

## Wiring (where to emit it)
1. **`backend/internal/handler/public_gallery_handler.go`** — the public gallery serializer builds
   `thumbnail_urls` (map of variant→url) + asset display URLs from `asset_derivatives.storage_key`.
   When `CDN_SIGNED_URLS` is on **and** the caller passed the gallery-session/access check that this
   handler already enforces, replace the derivative URL with `SignedCDNURL(base, key, secret, 1h)`.
2. **`backend/internal/handler/edge_delivery_handler.go`** — already the "edge" path; reuse/extend it
   as the single place that maps a derivative `storage_key`→delivery URL, so both owner and public
   serializers call one function (`deliveryURL(key)` that returns CDN-signed or `/storage/` based on flag).
3. **Scope guards (hard):**
   - **Derivatives only** (`thumbnails/*`, `derivatives/*`). **Never** sign originals/masters — they
     keep going through `/storage` (JWT).
   - Emit only **after** the existing access/PIN/gallery-session check — never for an unauthorized request.
   - Originals download path (`asset_handler.go` `/storage/<key>`) is unchanged.

## Test (proves Go ⇄ Worker parity — REQUIRED)
`backend/internal/storage/cdn_test.go`: assert `SignedCDNURL` for a fixed key+exp+secret produces the
exact `sig` the Worker computes (compute the expected HMAC independently in the test). Add a table case
with a key containing a space/parens to prove path-escaping. Pin one golden vector.

## Ship → deploy → activate
1. `npm run ship -- "feat(cdn): backend signed-CDN-URL minter behind CDN_SIGNED_URLS flag"`
2. `npm run deploy:prod` (flag still **off** → zero behavior change; verifies it deploys clean).
3. Set on both app nodes `/opt/rawdrive/app/.env`: `CDN_SIGNED_URLS=true`, `CDN_BASE_URL=https://cdn.rawdrive.in`,
   `CDN_HMAC_SECRET=<the value above>`; re-sync platform_settings; roll backend.
4. Verify: load a gallery in a browser → images now come from `cdn.rawdrive.in` (Network tab),
   2nd load shows `CF-Cache-Status: HIT`, and gated galleries still 403 without the session.

## Rollback
`CDN_SIGNED_URLS=false` + roll backend → instantly back to `/storage` serving. Worker stays harmless.

## Phase 2 (separate, later)
Re-encrypt derivatives SSE-C → SSE-B2 (same migration pattern as the bucket move) and drop
`SSE_C_KEY_*` from the Worker so the customer key no longer lives in Cloudflare.
