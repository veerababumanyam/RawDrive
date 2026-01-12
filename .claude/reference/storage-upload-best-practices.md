# Storage & Upload Best Practices (TUS & Cloudflare R2)

A guide for handling large media asset ingestion and delivery in RawDrive.

---

## 1. Storage Backend (Cloudflare R2)

### Why R2?
*   **No Egress Fees:** Critical for a photography platform where bandwidth usage is high.
*   **S3 Compatibility:** Uses standard boto3 / AWS SDKs.

### Architecture
*   **Private Bucket:** Raw originals. `ACL=private`.
*   **Public Bucket:** Thumbnails/Web-optimized assets. Served via CDN. `ACL=public-read` (or private behind Worker).
*   **Backup Bucket:** Cold storage for safety.

### Presigned URLs
Do not proxy file data through the API.
*   **Downloads:** Generate `presigned_url(method='get_object', key=..., expires=3600)`.
*   **Uploads (Simple):** Generate `presigned_url(method='put_object', ...)` for small files.

---

## 2. Resumable Uploads (TUS Protocol)

For huge files (RAW images, 4K Video), standard HTTP POST fails on flaky networks. We use **TUS**.

### Server Implementation (`upload-service`)
*   **Library:** `tusd` (Go binary) or Python `tuspy` adapter.
*   **Store:** Local disk buffer -> Assembly -> Flush to R2.
    *   *Note:* Direct TUS-to-S3/R2 is possible with `tusd` hooks but requires careful config for multipart uploads.

### Client Implementation (`@tus/tus-js-client`)
*   **Chunk Size:** 5MB - 10MB.
*   **Retry:** Built-in.
*   **Concurrency:** Upload multiple files in parallel (limit to roughly 3-5 to avoid browser network locking).

### Lifecycle
1.  **Creation:** `POST /api/upload/files` -> Returns Location header (Upload ID).
2.  **Transfer:** `PATCH /api/upload/files/{id}` -> Sends chunks.
3.  **Completion:** Server detects EOF -> Assembles file -> Uploads to R2 -> Triggers `ASSET_UPLOADED` event.

---

## 3. Image Processing Pipeline

### On-the-Fly vs Background
*   **Never** resize images on the main API request thread.
*   **Frontend (LQIP):** Generate a tiny base64 blurhash/LQIP client-side before upload for instant UI feedback.
*   **Worker:** Background worker downloads original -> generates `thumb` (400px), `web` (1080px), `full` (2048px) -> uploads derivatives.

### Formats
*   **Input:** JPG, PNG, **HEIC**, **RAW** (CR2, NEF, ARW).
    *   *Note:* RAW conversion requires `libraw` / `imagemagick` on the worker container.
*   **Output:** `WebP` (80% quality) for web delivery.

---

## 4. CDN & Caching (Cloudflare)

### Cache Rules
*   **Images:** `Cache-Control: public, max-age=31536000, immutable`.
*   **Signed URLs:** R2 Signed URLs include the signature in the query param. Cloudflare caches based on full URL.
    *   *Optimization:* Use long-lived signed URLs (4h) to maximize cache hit ratio.

### Security
*   **Hotlink Protection:** Configure WAF to block requests with empty/foreign Referers for public assets.
