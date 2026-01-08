# Upload Service Architecture

## Overview

The upload-service is a high-performance microservice responsible for handling resumable file uploads using the TUS protocol. It supports chunked uploads, AES-256 encryption, and seamless integration with Cloudflare R2 storage.

**Key Features:**
- TUS 1.0 protocol for resumable uploads
- Chunked upload support (5MB default chunk size)
- AES-256-CTR encryption at rest
- SHA256 checksum verification
- Duplicate file detection
- Multi-tenant workspace isolation
- KEDA autoscaling (2-50 replicas)
- Kafka event publishing for async processing

---

## System Architecture

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │ TUS Protocol (HTTP/HTTPS)
       ▼
┌──────────────────────────────────────┐
│         Traefik v3 Gateway          │
│  (Rate Limiting, CORS, Load Balance) │
└──────────────┬───────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │  Upload Service Pod  │
    │  (FastAPI + uvicorn) │
    └──────────┬───────────┘
               │
       ┌───────┼────────┬────────────┐
       │       │        │            │
       ▼       ▼        ▼            ▼
   ┌──────┐ ┌──────┐ ┌──────┐  ┌─────────┐
   │Redis │ │ PG   │ │  R2  │  │ Kafka   │
   │Cache │ │ DB   │ │ Stor │  │ Events  │
   └──────┘ └──────┘ └──────┘  └─────────┘
```

---

## Core Components

### 1. TUS Protocol Implementation

The service implements TUS (Tus Resumable Upload Protocol) version 1.0:

**Supported Extensions:**
- **Creation**: Create upload sessions
- **Termination**: Cancel uploads
- **Checksum**: SHA256 verification
- **Expiration**: 24-hour session TTL

**Upload Flow:**
```
1. POST /v1/uploads
   → Create session, validate file metadata
   → Return upload_id + session_url

2. PATCH /v1/uploads/{id}/chunks (repeat)
   → Upload chunk with offset
   → Store in Redis with TTL
   → Return new offset in header

3. HEAD /v1/uploads/{id}/chunks (optional)
   → Get current offset for resume
   → Client resumes from this offset

4. POST /v1/uploads/{id}/complete
   → Assemble chunks from Redis
   → Compute SHA256 checksum
   → Encrypt file
   → Upload to R2
   → Create asset record
   → Publish Kafka event
```

### 2. Chunked Upload Strategy

**Chunk Storage (Redis):**
- **Key format**: `chunk:{workspace_id}:{upload_id}:{offset}`
- **Chunk size**: 5MB default (configurable 1MB-10MB)
- **TTL**: 24 hours
- **Metadata key**: `chunk_meta:{workspace_id}:{upload_id}`

**Memory Efficiency:**
- Chunks never fully loaded into memory
- Streaming assembly using async generators
- Redis stores raw binary data
- Automatic cleanup on TTL expiry

**Example Redis Keys:**
```
chunk:550e8400:abc123:0        → [5MB binary data]
chunk:550e8400:abc123:5242880  → [5MB binary data]
chunk:550e8400:abc123:10485760 → [3MB binary data]
chunk_meta:550e8400:abc123     → {"total_size": 13631488, "chunks_count": 3}
```

### 3. Encryption Pipeline

**AES-256-CTR Encryption:**
- **Algorithm**: AES-256 in Counter mode
- **Key Derivation**: Per-workspace keys derived from master key
- **IV**: Random 16-byte initialization vector per file
- **Authentication**: HMAC-SHA256 tag for integrity

**Encryption Flow:**
```python
# Streaming encryption (no full file in memory)
async for chunk in assemble_chunks(upload_id):
    encrypted_chunk = encryptor.update(chunk)
    yield encrypted_chunk

# Final block
yield encryptor.finalize()
```

**Storage Format:**
```
File: {asset_id}.enc
Structure:
  [IV: 16 bytes]
  [Encrypted Data: variable]
  [HMAC Tag: 32 bytes]
