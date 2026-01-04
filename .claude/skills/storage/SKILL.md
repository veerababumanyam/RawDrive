---
name: storage
aliases: [uploads, r2, byos, s3, files, assets, object-storage]
description: Storage and upload patterns for RawDrive. Use when implementing file uploads, working with R2/BYOS storage, or managing assets.
---

# Storage & Uploads

## Storage Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `managed_r2` | Cloudflare R2 (default) | Standard workspaces |
| `byos_s3` | Customer S3-compatible bucket | Enterprise governance |

## Storage Key Format

**CRITICAL**: All objects MUST include workspace_id prefix.

```
workspaces/{workspace_id}/assets/{asset_id}/original/{filename}
workspaces/{workspace_id}/assets/{asset_id}/derived/{variant}/{filename}
workspaces/{workspace_id}/avatars/{user_id}/{filename}
workspaces/{workspace_id}/invitations/{invitation_id}/{filename}
```

## Upload Flow (Resumable)

### 1. Create Upload Session

```typescript
// Frontend
const session = await api.post(`/v1/workspaces/${workspaceId}/uploads`, {
  file_name: file.name,
  mime_type: file.type,
  size_bytes: file.size,
  sha256: await computeSha256(file),  // Optional at creation
  library_id: libraryId,
  folder_id: folderId,                // Optional
  resumable_protocol: 'tus',          // or 's3_multipart'
});

// Response
{
  upload_id: "uuid",
  provider: "r2" | "byos",
  upload_url: "https://...",
  headers: { "X-Custom-Header": "value" },
  expires_at: "2024-01-01T12:00:00Z"
}
```

### 2. Upload to Storage (Direct)

```typescript
// Using TUS protocol
import { Upload } from 'tus-js-client';

const upload = new Upload(file, {
  endpoint: session.upload_url,
  headers: session.headers,
  chunkSize: 5 * 1024 * 1024, // 5MB chunks
  retryDelays: [0, 1000, 3000, 5000],
  onProgress: (bytesUploaded, bytesTotal) => {
    setProgress((bytesUploaded / bytesTotal) * 100);
  },
  onSuccess: () => commitUpload(),
  onError: (error) => handleError(error),
});

upload.start();
```

### 3. Commit Upload

```typescript
const result = await api.post(
  `/v1/workspaces/${workspaceId}/uploads/${session.upload_id}/commit`,
  { sha256: checksum, etag: etag }
);

// Response
{
  asset_id: "uuid",
  status: "available" | "processing"
}
```

## Upload Session States

| State | Description |
|-------|-------------|
| `created` | Session initialized |
| `uploading` | Bytes being uploaded |
| `verifying` | Checksum verification |
| `committed` | Upload complete |
| `aborted` | Cancelled |
| `expired` | Timed out |

## Supported Formats

| Type | Extensions | Max Size |
|------|------------|----------|
| Photos | jpg, jpeg, png, webp, heic, heif, raw, cr2, nef, arw | 100MB |
| Videos | mp4, mov, avi, mkv | 500MB |
| Documents | pdf | 50MB |

## Frontend Validation

```typescript
const ALLOWED_PHOTO_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'image/heic', 'image/heif'
];
const MAX_PHOTO_SIZE = 100 * 1024 * 1024; // 100MB

const validateFile = (file: File): string | null => {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    return 'Unsupported file type';
  }
  if (file.size > MAX_PHOTO_SIZE) {
    return 'File too large. Maximum 100MB';
  }
  return null;
};

// Compute SHA256 for integrity verification
const computeSha256 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};
```

## Backend Upload Handling

