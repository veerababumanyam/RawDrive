# Upload Service API Reference

## Base URL

- **Development**: `http://localhost:8080`
- **Production**: `https://api.rawdrive.com`

All endpoints are prefixed with `/api/v1/uploads`

---

## Authentication

All endpoints except health checks require JWT authentication.

**Headers:**
```http
Authorization: Bearer <jwt_token>
X-Workspace-ID: <workspace_uuid>
```

**JWT Claims Required:**
- `sub`: User ID
- `wids`: Array of workspace IDs user has access to
- `exp`: Token expiration

---

## Endpoints

### 1. Create Upload Session

Create a new upload session for a file.

**Request:**
```http
POST /api/v1/uploads
Content-Type: application/json
Authorization: Bearer <token>
X-Workspace-ID: <workspace-id>

{
  "filename": "photo.jpg",
  "file_size": 15728640,
  "mime_type": "image/jpeg",
  "gallery_id": "550e8400-e29b-41d4-a716-446655440000",
  "folder_path": "2024/January" // Optional
}
```

**Response (201 Created):**
```json
{
  "upload_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "session_url": "/api/v1/uploads/7c9e6679-7425-40de-944b-e07fc1f90ae7/chunks",
  "expires_at": "2026-01-09T10:30:00Z",
  "chunk_size": 5242880,
  "max_file_size": 104857600
}
```

**Error Responses:**
- `400` - Invalid file metadata (unsupported type, size too large)
- `401` - Missing or invalid authentication
- `402` - Storage quota exceeded
- `403` - Workspace access denied

**Supported File Types:**
- **Images**: JPEG, PNG, WebP, HEIC, TIFF, GIF, AVIF, BMP (max 100MB)
- **RAW**: CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG, PEF, RWL, SRW, X3F, 3FR (max 200MB)
- **Videos**: MP4, MOV (max 500MB)

---

### 2. Upload Chunk

Upload a chunk of the file using TUS protocol.

**Request:**
```http
PATCH /api/v1/uploads/{upload_id}/chunks
Content-Type: application/offset+octet-stream
Upload-Offset: 0
Content-Length: 5242880
Tus-Resumable: 1.0.0
Authorization: Bearer <token>

[5MB binary data]
```

**Response (204 No Content):**
```http
Upload-Offset: 5242880
Tus-Resumable: 1.0.0
```

**Error Responses:**
- `400` - Invalid offset or chunk too large
- `404` - Upload session not found
- `409` - Offset mismatch (expected different offset)
- `410` - Session expired
- `413` - Chunk size exceeds maximum

**Notes:**
- `Upload-Offset` header must match current position
- Maximum chunk size: 10MB
- Recommended chunk size: 5MB
- Chunks stored in Redis with 24-hour TTL

---

### 3. Get Upload Status

Get current upload status for resuming interrupted uploads.

**Request:**
```http
HEAD /api/v1/uploads/{upload_id}/chunks
Authorization: Bearer <token>
```

**Response (200 OK):**
```http
Upload-Offset: 10485760
Upload-Length: 15728640
Tus-Resumable: 1.0.0
```

**Error Responses:**
- `404` - Upload session not found
- `410` - Session expired

**Use Case:**
Client crashed and wants to resume upload from last successful chunk.

---

### 4. Cancel Upload

Cancel an upload session and clean up resources.

**Request:**
```http
DELETE /api/v1/uploads/{upload_id}
Authorization: Bearer <token>
```

**Response (204 No Content)**

**Error Responses:**
- `404` - Upload session not found

**Notes:**
- Deletes all Redis chunks
- Marks session as `failed`
- Cannot be undone

---

### 5. Complete Upload

Finalize upload, assemble chunks, encrypt, and upload to R2.

**Request:**
```http
POST /api/v1/uploads/{upload_id}/complete
Content-Type: application/json
Authorization: Bearer <token>

{
  "sha256": "abc123def456..." // SHA256 hash of original file
}
```

**Response (200 OK):**
```json
{
  "asset_id": "8f8e4c3a-2c9b-4c3a-8e7f-9a8b7c6d5e4f",
  "status": "committed",
  "storage_key": "workspaces/.../galleries/.../original/.../photo.jpg.enc",
  "file_size": 15728640,
  "sha256_hash": "abc123def456...",
  "thumbnail_url": "https://cdn.rawdrive.com/thumbnails/...",
  "processing_status": "queued"
}
```

**Error Responses:**
- `400` - Incomplete upload (missing chunks) or checksum mismatch
- `404` - Upload session not found
- `409` - Session already committed
- `410` - Session expired
- `503` - R2 storage unavailable (circuit breaker open)

