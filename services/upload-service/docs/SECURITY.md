# Upload Service Security Guide

## Security Overview

The upload-service implements multiple layers of security to protect user data and ensure SOC 2 / GDPR compliance.

**Security Features:**
- JWT authentication and workspace isolation
- AES-256-CTR encryption at rest
- SHA256 checksums for integrity
- Rate limiting to prevent abuse
- Input validation for all file uploads
- CORS protection
- TLS encryption in transit (via Traefik)

---

## Authentication & Authorization

### JWT Validation

**Token Requirements:**
```json
{
  "sub": "user-id",
  "wids": ["workspace-id-1", "workspace-id-2"],
  "exp": 1736332200
}
```

**Validation Steps:**
1. Verify token signature with shared `JWT_SECRET`
2. Check token not expired (`exp` claim)
3. Extract user ID from `sub` claim
4. Extract workspace IDs from `wids` claim
5. Verify `X-Workspace-ID` header in user's workspace list

**Public Endpoints (No Auth):**
- `GET /health`
- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `GET /docs`

### Workspace Isolation

**Critical: All queries MUST filter by workspace_id**

```python
# GOOD - Workspace isolated
result = await db.execute(
    select(Asset).where(
        Asset.workspace_id == workspace_id,
        Asset.id == asset_id
    )
)

# BAD - Cross-workspace data leak
result = await db.execute(
    select(Asset).where(Asset.id == asset_id)  # Missing workspace_id filter!
)
```

**Enforcement:**
- Middleware extracts `workspace_id` from JWT
- All repository methods require `workspace_id` parameter
- Database queries automatically filtered
- No cross-workspace access possible

---

## Encryption

### AES-256-CTR Encryption

**Algorithm**: AES-256 in Counter (CTR) mode
**Key Size**: 256 bits (32 bytes)
**IV Size**: 128 bits (16 bytes)
**Authentication**: HMAC-SHA256 (32 bytes)

**Encryption Flow:**
```
Original File → AES-256-CTR → Encrypted File
                    ↓
         [IV (16 bytes)] + [Encrypted Data] + [HMAC Tag (32 bytes)]
```

### Key Management

**Master Key:**
- Stored in HashiCorp Vault or AWS Secrets Manager
- 64-character hex string (32 bytes)
- Rotated annually
- Never logged or exposed in metrics

**Workspace Keys:**
- Derived from master key + workspace ID
- HKDF (HMAC-based Key Derivation Function)
- One key per workspace for isolation

**Key Derivation:**
```python
import hashlib
import hmac

def derive_workspace_key(master_key: bytes, workspace_id: str) -> bytes:
    return hmac.new(
        master_key,
        workspace_id.encode(),
        hashlib.sha256
    ).digest()
```

### Encryption Storage

**asset_encryption Table:**
```sql
CREATE TABLE asset_encryption (
    asset_id UUID PRIMARY KEY,
    encryption_algorithm VARCHAR(50) NOT NULL,  -- 'AES-256-CTR'
    iv BYTEA NOT NULL,  -- 16 bytes
    auth_tag BYTEA NOT NULL,  -- 32 bytes (HMAC)
    key_version INTEGER NOT NULL,  -- For key rotation
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Key Rotation

**Process:**
1. Generate new master key (v2)
2. Update `ENCRYPTION_KEY` environment variable
3. New uploads use key v2
4. Old files remain encrypted with key v1
5. Background job re-encrypts files with new key (optional)

**Configuration:**
```yaml
env:
  - name: ENCRYPTION_KEY
    valueFrom:
      secretKeyRef:
        name: upload-service-secret
        key: encryption-key
  - name: ENCRYPTION_KEY_VERSION
    value: "1"
```

---

## Input Validation

### File Type Whitelist

**Allowed Types:**
- **Images**: JPEG, PNG, WebP, HEIC, TIFF, GIF, AVIF, BMP
- **RAW**: CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG, PEF, RWL, SRW, X3F, 3FR
- **Videos**: MP4, MOV

**Validation Method:**
```python
ALLOWED_EXTENSIONS = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
    # ...
}

def validate_file_type(filename: str, mime_type: str) -> bool:
    extension = os.path.splitext(filename)[1].lower()
    allowed_exts = ALLOWED_EXTENSIONS.get(mime_type, [])
    return extension in allowed_exts
