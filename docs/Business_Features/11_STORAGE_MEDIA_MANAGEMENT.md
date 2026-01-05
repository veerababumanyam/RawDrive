# Storage & Media Management

## Business Value Proposition

Storage & Media Management provides photographers with flexible storage options (managed Cloudflare R2 or BYOS), efficient media processing, and global content delivery through CDN integration.

### Key Business Benefits
- **Flexible Storage**: Managed storage or bring-your-own-storage (BYOS)
- **Global Delivery**: Fast content delivery via Cloudflare CDN
- **Efficient Processing**: Automatic image/video processing
- **RAW Support**: Professional RAW file format support
- **Security**: Encrypted storage and signed URL delivery

> **Reference Documentation**:
> - `docs/Features/STORAGE_AND_BACKUP.md` - Storage technical specification
> - `.kiro/steering/tech.md` - Technology stack

---

## Storage Options

### Managed Storage (Default)
- **Cloudflare R2**: S3-compatible object storage
- **Cloudflare CDN**: Global edge caching
- **Signed URLs**: 1-hour TTL for secure access
- **Encryption**: AES-256-GCM at rest

### BYOS Providers (Bring Your Own Storage)
| Provider | Status | Features |
|----------|--------|----------|
| Google Drive | Planned | OAuth, folder sync |
| Dropbox | Planned | OAuth, folder sync |
| AWS S3 | Planned | IAM credentials, bucket config |
| Azure Blob | Planned | SAS tokens, container config |

---

## Key Capabilities

### Upload Management

**Chunked Uploads**:
- TUS protocol for resumable uploads
- 5MB chunk size (configurable)
- Resume interrupted uploads
- Progress tracking

**Supported Formats**:
- **Images**: JPEG, PNG, WebP, HEIC, TIFF
- **RAW**: CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG
- **Video**: MP4, MOV, AVI, MKV

**Validation**:
- File type verification (magic bytes)
- Size limits per plan
- Malware scanning (planned)

### Media Processing

**Image Processing**:
- Thumbnail generation (150px, 300px)
- Web-optimized (1200px, 2400px)
- Full resolution preservation
- WebP conversion with fallback
- Watermark application

**RAW Processing**:
- Preview extraction
- Metadata extraction (EXIF, camera-specific)
- Color profile handling
- Thumbnail generation

**Video Processing**:
- Thumbnail extraction
- Preview generation
- Transcoding (planned)
- HLS streaming (planned)

### Metadata Extraction

**EXIF Data**:
- Camera make/model
- Lens information
- Exposure settings (ISO, aperture, shutter)
- Date/time captured
- GPS coordinates (if available)

**Camera-Specific**:
- Canon: CR2, CR3 metadata
- Nikon: NEF metadata
- Sony: ARW metadata
- Fujifilm: RAF metadata

### Content Delivery

**CDN Features**:
- Global edge caching
- Automatic format negotiation
- Responsive images
- Cache invalidation

**Signed URLs**:
- 1-hour TTL (configurable)
- IP restriction (optional)
- Download tracking

---

## Technical Architecture

### Backend Services

```
upload_service.py
├── Handle file uploads
├── Validate files
├── Store to R2/BYOS
└── Track upload progress

chunked_upload_service.py
├── TUS protocol implementation
├── Chunk management
├── Resume capability
└── Cleanup expired uploads

storage_service.py
├── Abstract storage providers
├── Upload/download/delete
├── List files
└── Get metadata

r2_storage_service.py
├── Cloudflare R2 integration
├── Signed URL generation
└── Bucket management

image_processing_service.py
├── Generate derivatives
├── Apply watermarks
├── Extract metadata
└── Convert formats

asset_processing_worker.py
├── Background processing queue
├── Job management
└── Retry logic
```

### API Endpoints

```
# Uploads
POST   /api/v1/uploads                    # Initiate upload
POST   /api/v1/uploads/chunked            # Initiate chunked upload
PATCH  /api/v1/uploads/chunked/{id}       # Upload chunk
POST   /api/v1/uploads/chunked/{id}/complete

# Media
GET    /api/v1/media/{id}                 # Get media details
GET    /api/v1/media/{id}/variants        # Get all variants
DELETE /api/v1/media/{id}                 # Delete media

# Storage
GET    /api/v1/storage/quota              # Get storage quota
GET    /api/v1/storage/usage              # Get usage details
POST   /api/v1/storage/signed-url         # Generate signed URL
```

### Database Schema

```sql
assets
├── id (UUID)
├── workspace_id (UUID)
├── gallery_id (UUID)
├── file_name (VARCHAR)
├── file_size (BIGINT)
├── file_type (VARCHAR)
├── mime_type (VARCHAR)
├── storage_provider (VARCHAR)
├── storage_path (VARCHAR)
├── storage_key (VARCHAR)
├── is_encrypted (BOOLEAN)
├── width (INTEGER)
├── height (INTEGER)
├── duration_seconds (INTEGER) - for video
├── metadata (JSONB) - EXIF data
├── created_at (TIMESTAMPTZ)
└── deleted_at (TIMESTAMPTZ)

asset_variants
├── id (UUID)
├── asset_id (UUID)
├── variant_type (VARCHAR) - 'thumbnail', 'web', 'full'
├── file_size (BIGINT)
├── width (INTEGER)
├── height (INTEGER)
├── storage_path (VARCHAR)
└── created_at (TIMESTAMPTZ)

upload_sessions
├── id (UUID)
├── workspace_id (UUID)
├── file_name (VARCHAR)
├── file_size (BIGINT)
├── status (VARCHAR)
├── chunks_total (INTEGER)
├── chunks_received (INTEGER)
├── expires_at (TIMESTAMPTZ)
└── metadata (JSONB)

storage_providers
├── id (UUID)
├── workspace_id (UUID)
├── provider_type (VARCHAR)
├── provider_config (JSONB) - encrypted
├── is_active (BOOLEAN)
├── is_default (BOOLEAN)
└── created_at (TIMESTAMPTZ)
```

---

## Scalability Considerations

- **Chunked Uploads**: Handle large files (10GB+)
- **Async Processing**: BullMQ for background jobs
- **CDN Delivery**: Global edge caching
- **Connection Pooling**: Efficient R2 connections

### Performance Targets
- Upload start: < 2 seconds
- Thumbnail generation: < 5 seconds
- CDN delivery: < 500ms globally

---

## Integration Points

- **Gallery Management**: Photos stored and served
- **Face Detection**: Faces detected in uploaded photos
- **AI Search**: Photos analyzed for metadata
- **Billing**: Storage quota based on plan

---

## Implementation Status

- Completed: R2 storage, chunked uploads, image processing, CDN delivery
- In Progress: RAW processing improvements
- Planned: BYOS providers, video streaming