**Processing Flow:**
1. Assemble chunks from Redis
2. Compute SHA256 checksum
3. Validate checksum matches provided hash
4. Encrypt file with AES-256-CTR
5. Upload to R2 (multipart for files > 10MB)
6. Create asset record in database
7. Publish Kafka event for async processing
8. Clean up Redis chunks
9. Return asset details

---

### 6. Check Duplicate

Check if a file with the same SHA256 hash already exists in the workspace.

**Request:**
```http
POST /api/v1/uploads/check-duplicate
Content-Type: application/json
Authorization: Bearer <token>
X-Workspace-ID: <workspace-id>

{
  "sha256": "abc123def456..."
}
```

**Response (200 OK):**
```json
{
  "duplicate_found": true,
  "assets": [
    {
      "asset_id": "...",
      "filename": "photo.jpg",
      "gallery_id": "...",
      "gallery_name": "Vacation 2024",
      "created_at": "2024-12-01T10:00:00Z",
      "thumbnail_url": "https://cdn.rawdrive.com/thumbnails/..."
    }
  ]
}
```

**Response (200 OK - No duplicates):**
```json
{
  "duplicate_found": false,
  "assets": []
}
```

**Use Case:**
Client can skip upload if file already exists in workspace.

---

## Health & Monitoring

### Health Check

**Request:**
```http
GET /health
```

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "upload-service",
  "version": "2.0.0"
}
```

---

### Liveness Probe

**Request:**
```http
GET /health/live
```

**Response (200 OK):**
```json
{
  "status": "alive"
}
```

**Notes:**
- No external dependencies checked
- Used by Kubernetes liveness probe
- Returns 200 if service process is running

---

### Readiness Probe

**Request:**
```http
GET /health/ready
```

**Response (200 OK):**
```json
{
  "status": "ready",
  "checks": {
    "database": "healthy",
    "redis": "healthy",
    "r2_storage": "healthy"
  }
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "not_ready",
  "checks": {
    "database": "healthy",
    "redis": "unhealthy",
    "r2_storage": "healthy"
  }
}
```

**Notes:**
- Checks all external dependencies
- Used by Kubernetes readiness probe
- Returns 503 if any dependency is unhealthy

---

### Metrics

**Request:**
```http
GET /metrics
```

**Response (200 OK):**
```
# HELP upload_concurrent_total Current number of concurrent uploads
# TYPE upload_concurrent_total gauge
upload_concurrent_total 42

# HELP upload_chunk_bytes_total Total bytes uploaded
# TYPE upload_chunk_bytes_total counter
upload_chunk_bytes_total 1048576000

# HELP upload_session_duration_seconds Upload session duration
# TYPE upload_session_duration_seconds histogram
upload_session_duration_seconds_bucket{le="1.0"} 1234
upload_session_duration_seconds_bucket{le="5.0"} 5678
upload_session_duration_seconds_sum 12345.67
upload_session_duration_seconds_count 9876

# HELP upload_errors_total Total upload errors
# TYPE upload_errors_total counter
upload_errors_total{type="validation"} 12
upload_errors_total{type="storage_quota"} 5
upload_errors_total{type="checksum_mismatch"} 2

# HELP upload_requests_total Total HTTP requests
# TYPE upload_requests_total counter
upload_requests_total{endpoint="/chunks",method="PATCH"} 12345
upload_requests_total{endpoint="/complete",method="POST"} 3456
```

**Notes:**
- Prometheus format
- Scraped by Prometheus every 10 seconds
- Used for KEDA autoscaling triggers

---

## Rate Limiting

**Global Limits:**
- 500 uploads/minute per workspace
- 10 concurrent uploads per workspace

**Endpoint-Specific:**
- `POST /uploads`: 100 requests/minute
- `PATCH /uploads/{id}/chunks`: 1000 requests/minute
- `POST /uploads/{id}/complete`: 50 requests/minute

**Response (429 Too Many Requests):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Please try again later.",
  "retry_after": 60
}
```