```

**Future Enhancement: Magic Byte Validation**
```python
# Validate first bytes match MIME type
JPEG_MAGIC = b'\xFF\xD8\xFF'
PNG_MAGIC = b'\x89\x50\x4E\x47'

def validate_magic_bytes(file_data: bytes, mime_type: str) -> bool:
    if mime_type == 'image/jpeg':
        return file_data.startswith(JPEG_MAGIC)
    elif mime_type == 'image/png':
        return file_data.startswith(PNG_MAGIC)
    # ...
```

### File Size Limits

**Enforced Limits:**
- Images: 100 MB
- RAW files: 200 MB
- Videos: 500 MB

**Chunk Size Limits:**
- Minimum: 1 MB
- Maximum: 10 MB
- Default: 5 MB

**Enforcement:**
```python
MAX_FILE_SIZES = {
    'image/*': 104857600,  # 100 MB
    'image/x-raw': 209715200,  # 200 MB
    'video/*': 524288000,  # 500 MB
}

if file_size > MAX_FILE_SIZES.get(mime_category):
    raise ValidationError("File too large")
```

### Filename Sanitization

**Remove dangerous characters:**
```python
import re

def sanitize_filename(filename: str) -> str:
    # Remove path traversal attempts
    filename = os.path.basename(filename)

    # Allow only alphanumeric, dash, underscore, period
    filename = re.sub(r'[^\w\-\.]', '_', filename)

    # Limit length
    if len(filename) > 255:
        name, ext = os.path.splitext(filename)
        filename = name[:250] + ext

    return filename
```

---

## Rate Limiting

### Workspace-Level Limits

**Configuration:**
```yaml
env:
  - name: RATE_LIMIT_UPLOADS_PER_MINUTE
    value: "500"
  - name: CONCURRENT_UPLOADS_PER_WORKSPACE
    value: "10"
```

**Implementation (Redis):**
```python
# Key: rate_limit:{workspace_id}:uploads
# Value: count
# TTL: 60 seconds

async def check_rate_limit(workspace_id: str) -> bool:
    key = f"rate_limit:{workspace_id}:uploads"
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, 60)  # Set TTL
    return count <= RATE_LIMIT_UPLOADS_PER_MINUTE
```

### Endpoint-Specific Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /uploads` | 100 req/min | Sliding 1min |
| `PATCH /uploads/{id}/chunks` | 1000 req/min | Sliding 1min |
| `POST /uploads/{id}/complete` | 50 req/min | Sliding 1min |

### DDoS Protection (Traefik)

**IP-based rate limiting:**
```yaml
# infrastructure/docker/traefik/dynamic.yaml
middlewares:
  rate-limit-uploads:
    rateLimit:
      average: 100
      burst: 200
      period: 1s
      sourceCriterion:
        ipStrategy:
          depth: 1  # Trust X-Forwarded-For
```

---

## CORS Protection

### Allowed Origins

**Production:**
```yaml
CORS_ORIGINS: "https://app.rawdrive.com,https://rawdrive.com"
```

**Development:**
```yaml
CORS_ORIGINS: "http://localhost:3000,http://localhost:5173"
```

### CORS Configuration

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS.split(','),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "HEAD", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Upload-Offset", "Tus-Resumable"],
)
```

### TUS Protocol Headers

**Required for TUS:**
- `Access-Control-Expose-Headers`: `Upload-Offset, Tus-Resumable`
- `Access-Control-Allow-Methods`: `PATCH, HEAD`
- `Access-Control-Allow-Headers`: `Upload-Offset, Content-Type`

---

## Data Integrity

### SHA256 Checksums

**Client Calculation:**
```javascript
const file = document.getElementById('file-input').files[0];
const arrayBuffer = await file.arrayBuffer();
const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
```

**Server Verification:**
```python
import hashlib

hash_obj = hashlib.sha256()
async for chunk in assemble_chunks(upload_id):
    hash_obj.update(chunk)

computed_hash = hash_obj.hexdigest()
if computed_hash != provided_sha256:
    raise ChecksumMismatchError