```python
# upload_service.py
from uuid import UUID
from app.models import UploadSession, Asset
from app.storage import StorageProvider

class UploadService:
    def __init__(self, storage: StorageProvider, repo: UploadRepository):
        self.storage = storage
        self.repo = repo

    async def create_session(
        self,
        workspace_id: UUID,
        file_name: str,
        mime_type: str,
        size_bytes: int,
        library_id: UUID,
    ) -> UploadSession:
        # Generate presigned URL
        object_key = f"workspaces/{workspace_id}/uploads/{uuid4()}/{file_name}"
        presigned = await self.storage.create_presigned_upload(
            key=object_key,
            content_type=mime_type,
            expires_in=3600,  # 1 hour
        )

        session = UploadSession(
            workspace_id=workspace_id,
            file_name=file_name,
            mime_type=mime_type,
            size_bytes=size_bytes,
            object_key=object_key,
            upload_url=presigned.url,
            headers=presigned.headers,
            state="created",
            expires_at=datetime.utcnow() + timedelta(hours=1),
        )
        return await self.repo.create(session)

    async def commit(
        self,
        session_id: UUID,
        sha256: str,
        etag: str,
    ) -> Asset:
        session = await self.repo.get(session_id)
        if session.state != "created":
            raise ValueError(f"Invalid state: {session.state}")

        # Verify upload exists in storage
        metadata = await self.storage.head_object(session.object_key)
        if not metadata:
            raise ValueError("Upload not found in storage")

        # Verify checksum
        if sha256 and metadata.sha256 != sha256:
            raise ValueError("Checksum mismatch")

        # Create asset
        asset = Asset(
            workspace_id=session.workspace_id,
            original_object_key=session.object_key,
            sha256=sha256,
            mime_type=session.mime_type,
            original_bytes=session.size_bytes,
            status="processing",
        )
        await self.asset_repo.create(asset)

        # Update session
        session.state = "committed"
        await self.repo.update(session)

        # Trigger processing
        process_asset.delay(asset_id=asset.id)

        return asset
```

## BYOS Configuration

```python
# Storage profile for BYOS
class StorageProfile(BaseModel):
    storage_profile_id: UUID
    workspace_id: UUID
    mode: Literal["managed_r2", "byos_s3"]
    bucket: str
    endpoint: str | None = None  # Custom S3 endpoint
    region: str | None = None
    key_prefix: str  # Must include workspace_id
    credentials_ref: str  # Reference to encrypted secrets
    encryption: Literal["none", "sse_s3", "sse_kms"] = "sse_s3"

# BYOS IAM minimum permissions
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": ["s3:ListBucket"],
            "Resource": "arn:aws:s3:::customer-bucket"
        },
        {
            "Effect": "Allow",
            "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            "Resource": "arn:aws:s3:::customer-bucket/workspaces/{workspace_id}/*"
        }
    ]
}
```

## Presigned URLs

```python
# Generate presigned download URL
async def get_download_url(asset: Asset, expires_in: int = 3600) -> str:
    return await storage.create_presigned_download(
        key=asset.original_object_key,
        expires_in=expires_in,
        content_disposition=f'attachment; filename="{asset.filename}"',
    )

# Generate presigned URL for derived image
async def get_thumbnail_url(asset: Asset, variant: str = "thumb") -> str:
    derived_key = f"workspaces/{asset.workspace_id}/assets/{asset.id}/derived/{variant}/image.webp"
    return await storage.create_presigned_download(
        key=derived_key,
        expires_in=3600,
    )
```

## Asset Processing Pipeline

```python
# Celery task
@celery.task
def process_asset(asset_id: UUID):
    asset = Asset.get(asset_id)

    # 1. Verify magic bytes
    if not verify_magic_bytes(asset):
        asset.status = "failed"
        return

    # 2. Extract EXIF
    exif = extract_exif(asset)
    asset.exif = exif

    # 3. Generate thumbnails
    generate_thumbnails(asset, variants=["thumb", "medium", "large"])

    # 4. Queue AI analysis
    queue_ai_analysis.delay(asset_id=asset.id)

    asset.status = "available"
    asset.save()

    # Emit event
    publish_event("asset.created", {
        "workspace_id": str(asset.workspace_id),
        "asset_id": str(asset.id),
    })
```

## Cleanup & Lifecycle

```python
# Expire stale upload sessions
@celery.task
def cleanup_expired_sessions():
    expired = UploadSession.filter(
        state="created",
        expires_at__lt=datetime.utcnow()
    )
    for session in expired:
        # Delete orphaned object from storage
        await storage.delete_object(session.object_key)
        session.state = "expired"
        session.save()

# Soft delete asset
async def delete_asset(asset: Asset):
    asset.status = "deleted"
    asset.deleted_at = datetime.utcnow()
    await asset.save()

    # Schedule hard delete after retention period
    hard_delete_asset.apply_async(
        args=[asset.id],
        countdown=30 * 24 * 60 * 60  # 30 days
    )
```

## Error Handling

```python
class UploadError(Exception):
    """Base upload error"""

class FileTooLargeError(UploadError):
    """File exceeds size limit"""

class UnsupportedTypeError(UploadError):
    """File type not allowed"""

class ChecksumMismatchError(UploadError):
    """SHA256 doesn't match"""

class StorageError(UploadError):
    """Storage provider error"""
```