```

### 4. R2 Storage Integration

**Multipart Upload Strategy:**
- Files > 10MB: Use multipart upload (5MB parts)
- Files ≤ 10MB: Single PUT request
- Resumable: Parts tracked in database
- Concurrent: Up to 5 parallel part uploads

**Storage Key Convention:**
```
workspaces/{workspace_id}/galleries/{gallery_id}/original/{asset_id}/{filename}.enc
```

**Circuit Breaker:**
- Threshold: 5 consecutive failures
- Recovery timeout: 30 seconds
- Half-open requests: 3
- Degrades gracefully (returns 503)

### 5. Database Schema

**upload_sessions Table:**
```sql
CREATE TABLE upload_sessions (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    gallery_id UUID,
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    sha256_hash VARCHAR(64),
    status VARCHAR(20) NOT NULL, -- created, uploading, verifying, committed, failed
    chunks_uploaded INTEGER DEFAULT 0,
    bytes_uploaded BIGINT DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**assets Table:**
```sql
CREATE TABLE assets (
    id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    upload_session_id UUID REFERENCES upload_sessions(id),
    filename VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    sha256_hash VARCHAR(64) NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_assets_sha256 ON assets(workspace_id, sha256_hash);
```

**asset_encryption Table:**
```sql
CREATE TABLE asset_encryption (
    asset_id UUID PRIMARY KEY REFERENCES assets(id),
    encryption_algorithm VARCHAR(50) NOT NULL, -- AES-256-CTR
    iv BYTEA NOT NULL, -- 16 bytes
    auth_tag BYTEA NOT NULL, -- HMAC-SHA256 tag
    key_version INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 6. Kafka Event Publishing

**Topics:**
- `asset-processing` - Asset processing requests
- `upload-events` - Upload lifecycle events

**Event Schema (asset-processing):**
```json
{
  "event_type": "asset.uploaded",
  "asset_id": "550e8400-e29b-41d4-a716-446655440000",
  "workspace_id": "...",
  "gallery_id": "...",
  "filename": "IMG_1234.jpg",
  "file_size": 5242880,
  "mime_type": "image/jpeg",
  "storage_key": "workspaces/.../original/...",
  "sha256_hash": "abc123...",
  "timestamp": "2026-01-08T10:30:00Z"
}
```

**Consumer Actions:**
- Thumbnail generation (multiple sizes)
- Image variant creation (WebP, AVIF)
- Metadata extraction (EXIF, dimensions)
- Face detection and embedding
- AI tagging and categorization

---

## Request Flow

### Upload Session Creation

```
1. Client → POST /v1/uploads
   {
     "filename": "photo.jpg",
     "file_size": 15728640,
     "mime_type": "image/jpeg",
     "gallery_id": "..."
   }

2. Service validates:
   - File type allowed (images, videos, RAW)
   - File size within limits (100MB/200MB/500MB)
   - Workspace has storage quota

3. Service queries database:
   SELECT SUM(file_size) FROM assets WHERE workspace_id = ?
   → Compare with plan.storage_limit

4. Service creates session:
   INSERT INTO upload_sessions (id, workspace_id, ..., expires_at)

5. Service returns:
   {
     "upload_id": "...",
     "session_url": "/v1/uploads/.../chunks",
     "expires_at": "2026-01-09T10:30:00Z"
   }
```

### Chunk Upload

```
1. Client → PATCH /v1/uploads/{id}/chunks
   Headers:
     Content-Type: application/offset+octet-stream
     Upload-Offset: 0
     Content-Length: 5242880
   Body: [5MB binary data]

2. Service validates:
   - Session exists and not expired
   - Offset matches expected position
   - Chunk size ≤ max chunk size

3. Service stores in Redis:
   SET chunk:{workspace_id}:{upload_id}:0 [binary] EX 86400

4. Service updates session:
   UPDATE upload_sessions
   SET chunks_uploaded = chunks_uploaded + 1,
       bytes_uploaded = bytes_uploaded + 5242880,
       updated_at = NOW()
   WHERE id = upload_id

5. Service returns:
   204 No Content
   Headers:
     Upload-Offset: 5242880
     Tus-Resumable: 1.0.0
```

### Upload Completion

```
1. Client → POST /v1/uploads/{id}/complete
   {
     "sha256": "abc123..."
   }

2. Service assembles file:
   async def assemble():
     for offset in [0, 5242880, 10485760]:
       chunk = await redis.get(f"chunk:{workspace_id}:{upload_id}:{offset}")
       yield chunk

3. Service computes SHA256 during assembly:
   hash_obj = hashlib.sha256()
   async for chunk in assemble():
     hash_obj.update(chunk)
   computed_hash = hash_obj.hexdigest()

4. Service validates checksum:
   if computed_hash != provided_sha256:
     raise ChecksumMismatchError

5. Service encrypts (streaming):
   encryptor = AESCipher(workspace_key, iv)
   async for chunk in assemble():
     encrypted = encryptor.update(chunk)
     → Stream to R2

6. Service uploads to R2:
   - Initiate multipart upload
   - Upload parts (5MB each, parallel)
   - Complete multipart upload

7. Service creates asset record:
   INSERT INTO assets (id, workspace_id, sha256_hash, storage_key, ...)
   INSERT INTO asset_encryption (asset_id, iv, auth_tag, ...)

8. Service publishes Kafka event:
   kafka.send('asset-processing', event_data)

9. Service cleans up:
   - Delete all Redis chunks
   - Update session status to 'committed'

10. Service returns:
    {
      "asset_id": "...",
      "status": "committed",
      "storage_key": "..."
    }
```

---

## Performance Characteristics

**Throughput:**
- **Target**: 50,000 concurrent uploads
- **Chunk processing**: 5MB in ~100ms
- **Database queries**: <10ms (indexed)
- **Redis operations**: <5ms
- **R2 upload**: 500ms-2s (5MB part)

**Resource Usage (per pod):**
- **CPU**: 100m-500m (requests-limits)
- **Memory**: 256Mi-512Mi
- **Network**: 10-50 Mbps egress to R2

**Scaling Triggers:**
- Kafka lag > 100 messages
- Concurrent uploads > 50 per pod
- Request rate > 1000/min per pod

---

## Error Handling

**Retry Strategy:**
- R2 operations: 3 retries with exponential backoff
- Database queries: 2 retries
- Redis operations: 1 retry
- Kafka publish: Async with retry queue

**Graceful Degradation:**
- Circuit breaker trips → 503 Service Unavailable
- Redis down → Reject new uploads, allow completions with warning
- Database read replica down → Fallback to primary
- Kafka down → Log locally, retry async

---

## Security

**Multi-Tenancy:**
- All queries filtered by `workspace_id`
- JWT validates user's workspace access
- No cross-workspace data leakage

**Input Validation:**
- File type whitelist (images, videos, RAW)
- File size limits enforced
- MIME type validation
- Filename sanitization

**Encryption:**
- AES-256-CTR for files at rest
- Per-workspace encryption keys
- Keys stored in HashiCorp Vault
- IV randomized per file

---

## Monitoring & Observability

**Metrics:**
```
upload_concurrent_total                  # Current concurrent uploads
upload_chunk_bytes_total                 # Total bytes uploaded
upload_session_duration_seconds          # Upload session duration histogram
upload_errors_total{type="validation"}   # Errors by type
upload_requests_total{endpoint="/chunks"} # Requests by endpoint
```

**Logs:**
- Structured JSON format
- Correlation ID for distributed tracing
- PII filtering (filenames logged, emails filtered)
- Request/response logging at INFO level

**Health Checks:**
- `/health` - Basic liveness
- `/health/live` - K8s liveness probe
- `/health/ready` - K8s readiness probe (DB + Redis + R2)
- `/metrics` - Prometheus metrics

---

## Future Enhancements

1. **P2P Upload**: WebRTC peer-to-peer uploads for large files
2. **Compression**: Transparent compression before encryption
3. **Deduplication**: Block-level dedup for similar files
4. **Resumable R2 Uploads**: Resume R2 multipart uploads across restarts
5. **Smart Chunking**: Adaptive chunk size based on network speed
6. **Edge Caching**: Cache frequently accessed assets at edge locations