```

**Storage:**
```sql
CREATE INDEX idx_assets_sha256 ON assets(workspace_id, sha256_hash);
```

---

## GDPR Compliance

### Data Minimization

**Only collect necessary data:**
- Filename (sanitized)
- File size
- MIME type
- SHA256 hash
- Workspace ID
- Upload timestamps

**Do NOT collect:**
- User's real name
- Email address
- IP address (beyond rate limiting)
- Location data

### Right to Delete

**Delete asset and encryption data:**
```python
async def delete_asset(asset_id: UUID, workspace_id: UUID):
    # 1. Delete from R2
    await r2_storage.delete_object(storage_key)

    # 2. Delete encryption metadata
    await db.execute(
        delete(AssetEncryption).where(
            AssetEncryption.asset_id == asset_id
        )
    )

    # 3. Delete asset record
    await db.execute(
        delete(Asset).where(
            Asset.id == asset_id,
            Asset.workspace_id == workspace_id
        )
    )

    # 4. Delete from cache
    await redis.delete(f"asset:{asset_id}")
```

### Right to Export

**Export user data:**
```python
async def export_assets(workspace_id: UUID) -> List[Dict]:
    assets = await db.execute(
        select(Asset).where(Asset.workspace_id == workspace_id)
    )
    return [
        {
            'asset_id': asset.id,
            'filename': asset.filename,
            'file_size': asset.file_size,
            'created_at': asset.created_at.isoformat(),
            'sha256_hash': asset.sha256_hash,
        }
        for asset in assets
    ]
```

### Data Retention

**Automatic cleanup:**
```python
# Delete expired upload sessions (> 24 hours)
await db.execute(
    delete(UploadSession).where(
        UploadSession.expires_at < datetime.utcnow()
    )
)

# Delete abandoned uploads (> 7 days)
await db.execute(
    delete(UploadSession).where(
        UploadSession.status == 'created',
        UploadSession.created_at < datetime.utcnow() - timedelta(days=7)
    )
)
```

---

## SOC 2 Compliance

### Logging & Auditing

**Audit Log Events:**
- Upload session created
- File uploaded successfully
- Upload failed (with reason)
- Asset deleted
- Encryption key rotated

**Log Format:**
```json
{
  "timestamp": "2026-01-08T10:30:00Z",
  "event": "asset.uploaded",
  "user_id": "user-123",
  "workspace_id": "workspace-456",
  "asset_id": "asset-789",
  "filename": "photo.jpg",
  "file_size": 1048576,
  "ip_address_hash": "sha256(ip)",  // Hashed for privacy
  "user_agent": "Mozilla/5.0..."
}
```

### Access Control

**Service Account Permissions:**
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: upload-service
rules:
  - apiGroups: [""]
    resources: ["secrets", "configmaps"]
    verbs: ["get"]  # Read-only
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]  # For health checks
```

### Encryption in Transit

**TLS Configuration (Traefik):**
```yaml
tls:
  options:
    default:
      minVersion: VersionTLS12
      cipherSuites:
        - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
        - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
```

---

## Security Best Practices Checklist

- [ ] JWT secret stored in Vault/Secrets Manager
- [ ] Encryption master key rotated annually
- [ ] All queries filtered by workspace_id
- [ ] File type whitelist enforced
- [ ] File size limits enforced
- [ ] Filename sanitization implemented
- [ ] Rate limiting configured
- [ ] CORS origins restricted
- [ ] SHA256 checksums verified
- [ ] TLS enabled for all external traffic
- [ ] Secrets not logged or exposed in metrics
- [ ] PII filtered from logs
- [ ] Audit logging enabled
- [ ] Regular security scans (Trivy, Snyk)
- [ ] Penetration testing completed

---

## Security Incident Response

### Suspected Data Breach

1. **Immediate Actions:**
   - Rotate JWT secret
   - Rotate encryption master key
   - Review access logs for suspicious activity
   - Disable affected user accounts

2. **Investigation:**
   - Check database audit logs
   - Review application logs
   - Analyze network traffic
   - Identify scope of breach

3. **Remediation:**
   - Patch vulnerability
   - Re-encrypt affected files
   - Notify affected users (GDPR requirement)

### Suspected Unauthorized Access

1. **Verify:**
   - Check JWT token validity
   - Review workspace access logs
   - Check for token replay attacks

2. **Mitigate:**
   - Revoke compromised tokens
   - Force re-authentication
   - Increase rate limiting temporarily

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Encryption pipeline details
- [API.md](API.md) - Authentication requirements
- [DEPLOYMENT.md](DEPLOYMENT.md) - Secrets management