**Headers:**
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1736332200
Retry-After: 60
```

---

## Error Codes

| Code | Meaning | Typical Causes |
|------|---------|---------------|
| 400 | Bad Request | Invalid file metadata, incomplete upload, checksum mismatch |
| 401 | Unauthorized | Missing/invalid JWT token |
| 402 | Payment Required | Storage quota exceeded for workspace |
| 403 | Forbidden | User doesn't have access to workspace |
| 404 | Not Found | Upload session doesn't exist |
| 409 | Conflict | Offset mismatch, session already committed |
| 410 | Gone | Session expired (>24 hours) |
| 413 | Payload Too Large | Chunk size exceeds maximum, file too large |
| 429 | Too Many Requests | Rate limit exceeded |
| 503 | Service Unavailable | R2 storage unavailable (circuit breaker) |

---

## TUS Protocol Headers

**Request Headers:**
- `Tus-Resumable`: `1.0.0` (required for PATCH)
- `Upload-Offset`: Current byte offset (required for PATCH)
- `Upload-Length`: Total file size in bytes
- `Content-Type`: `application/offset+octet-stream` (for PATCH)

**Response Headers:**
- `Tus-Resumable`: `1.0.0`
- `Upload-Offset`: New byte offset after chunk upload
- `Tus-Extension`: `creation,termination,checksum,expiration`

---

## Example: Complete Upload Flow

```bash
# 1. Create session
curl -X POST http://localhost:8080/api/v1/uploads \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Workspace-ID: $WORKSPACE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "photo.jpg",
    "file_size": 10485760,
    "mime_type": "image/jpeg",
    "gallery_id": "'$GALLERY_ID'"
  }'

# Response:
# {
#   "upload_id": "abc-123",
#   "session_url": "/api/v1/uploads/abc-123/chunks",
#   "expires_at": "2026-01-09T10:30:00Z"
# }

# 2. Upload chunk 1 (bytes 0-5242879)
curl -X PATCH http://localhost:8080/api/v1/uploads/abc-123/chunks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Upload-Offset: 0" \
  -H "Tus-Resumable: 1.0.0" \
  -H "Content-Type: application/offset+octet-stream" \
  --data-binary @chunk1.bin

# Response: 204 No Content
# Upload-Offset: 5242880

# 3. Upload chunk 2 (bytes 5242880-10485759)
curl -X PATCH http://localhost:8080/api/v1/uploads/abc-123/chunks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Upload-Offset: 5242880" \
  -H "Tus-Resumable: 1.0.0" \
  -H "Content-Type: application/offset+octet-stream" \
  --data-binary @chunk2.bin

# Response: 204 No Content
# Upload-Offset: 10485760

# 4. Complete upload
curl -X POST http://localhost:8080/api/v1/uploads/abc-123/complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  }'

# Response: 200 OK
# {
#   "asset_id": "def-456",
#   "status": "committed",
#   "storage_key": "workspaces/.../photo.jpg.enc"
# }
```

---

## SDK Examples

### JavaScript/TypeScript

```typescript
import { TUSUploadClient } from '@rawdrive/upload-client';

const client = new TUSUploadClient({
  apiUrl: 'https://api.rawdrive.com',
  token: 'your-jwt-token',
  workspaceId: 'workspace-id'
});

// Upload file
const file = document.getElementById('file-input').files[0];

const upload = await client.createUpload({
  filename: file.name,
  file_size: file.size,
  mime_type: file.type,
  gallery_id: 'gallery-id'
});

// Upload with progress tracking
await client.uploadFile(upload.upload_id, file, {
  onProgress: (progress) => {
    console.log(`${progress.percent}% uploaded`);
  },
  onComplete: (asset) => {
    console.log('Upload complete:', asset.asset_id);
  },
  onError: (error) => {
    console.error('Upload failed:', error);
  }
});
```

### Python

```python
from rawdrive_sdk import UploadClient

client = UploadClient(
    api_url="https://api.rawdrive.com",
    token="your-jwt-token",
    workspace_id="workspace-id"
)

# Upload file
with open("photo.jpg", "rb") as f:
    upload = client.create_upload(
        filename="photo.jpg",
        file_size=f.seek(0, 2),
        mime_type="image/jpeg",
        gallery_id="gallery-id"
    )

    # Upload with progress
    asset = client.upload_file(
        upload_id=upload["upload_id"],
        file=f,
        on_progress=lambda p: print(f"{p['percent']}% uploaded")
    )

    print(f"Upload complete: {asset['asset_id']}")
```

---

## Changelog

### v2.0.0 (2026-01-08)
- **BREAKING**: Changed API paths from `/v1/upload/*` to `/v1/uploads/*`
- **BREAKING**: Renamed `/session` to root `/uploads` endpoint
- **BREAKING**: Changed `/chunk/{id}` to `/{id}/chunks`
- Added RESTful resource-based URLs
- Improved API consistency

### v1.0.0 (2025-12-01)
- Initial release
- TUS 1.0 protocol support
- AES-256 encryption
- KEDA autoscaling
