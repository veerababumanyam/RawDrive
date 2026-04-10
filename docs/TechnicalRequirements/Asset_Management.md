# Technical Requirements: Asset Management & Ingestion

**Document Status:** Setera Standard v1.1 (2026 Ready)  
**Ownership:** Backend Infrastructure / Data Plane  
**Technology:** Golang (Data Plane), TUS 1.0.0, Cloudflare R2, pgvector (Metadata), BYOS (S3-Compatible)

---

## 1. Product Mission
Provide photographers with a **resilient, high-performance** media ingestion and storage engine that handles massive uploads (up to 50 GB per session) with sub-second retrieval times, unified metadata management, and "Zero Egress" cost flexibility.

## 2. Ingestion & Upload Workflow

### 2.1 TUS Protocol (Resumable Uploads)
Every upload in RawDrive must use the **TUS (The Upload Solution) 1.0.0** protocol to ensure reliability across India's varied mobile network conditions.
- **Resumability:** Persistent state across connection drops using `Upload-Offset`.
- **Chunking:** Dynamically adjusted chunk sizes (5MB - 20MB) based on network throughput.
- **Go Implementation:** Native integration via `tusd` handles large-scale concurrency and memory-efficient streaming to R2.
- **CLI Native Support:** The `rawdrive` CLI implements a concurrent TUS client for mass ingestion (>100 batches), bypassing browser memory/thread limits.

### 2.2 Pre-Processing & Async Pipeline
Before upload session creation, RawDrive should perform client-side structural abuse screening on the source machine for supported formats, with stronger desktop-local screening for high-risk original-preservation formats. The detailed architecture is defined in **[Gallery/UPLOAD_CLIENT_SIDE_ABUSE_SCREENING_ARCHITECTURE.md](Gallery/UPLOAD_CLIENT_SIDE_ABUSE_SCREENING_ARCHITECTURE.md)**.

Immediately after a chunk is uploaded:
1.  **Integrity Check:** `Content-MD5` header verification for ہر chunk.
2.  **EXIF Extraction:** Extract camera model, lens, exposure, GPS, and timestamp.
3.  **Aesthetic Scoring:** Integrated with `AI_Intelligence_Search.md` for real-time quality scoring.
4.  **Smart Grouping:** Automatic grouping of photos by "Event Moments" (e.g., 200 shots in a 10-minute window during a wedding).
5.  **Thumbnail Generation:** Create WebP derivatives (Small, Medium, Large) for the gallery. P95 latency < 150ms.
6.  **Metadata Save:** Synchronous write to PostgreSQL metadata store.

---

## 3. Storage Architecture

### 3.1 Managed Storage: Cloudflare R2
The default storage for RawDrive.
- **Zero Egress:** Critical for high-volume photography platforms.
- **Edge Delivery:** Native integration with Cloudflare Workers for edge-cached thumbnail and watermark rendering.
- **Signed URLs:** All assets delivered via expiring HMAC pre-signed URLs (4-hour TTL default).

### 3.2 Bring Your Own Storage (BYOS)
For Enterprise and high-volume Pro users:
- **Requirement:** Allow users to provide S3-compatible credentials (AWS S3, Google Cloud Storage, DigitalOcean Spaces).
- **Isolation:** RawDrive manages the metadata index while source binaries stay in the user's bucket.
- **Validation Engine:** RawDrive must verify `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` permissions before activating a BYOS bucket.
- **Cost Transfer:** Storage and Egress costs are borne entirely by the user.

---

## 4. Asset Versioning & Lifecycle

### 4.1 Non-Destructive Editing
When a photographer re-uploads or "retouches" an asset:
- **Lazy Versioning:** Retain original RAW/JPEG for 30 days (per plan).
- **Pointer Update:** The gallery dynamically points to the "Latest Approved" version.
- **Audit Trace:** Explicit logs for every version swap.

### 4.2 Collection & Folder Logic
- **Virtual Taxonomy:** Assets are organized using a tagging/collection model in the database, **not** physical folder structures in S3/R2.
- **Cross-Linking:** A single asset can belong to multiple collections (e.g., "Full Shoot" and "Client Favorites") without duplicating physical storage bytes.

---

## 5. Security & Sovereignty
- **Encryption at Rest:** AES-256 mandatory for all R2 buckets and BYOS volumes.
- **Server-Side Encryption:** SSE-S3 or SSE-KMS for all S3-compatible providers.
- **Data Residency:** Assets tagged for "India Residency" must be routed to `ap-south-1` nodes.
- **Compliance Spec:** Refer to **Security_Compliance_Privacy.md** for details on HSM key management and audit logging for asset access.

---

## 6. Performance & Reliability Benchmarks
- **Concurrent Sessions:** Support 5,000+ active upload streams per region.
- **Throughput:** Capable of sustained 10Gbps ingress per storage cluster.
- **Search Latency:** Metadata-based search (tags, name) < 100ms for 10M+ assets using indexed JSONB.
- **Fault Tolerance:** 99.99% availability using multi-region R2 replication.
