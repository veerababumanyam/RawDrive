# FaceID Feature Flow Documentation

**Version:** 0.3.6
**Last Updated:** 2026-02-08
**Status:** Production

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Upload & Face Detection Flow](#1-upload--face-detection-flow)
4. [Gallery Face Management](#2-gallery-face-management)
5. [Public Gallery Face Search](#3-public-gallery-face-search)
6. [Download Flow](#4-download-flow)
7. [Security & Privacy](#security--privacy)
8. [Database Schema](#database-schema)
9. [API Reference](#api-reference)
10. [Configuration](#configuration)

---

## Overview

The FaceID feature enables users to:
- Automatically detect faces in uploaded photos
- Cluster similar faces into groups representing the same person
- Search photos by face similarity (client-side and public)
- Allow public gallery visitors to find their photos using face identification

**Privacy-First Design:**
- Face detection can run client-side (face-api.js)
- Only embedding vectors (512 floats) are stored, never face images
- Embeddings are hashed for logging, never linked to identity
- Multi-tenant workspace isolation enforced everywhere

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FACEID ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐      ┌──────────────┐      ┌─────────────────────────┐   │
│  │   Upload    │──────▶│ Face Detection│──────▶│   Face Embedding        │   │
│  │   Service   │      │   Worker     │      │   (pgvector/Milvus)     │   │
│  └─────────────┘      └──────────────┘      └─────────────────────────┘   │
│                                │                        │                   │
│                                ▼                        ▼                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         PostgreSQL Database                           │  │
│  │  ┌──────────┐  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │  faces   │  │ face_groups │  │face_assignments│ │   assets    │  │  │
│  │  └──────────┘  └─────────────┘  └──────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                │                                           │
│                                ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         API Layer                                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │  │
│  │  │/faces/*      │  │/face-groups/*│  │/public/galleries/*/    │  │  │
│  │  │              │  │              │  │  face-search           │  │  │
│  │  └──────────────┘  └──────────────┘  └─────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                │                                           │
│                                ▼                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         Frontend (Client)                             │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────┐ │  │
│  │  │  face-api.js     │  │ FaceDiscovery    │  │  Face Tagging      │ │  │
│  │  │  (client-side    │  │  Component       │  │  Overlay           │ │  │
│  │  │   detection)    │  │                  │  │                    │ │  │
│  │  └──────────────────┘  └──────────────────┘  └────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Upload & Face Detection Flow

### 1.1 Upload Session Creation

**File:** `backend/src/app/services/upload_service.py`

```
User uploads photo
        ↓
POST /api/v1/workspaces/{workspace_id}/uploads
        ↓
create_upload_session(workspace_id, gallery_id, filename, ...)
        ↓
Validate file type and size
        ↓
Check storage limit
        ↓
Generate upload session in database
        ↓
Return upload_url and expires_at
```

### 1.2 Upload Processing

```
File uploaded to R2 (direct or proxy)
        ↓
process_proxy_upload() / process_large_upload()
        ↓
Create asset record:
    - asset_id (UUID)
    - workspace_id, gallery_id
    - original_object_key
    - status = 'processing'
        ↓
Encrypt and store original file
        ↓
Enqueue background jobs:
    - asset.process (thumbnail generation)
    - asset.extract_metadata (EXIF, dimensions, GPS)
    - face_detection (face detection + embedding) ⭐
    - content_detection (AI tagging)
        ↓
Update asset status → 'active'
```

### 1.3 Face Detection Job

**File:** `backend/src/app/services/face_detection_service.py`

```python
# Queued job payload (line 789-803 in upload_service.py)
{
    "task_type": "face_detection",
    "payload": {
        "photo_id": str(asset_id),
        "workspace_id": str(workspace_id),
        "priority": 0,
        "client_metadata": {...}
    },
    "priority": TaskPriority.NORMAL,
    "max_retries": 3
}
```

**Background Worker Processing:**

```
Face Detection Worker
        ↓
Fetch asset from storage
        ↓
Call AI Provider (Cloud Vision)
        ↓
Parse response:
    - Bounding boxes (x, y, width, height as %)
    - Detection confidence (0-1)
    - Landmarks (optional)
    - Blurriness/underexposed flags
        ↓
Generate 512-dim face embedding
        ↓
Crop and generate face thumbnails (small/medium/large)
        ↓
Store in faces table:
    - id, workspace_id, photo_id
    - bounding_box (JSONB)
    - confidence (DECIMAL)
    - embedding (vector(512))
    - provider (cloud_vision)
    - thumbnail_urls (JSONB)
        ↓
Trigger auto-clustering (if enabled)
```

### 1.4 Auto-Clustering

**File:** `backend/src/app/services/face_cluster_service.py`

```
Face detected with embedding
        ↓
Calculate cosine similarity to existing face group centroids
        ↓
If similarity ≥ threshold (0.85):
    Assign to existing group
    Update group centroid
    Increment face_count
        ↓
Else (no match):
    Create new face group
    Set centroid = face embedding
    Set representative_face_id = this face
    face_count = 1
```

---

## 2. Gallery Face Management

### 2.1 List Faces in Gallery

**Endpoint:** `GET /api/v1/galleries/{gallery_id}/faces`

**File:** `backend/src/app/api/v1/faces.py:89`

```python
# Response
{
    "data": [
        {
            "id": "uuid",
            "photo_id": "uuid",
            "face_group_id": "uuid | null",
            "bounding_box": {"x": 10.5, "y": 20.3, "width": 15.2, "height": 18.7},
            "confidence": 0.95,
            "thumbnail_urls": {"small": "...", "medium": "...", "large": "..."},
            "created_at": "2026-01-23T10:00:00Z"
        }
    ],
    "meta": {
        "page": 1,
        "limit": 50,
        "total": 123,
        "total_pages": 3
    }
}
```

### 2.2 List Face Groups in Gallery

**Endpoint:** `GET /api/v1/workspaces/{workspace_id}/face-groups/gallery/{gallery_id}`

**File:** `backend/src/app/api/v1/face_groups.py:170`

```python
# Response
{
    "data": [
        {
            "id": "uuid",
            "name": "John Doe" | null,  # User-assigned name
            "person_id": "uuid | null",
            "representative_face_id": "uuid",
            "representative_thumbnail_url": "https://...",
            "face_count": 45,
            "gallery_photo_count": 23,  # Photos in this gallery
            "gallery_face_count": 28,   # Total faces in this gallery
            "created_at": "2026-01-23T10:00:00Z"
        }
    ],
    "meta": {
        "page": 1,
        "limit": 50,
        "total": 12,
        "total_pages": 1
    }
}
```

### 2.3 Face Group Operations

#### Merge Face Groups

**Endpoint:** `POST /api/v1/face-groups/merge`

```python
# Request
{
    "source_group_id": "uuid",
    "target_group_id": "uuid"
}

# Result
# - All faces from source reassigned to target
# - Source group deleted
# - Target group centroid recalculated
```

#### Multi-Merge Face Groups

**Endpoint:** `POST /api/v1/workspaces/{workspace_id}/face-groups/multi-merge`

```python
# Request
{
    "source_group_ids": ["uuid1", "uuid2", "uuid3"],
    "target_group_id": "uuid4",
    "representative_face_id": "uuid | null",
    "name": "Merged Person Name | null"
}

# Result
# - All faces from sources reassigned to target
# - All source groups deleted
# - Target group updated with new name/representative
# - Audit log entry created (SOC2 compliance)
```

#### Split Face Group

**Endpoint:** `POST /api/v1/face-groups/{group_id}/split`

```python
# Request
{
    "face_ids": ["uuid1", "uuid2"],
    "new_group_name": "Different Person | null"
}

# Result
# - Specified faces moved to new group
# - Both group centroids recalculated
```

#### Name Face Group

**Endpoint:** `PUT /api/v1/workspaces/{workspace_id}/face-groups/{group_id}/name`

```python
# Request
{
    "person_id": "uuid | null",      # Link to existing person
    "person_name": "Jane Doe | null"  # Create new person
}

# Result
# - Face group linked to person
# - Enables search by person name
```

---

## 3. Public Gallery Face Search

### 3.1 Privacy-First Client-Side Detection

**Frontend Component:** `frontend/src/components/features/gallery/FaceDiscovery.tsx`

```
Public visitor opens gallery
        ↓
Click "Find Your Photos" button
        ↓
Grant camera permission
        ↓
Take selfie OR upload reference photo
        ↓
Client-side face detection (face-api.js):
    - DetectAllFaces() on reference image
    - Select largest/best quality face
    - ComputeFaceDescriptors() → 128-dim embedding
    - Normalize embedding (L2 norm = 1)
        ↓
Convert to 512-dim (if using ArcFace) or pad 128-dim
        ↓
Send to server for matching
```

### 3.2 Server-Side Similarity Search

**Endpoint:** `POST /api/v1/public/galleries/{gallery_id}/face-search`

**File:** `backend/src/app/api/v1/public_galleries.py:374-480`

#### Request Schema

```python
class FaceSearchRequest(BaseModel):
    embedding: list[float] = Field(..., min_length=128, max_length=512)
    threshold: float = Field(default=0.6, ge=0.0, le=1.0)
    limit: int = Field(default=50, ge=1, le=100)
```

#### Security Checks (in order)

```python
# 1. Verify gallery exists and is public (line 406-429)
response = await httpx.get(f"{GALLERY_SERVICE_URL}/api/v1/public/galleries/{gallery_id}")

# 2. Check face_search_enabled flag (line 432-437)
if not gallery.get("face_search_enabled", True):
    raise AppError("Face search is not available for this gallery")

# 3. Enforce biometric consent (COM-001) (line 443-444)
await consent_service.check_public_search_consent(workspace_id)

# 4. Apply rate limiting (SEC-001) (line 447-448)
await check_face_search_rate_limit(workspace_id, rate_limit_repo)
```

#### Similarity Query (pgvector)

```sql
-- From face_embedding_repository.py:364-388
SELECT DISTINCT ON (f.photo_id)
    f.photo_id as asset_id,
    1 - (f.embedding <=> $1) as similarity,
    f.id as face_id,
    f.thumbnail_urls
FROM faces f
JOIN gallery_assets ga ON f.photo_id = ga.asset_id
JOIN assets a ON ga.asset_id = a.asset_id
WHERE ga.gallery_id = $2
AND ga.workspace_id = $3
AND ga.visible = TRUE
AND a.deleted = FALSE
AND f.embedding IS NOT NULL
AND (f.embedding <=> $1) <= $4  -- Max distance = 1 - threshold
ORDER BY f.photo_id, f.embedding <=> $1 ASC
LIMIT $5
```

**Key Points:**
- Uses pgvector cosine distance operator (`<=>`)
- `1 - distance` = similarity (0-1)
- `DISTINCT ON (photo_id)` ensures one result per photo
- Filters by `visible=TRUE` and `deleted=FALSE`
- Respects workspace isolation

#### Response Schema

```python
class FaceSearchMatch(BaseModel):
    photo_id: str
    similarity: float  # 0.0 to 1.0
    thumbnail_url: str

class FaceSearchResponse(BaseModel):
    matches: list[FaceSearchMatch]
    total_searched: int  # Total faces in gallery
    query_time_ms: float
```

**Example Response:**

```json
{
    "matches": [
        {
            "photo_id": "550e8400-e29b-41d4-a716-446655440000",
            "similarity": 0.92,
            "thumbnail_url": "/api/v1/public/galleries/abc-123/assets/550e8400.../thumbnail"
        },
        {
            "photo_id": "660e8400-e29b-41d4-a716-446655440001",
            "similarity": 0.87,
            "thumbnail_url": "/api/v1/public/galleries/abc-123/assets/660e8400.../thumbnail"
        }
    ],
    "total_searched": 1234,
    "query_time_ms": 45.2
}
```

---

## 4. Download Flow

### 4.1 Important Clarification

**There is NO direct "download using faceid" endpoint.**

The flow is:
```
Face Search Results → Select Photos → Download via Standard Gallery API
```

### 4.2 Download Options

After finding photos via face search, users can:

#### Mark Favorites

**Endpoint:** `POST /api/v1/public/galleries/{gallery_id}/assets/{asset_id}/favorite`

```python
# Request
{
    "favorited": true,
    "visitor_id": "uuid | null"  # Optional visitor tracking
}
```

#### Mark for Selection (Picks)

**Endpoint:** `POST /api/v1/public/galleries/{gallery_id}/assets/{asset_id}/selection`

```python
# Request
{
    "selected": true,
    "visitor_id": "uuid | null"
}
```

#### Get Filtered Assets

**Endpoint:** `GET /api/v1/public/galleries/{gallery_id}/assets/filtered`

```python
# Query params:
# - filter_type: "favorites" | "selections" | null
# - sub_gallery_id: uuid | null
# - emotion: "joy" | "sadness" | "anger" | "surprise" | "fear" | "disgust" | "contentment"
# - min_emotion_confidence: 0.0 - 1.0 (default 0.7)
```

### 4.3 Download Endpoints

**Endpoint:** `GET /api/v1/public/galleries/{gallery_id}/assets/{asset_id}/{variant}`

**File:** `backend/src/app/api/v1/public_galleries.py:344-371`

**Variants:**
- `thumbnail` - Small preview
- `preview` - Medium quality for viewing
- `original` - Full resolution (subject to download policy)

**Download Policy Enforcement:**

```python
# Gallery download policy check
policy = gallery.download_policy  # From gallery metadata

if policy == "view_only":
    raise AppError("Downloads not allowed")
elif policy == "web_only":
    return web_quality_variant
elif policy == "watermarked_only":
    return watermarked_variant
elif policy == "original_allowed":
    return original_variant
```

---

## Security & Privacy

### Biometric Consent System

**Table:** `workspace_biometric_settings`

```sql
CREATE TABLE workspace_biometric_settings (
    workspace_id UUID PRIMARY KEY,
    consent_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    face_detection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    public_face_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    consented_at TIMESTAMP WITH TIME ZONE,
    consent_ip VARCHAR(45),
    consent_user_agent TEXT,
    withdrawn_at TIMESTAMP WITH TIME ZONE,
    withdrawal_reason TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Consent States:**
- `pending` - Not yet granted
- `granted` - User has consented
- `withdrawn` - User revoked consent

**Consent Requirements:**
- **GDPR Article 9** - Explicit consent for biometric processing
- **COM-001** - Public face search requires granted consent
- Face detection disabled if consent withdrawn
- Optional cascade delete on withdrawal (all embeddings deleted)

### Rate Limiting

**File:** `backend/src/app/api/dependencies/face_rate_limit.py`

```python
# Rate limits per workspace
RateLimitType.FACE_SEARCH: ("face_search_rpm", 60)    # 60 requests/minute
RateLimitType.FACE_DETECT: ("face_detect_rpm", 10)    # 10 requests/minute
RateLimitType.FACE_BULK: ("face_bulk_rpm", 30)        # 30 operations/minute
```

**Implementation:**
- Redis-backed token bucket
- Per-workspace counters
- Configurable limits via API
- Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Multi-Tenant Isolation

**ALL database queries include `workspace_id`:**

```python
# BAD - Missing workspace_id (security vulnerability)
result = await db.execute(select(Face).where(Face.id == face_id))

# GOOD - Always include workspace_id
result = await db.execute(
    select(Face).where(
        Face.workspace_id == workspace_id,
        Face.id == face_id
    )
)
```

**Storage isolation:**
```
workspaces/{workspace_id}/galleries/{gallery_id}/original/{asset_id}/file.jpg
workspaces/{workspace_id}/faces/{face_id}/medium.jpg
```

### Privacy Features

1. **Client-Side Detection (when possible)**
   - face-api.js runs entirely in browser
   - Embedding generated locally
   - Only embedding sent to server

2. **Hashed Embeddings in Logs**
   - Embeddings hashed before logging
   - Never stored with user identity in logs

3. **No Face Image Storage**
   - Only cropped thumbnails (for UI)
   - Full embedding vector (512 floats)
   - Original photo linked via `photo_id`

4. **Retention Policy**
   - Configurable auto-delete after N days
   - Manual delete via API
   - Cascade delete on consent withdrawal

---

## Database Schema

### faces Table

```sql
CREATE TABLE faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
    photo_id UUID NOT NULL REFERENCES assets(asset_id),
    face_group_id UUID REFERENCES face_groups(id),

    -- Face detection data
    bounding_box JSONB NOT NULL,  -- {"x": 10.5, "y": 20.3, "width": 15.2, "height": 18.7}
    confidence DECIMAL(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    embedding vector(512),
    provider VARCHAR(20) NOT NULL CHECK (provider IN ('cloud_vision', 'gemini')),
    detection_metadata JSONB DEFAULT '{}',

    -- Thumbnails
    thumbnail_urls JSONB DEFAULT '{"small": null, "medium": null, "large": null}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT faces_workspace_check CHECK (workspace_id IS NOT NULL),
    CONSTRAINT faces_photo_check CHECK (photo_id IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX idx_faces_workspace_photo ON faces(workspace_id, photo_id);
CREATE INDEX idx_faces_face_group ON faces(face_group_id) WHERE face_group_id IS NOT NULL;
CREATE INDEX idx_faces_embedding ON faces USING ivfflat(embedding vector_cosine_ops);

-- pgvector index for similarity search
CREATE INDEX idx_faces_embedding_cosine ON faces USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
```

### face_groups Table

```sql
CREATE TABLE face_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),

    -- Naming and identification
    name VARCHAR(255),
    person_id UUID REFERENCES people(id),

    -- Representative face
    representative_face_id UUID REFERENCES faces(id),

    -- Centroid vector for similarity matching
    centroid vector(512),

    -- Face count (denormalized)
    face_count INTEGER NOT NULL DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT face_groups_workspace_check CHECK (workspace_id IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_face_groups_workspace ON face_groups(workspace_id);
CREATE INDEX idx_face_groups_person ON face_groups(person_id) WHERE person_id IS NOT NULL;
```

### face_assignments Table (Audit Trail)

```sql
CREATE TABLE face_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    face_id UUID NOT NULL REFERENCES faces(id),
    face_group_id UUID REFERENCES face_groups(id),

    -- Assignment metadata
    assignment_type VARCHAR(20) NOT NULL,  -- 'auto' | 'manual' | 'merge' | 'split'
    assigned_by_user_id UUID REFERENCES users(id),
    similarity_score DECIMAL(3,2),  -- For auto-assignments

    -- Timestamps
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT face_assignments_face_check CHECK (face_id IS NOT NULL)
);

-- Indexes
CREATE INDEX idx_face_assignments_face ON face_assignments(face_id);
CREATE INDEX idx_face_assignments_group ON face_assignments(face_group_id);
```

### gallery_assets Table (Gallery-Face Link)

```sql
CREATE TABLE gallery_assets (
    workspace_id UUID NOT NULL,
    gallery_id UUID NOT NULL REFERENCES galleries(id),
    asset_id UUID NOT NULL REFERENCES assets(id),
    sub_gallery_id UUID REFERENCES sub_galleries(id),

    -- Display settings
    sort_order INTEGER NOT NULL DEFAULT 0,
    visible BOOLEAN NOT NULL DEFAULT TRUE,

    -- Timestamps
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    PRIMARY KEY (gallery_id, asset_id)
);

-- Index for face search (joins faces → gallery_assets)
CREATE INDEX idx_gallery_assets_gallery_visible ON gallery_assets(gallery_id, visible) WHERE visible = TRUE;
```

---

## API Reference

### Face Detection Endpoints

#### List Faces in Gallery
```
GET /api/v1/galleries/{gallery_id}/faces
```
- List all detected faces in photos belonging to this gallery
- Auth required: `workspace_access`
- Biometric consent required: Yes

#### List Faces in Photo
```
GET /api/v1/photos/{photo_id}/faces
```
- List all detected faces in a specific photo
- Auth required: `workspace_access`
- Biometric consent required: Yes

#### Get Face Details
```
GET /api/v1/faces/{face_id}
```
- Get detailed information about a specific face
- Auth required: `workspace_access`
- Biometric consent required: Yes

#### Identify Face
```
POST /api/v1/faces/{face_id}/identify
```
- Manually assign a face to a face group
- Auth required: `workspace_access`
- Biometric consent required: Yes

#### Bulk Assign Faces
```
POST /api/v1/faces/bulk-assign
```
- Assign multiple faces to a face group at once
- Auth required: `workspace_access`
- Rate limit: 30 req/min
- Biometric consent required: Yes

### Face Group Endpoints

#### List Face Groups
```
GET /api/v1/workspaces/{workspace_id}/face-groups
```
- List all face groups in workspace
- Auth required: `workspace_access`
- Biometric consent required: Yes
- Query params: `page`, `limit`, `order_by`, `order_desc`, `min_faces`

#### List Gallery Face Groups
```
GET /api/v1/workspaces/{workspace_id}/face-groups/gallery/{gallery_id}
```
- List face groups that appear in a specific gallery
- Auth required: `workspace_access`
- Query params: `page`, `limit`, `search`

#### Create Face Group
```
POST /api/v1/workspaces/{workspace_id}/face-groups
```
- Create a new empty face group
- Auth required: `workspace_access`
- Biometric consent required: Yes

#### Get Face Group
```
GET /api/v1/face-groups/{group_id}
```
- Get detailed information about a face group
- Auth required: `workspace_access`
- Biometric consent required: Yes

#### Update Face Group
```
PUT /api/v1/face-groups/{group_id}
```
- Update face group metadata (name, representative face)
- Auth required: `workspace_access`

#### Name Face Group
```
PUT /api/v1/workspaces/{workspace_id}/face-groups/{group_id}/name
```
- Assign a person (name) to a face group
- Auth required: `workspace_access`

#### Delete Face Group
```
DELETE /api/v1/face-groups/{group_id}
```
- Delete a face group (faces become ungrouped)
- Auth required: `workspace_access`

#### Merge Face Groups
```
POST /api/v1/face-groups/merge
```
- Merge source group into target group
- Auth required: `workspace_access`

#### Multi-Merge Face Groups
```
POST /api/v1/workspaces/{workspace_id}/face-groups/multi-merge
```
- Merge 2+ face groups into one
- Auth required: `workspace_access`
- Rate limit: 30 req/min
- Biometric consent required: Yes

#### Split Face Group
```
POST /api/v1/face-groups/{group_id}/split
```
- Split specified faces from a group into a new group
- Auth required: `workspace_access`
- Rate limit: 30 req/min
- Biometric consent required: Yes

### Public Gallery Endpoints

#### Face Search (Public)
```
POST /api/v1/public/galleries/{gallery_id}/face-search
```
- Search for photos containing a specific face
- No auth required (public gallery)
- Biometric consent required: Yes (COM-001)
- Rate limit: 60 req/min (SEC-001)

Request body:
```json
{
    "embedding": [512 float values],
    "threshold": 0.6,
    "limit": 50
}
```

Response:
```json
{
    "matches": [
        {
            "photo_id": "uuid",
            "similarity": 0.92,
            "thumbnail_url": "/api/v1/public/galleries/.../thumbnail"
        }
    ],
    "total_searched": 1234,
    "query_time_ms": 45.2
}
```

### Biometric Consent Endpoints

#### Grant Consent
```
POST /api/v1/workspaces/{workspace_id}/biometric-consent
```
- Grant biometric consent for face detection (GDPR Article 9)
- Auth required: `workspace_access`

Request body:
```json
{
    "policy_version": "1.0",
    "auto_enable_detection": true
}
```

#### Get Consent Status
```
GET /api/v1/workspaces/{workspace_id}/biometric-consent
```
- Get current biometric consent status
- Auth required: `workspace_access`

#### Withdraw Consent
```
DELETE /api/v1/workspaces/{workspace_id}/biometric-consent?cascade_delete=false
```
- Withdraw previously granted biometric consent
- Auth required: `workspace_access`
- Query param: `cascade_delete` - Delete all biometric data if true

---

## Configuration

### Workspace Settings

**Table:** `workspace_biometric_settings`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `consent_status` | VARCHAR(20) | 'pending' | Consent state |
| `face_detection_enabled` | BOOLEAN | FALSE | Master switch for face features |
| `public_face_search_enabled` | BOOLEAN | FALSE | Allow public gallery face search |
| `consented_at` | TIMESTAMP | NULL | When consent was granted |
| `consent_ip` | VARCHAR(45) | NULL | IP address of consent |
| `consent_user_agent` | TEXT | NULL | Browser of consent |
| `withdrawn_at` | TIMESTAMP | NULL | When consent was revoked |
| `withdrawal_reason` | TEXT | NULL | Reason for withdrawal |
| `updated_at` | TIMESTAMP | NOW() | Last update timestamp |

### Gallery Settings

**Table:** `galleries`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `face_search_enabled` | BOOLEAN | TRUE | Per-gallery face search override |
| `download_policy` | VARCHAR(20) | 'watermarked_only' | Download access control |

### Rate Limiting

**Table:** `workspace_face_rate_limits`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `workspace_id` | UUID | - | Workspace reference |
| `face_search_rpm` | INTEGER | 60 | Face search requests per minute |
| `face_detect_rpm` | INTEGER | 10 | Face detection requests per minute |
| `face_bulk_rpm` | INTEGER | 30 | Bulk operation requests per minute |

### Environment Variables

```bash
# AI Provider Selection
AI_PROVIDER=cloud_vision  # or 'gemini'
AI_API_KEY=<api-key>

# Vector Database
POSTGRES_URL=postgresql://...
PGVECTOR_ENABLED=true
MILVUS_ENABLED=false
MILVUS_HOST=localhost
MILVUS_PORT=19530

# Face Detection Settings
FACE_DETECTION_CONFIDENCE_THRESHOLD=0.7
FACE_CLUSTERING_THRESHOLD=0.85
FACE_EMBEDDING_DIMENSION=512

# Rate Limiting (defaults)
REDIS_URL=redis://localhost:6379/0
DEFAULT_FACE_SEARCH_RPM=60
DEFAULT_FACE_DETECT_RPM=10
```

---

## Troubleshooting

### Common Issues

#### 1. Face Search Returns No Results

**Possible causes:**
- Biometric consent not granted
- Face search disabled for gallery
- No faces detected in gallery photos
- Threshold too high (try 0.5 or 0.6)
- Embedding dimension mismatch (128 vs 512)

**Solution:**
```python
# Check consent status
GET /api/v1/workspaces/{workspace_id}/biometric-consent

# Check gallery settings
GET /api/v1/public/galleries/{gallery_id}
# Look for "face_search_enabled": true

# Lower threshold
POST /api/v1/public/galleries/{gallery_id}/face-search
{
    "embedding": [...],
    "threshold": 0.5,  # Try lower value
    "limit": 50
}
```

#### 2. Rate Limit Errors

**Error:** `429 Too Many Requests`

**Solution:**
```python
# Check current limits
GET /api/v1/workspaces/{workspace_id}/face-rate-limits

# Increase limits (if allowed)
PUT /api/v1/workspaces/{workspace_id}/face-rate-limits
{
    "face_search_rpm": 120
}
```

#### 3. Embedding Dimension Mismatch

**Error:** `EmbeddingDimensionMismatchError: Expected 512, got 128`

**Cause:** Client using face-api.js (128-dim) with ArcFace (512-dim) model

**Solution:**
- Use consistent embedding model on client and server
- Pad 128-dim to 512-dim with zeros (not recommended)
- Use AI provider that generates 512-dim embeddings

---

## Performance Optimization

### Caching Strategy

**Redis Cache Keys:**
```
face_group_list:{workspace_id}:{page}:{limit}:{order_by}:{order_desc}
face_group_detail:{workspace_id}:{group_id}
gallery_face_groups:{workspace_id}:{gallery_id}:{page}:{limit}
faces_in_group:{workspace_id}:{group_id}:{limit}:{offset}
merge_suggestions:{workspace_id}:{threshold}:{limit}
```

**Cache Invalidation:**
- On face group merge/split
- On face assignment changes
- On group name updates
- Manual invalidation via API

### Database Indexes

```sql
-- Critical indexes for face search
CREATE INDEX idx_faces_workspace_photo ON faces(workspace_id, photo_id);
CREATE INDEX idx_faces_embedding_cosine ON faces USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_gallery_assets_gallery_visible ON gallery_assets(gallery_id, visible) WHERE visible = TRUE;

-- Covering index for gallery face search
CREATE INDEX idx_faces_gallery_search ON faces(photo_id, embedding, thumbnail_urls)
WHERE embedding IS NOT NULL;
```

### Vector Search Optimization

1. **pgvector ivfflat index** - Use for < 1M faces
2. **Milvus** - Use for > 1M faces (distributed)
3. **Dimensionality reduction** - Consider PCA for 256-dim
4. **Quantization** - Binary quantization for faster search

---

## FaceIDs Page – End-to-End Integration Checklist

Use this checklist when the FaceIDs (People) page shows "Failed to load people" or empty state.

### 1. Frontend → API base URL

- **With full Docker stack (Traefik on port 80):**  
  `frontend/.env.development`: `VITE_API_URL=http://localhost`  
  Requests go to `http://localhost/api/...` → Traefik → backend.

- **Backend only (e.g. Docker backend on 8000, no Traefik):**  
  `frontend/.env` or `.env.development`: `VITE_API_URL=http://localhost:8000`  
  Requests go directly to the backend.

- **Vite proxy:** In dev, if you use `VITE_API_URL=http://localhost`, the app uses that; the proxy in `vite.config.ts` is for same-origin requests when the app is served from the dev server. Ensure the URL you set is where the API is actually listening.

### 2. Backend (Docker or local)

- Backend is running (e.g. `rawdrive-backend` container or `uvicorn app.main:app --port 8000`).
- Face routes are mounted: `face_groups_router` at `/api/v1` (see `backend/src/app/api/v1/__init__.py`).
- **List endpoint:** `GET /api/v1/workspaces/{workspace_id}/face-groups` returns 200 with body `{ "data": [], "meta": { "page", "limit", "total", "total_pages" } }`. The list endpoint does **not** require biometric consent.

### 3. Auth & JWT

- User is logged in; `apiClient` sends `Authorization: Bearer <access_token>` (see `frontend/src/services/api.ts`).
- Backend validates JWT and `require_workspace_access`; user must be a member of the workspace. `workspace_id` is taken from the URL path.

### 4. Database

- Tables exist: `face_groups`, `faces` (and any dependencies). Run migrations: `alembic upgrade head` in the backend container or env.
- Empty list is valid: 200 with `data: []`, `meta.total: 0` is correct when no faces have been detected yet.

### 5. Traefik (if used)

- `infrastructure/docker/traefik/dynamic.dev.yaml`: `api-router-local` has `PathPrefix(\`/api\`)` → `backend-service` → `http://backend:8000`.
- Face-groups list is not a separate route; it is covered by this generic `/api` rule.

### 6. Duplicate toasts

- PeoplePage fetches once per `workspace_id` (effect deps only on `workspace?.workspace_id`). If you still see two toasts, check for a second mount (e.g. StrictMode or two instances of the page).

### 7. Deep dive – middleware, security, and verification

| Layer | What to verify |
|-------|----------------|
| **Backend route** | `GET /api/v1/workspaces/{workspace_id}/face-groups` is on `face_groups_router` with prefix `/api/v1` (no extra prefix). |
| **Auth** | `list_face_groups` uses `WorkspaceAccessDep` and `CurrentUserDep`. JWT is validated by `require_workspace_access`; `workspace_id` from path must match an active membership in `workspace_memberships`. |
| **Biometric consent** | List endpoint does **not** call `require_biometric_consent`; other face write/merge endpoints may require it. |
| **Middleware** | CORS, request ID, correlation, rate limit, and timeout run in order (see `backend/src/app/main.py`). Face list is subject to generic API rate limits. |
| **Security tokens** | No separate “face” token; same JWT (EdDSA with public/private key in backend secrets). All microservices that validate JWT must use the same public key. |
| **Traefik** | `api-router-local`: `Host(localhost) && PathPrefix(/api)` → `backend-service` (priority 100). Request path `/api/v1/workspaces/.../face-groups` is routed to backend. |
| **Database** | Migrations: `0025_create_faces_table`, `0026_create_face_groups_table`, `0044_face_groups_person_link`, `0185_face_recognition_tables`, etc. Tables: `face_groups`, `faces`, `face_detections` (if used), `people`. |
| **Redis cache** | List response can be cached; legacy cache may store `meta.totalPages`. Backend normalizes to `total_pages` when reading from cache. |

**Verify request reaches backend:** After opening the People page or gallery FaceID panel, check backend logs for:

- `list_face_groups called` with `workspace_id`, `page`, `limit`
- `list_face_groups result` with `total`, `returned`

If these log lines never appear, the request is not reaching the backend (wrong URL, Traefik, or CORS). If they appear with `total: 0`, the DB has no face groups yet (upload photos with faces and run face detection).

### 8. Gallery FaceID panel (PeoplePanel) and “Group Detected Faces”

- **API:** `getGalleryFaceGroups(workspaceId, galleryId)` → `GET /api/v1/workspaces/{workspace_id}/face-groups/gallery/{gallery_id}`. Same auth (Bearer JWT) and backend.
- **Cluster ungrouped:** “Group Detected Faces” calls `clusterUngroupedFaces(workspaceId)` → `POST /api/v1/workspaces/{workspace_id}/face-groups/cluster-ungrouped`. This endpoint does **not** require biometric consent; it only requires workspace access.
- **Empty “No people detected yet”** in the panel is correct when the gallery has no face groups (no faces detected in that gallery’s assets yet).

---

## Future Enhancements

### Planned Features

1. **Face Recognition**
   - Named face search
   - Person-centric gallery views
   - Face-based album auto-creation

2. **Advanced Clustering**
   - Temporal clustering (events over time)
   - Location-based clustering
   - Age progression detection

3. **Privacy Enhancements**
   - On-device face processing (WebAssembly)
   - Federated learning for face matching
   - Zero-knowledge proof of search

4. **Performance**
   - GPU acceleration for embedding generation
   - Real-time face detection in video
   - Incremental clustering (online learning)

---

## References

- **PRD:** `.claude/PRD.md` (Section: Face Detection and Identification)
- **Best Practices:** `.claude/reference/ai-ml-best-practices.md`
- **Security:** `.claude/reference/security-best-practices.md`
- **API Standards:** `.claude/reference/api-standards.md`

---

**Document Maintained By:** RawDrive Development Team
**Last Review:** 2026-02-08
**Next Review:** 2026-03-08
