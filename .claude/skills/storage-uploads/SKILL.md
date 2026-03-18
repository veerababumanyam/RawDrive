---
name: storage-uploads
description: "File storage and upload patterns for RawDrive: Cloudflare R2 (S3-compatible), TUS resumable uploads, presigned URLs, image processing pipeline, and asset management. Use this skill when implementing file uploads, generating presigned URLs, working with R2/S3 storage, processing images (thumbnails, watermarks), or managing the asset pipeline. Also use for download policies, LQIP generation, or the upload-service. Triggers on: upload, file upload, R2, S3, presigned URL, TUS, resumable upload, thumbnail, watermark, image processing, asset pipeline, storage, download."
---

# Storage & Upload Patterns

RawDrive uses Cloudflare R2 (S3-compatible) for object storage with TUS protocol for resumable uploads.

## Upload Flow

```
Client Browser
    ↓ TUS Protocol (resumable)
Upload Service (port 8008)
    ↓ Store to R2
Cloudflare R2 Bucket
    ↓ Event: ASSET_UPLOADED
AI Processing Service
    ↓ Generate thumbnails, embeddings, tags
Asset Record in PostgreSQL
```

## Presigned URLs

```python
import boto3
from app.config import settings

s3_client = boto3.client(
    "s3",
    endpoint_url=settings.R2_ENDPOINT_URL,
    aws_access_key_id=settings.R2_ACCESS_KEY_ID,
    aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
)

# Generate presigned GET URL (for viewing)
def get_presigned_url(key: str, expires_in: int = 3600) -> str:
    return s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.R2_BUCKET_NAME, "Key": key},
        ExpiresIn=expires_in,  # Max 1 hour
    )

# Generate presigned POST URL (for direct browser upload)
def get_upload_url(key: str, content_type: str, max_size: int) -> dict:
    return s3_client.generate_presigned_post(
        Bucket=settings.R2_BUCKET_NAME,
        Key=key,
        Conditions=[
            ["content-length-range", 1, max_size],
            {"Content-Type": content_type},
        ],
        ExpiresIn=3600,
    )
```

## Storage Key Convention

```
{workspace_id}/
├── originals/      # Full-resolution uploads
│   └── {asset_id}/{filename}
├── thumbnails/     # Generated thumbnails
│   └── {asset_id}/
│       ├── 200x200.webp
│       ├── 800x800.webp
│       └── 1200x1200.webp
├── watermarked/    # Watermarked versions
│   └── {asset_id}/{filename}
└── exports/        # Client downloads, albums
    └── {export_id}/{filename}
```

Always namespace by `workspace_id` for tenant isolation in storage too.

## Download Policies

Each share link has a download policy:

| Policy | Behavior |
|--------|----------|
| `view_only` | No downloads allowed |
| `web_only` | Web-resolution only (max 2048px) |
| `watermarked_only` | Download with watermark overlay |
| `original_allowed` | Full original resolution |

```python
async def get_download_url(asset_id: UUID, share_link: ShareLink) -> str:
    match share_link.download_policy:
        case "view_only":
            raise HTTPException(403, "Downloads not allowed")
        case "web_only":
            key = f"{workspace_id}/thumbnails/{asset_id}/1200x1200.webp"
        case "watermarked_only":
            key = f"{workspace_id}/watermarked/{asset_id}/{filename}"
        case "original_allowed":
            key = f"{workspace_id}/originals/{asset_id}/{filename}"
    return get_presigned_url(key)
```

## Security Rules

- R2 buckets: NEVER public-read
- All access via presigned URLs with short TTLs
- Validate file types server-side (don't trust `Content-Type` header)
- Scan for malicious content before processing
- Enforce per-workspace storage quotas

**Deep dive:** Read `.claude/reference/storage-upload-best-practices.md`
