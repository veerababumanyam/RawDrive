# Face Detection and Identification Feature

## Overview

RawDrive's Face Detection and Identification service automatically detects, identifies, and groups faces across gallery photos. This enables photographers to organize photos by person, discover similar faces, and create face-based collections.

## Key Capabilities

### Automatic Face Detection
- Detects all visible faces in uploaded photos
- Extracts bounding box coordinates for face location
- Generates confidence scores for detection quality
- Supports JPEG, PNG, WebP, and HEIC formats

### Face Identification and Clustering
- Generates face embeddings for similarity matching
- Automatically groups photos of the same person
- Supports manual confirmation and correction
- Enables cluster merging and splitting

### AI Provider Management
- Primary provider: Google Cloud Vision
- Fallback provider: Google Gemini Flash
- Automatic failover on provider failure
- Admin-configurable settings (no hardcoded values)

### Face-Based Organization
- Browse galleries by detected faces
- Filter photos by specific people
- Name and manage face groups
- Multi-face filtering support

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Photo Upload                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Detection Job Queue                         │
│                    (BullMQ/Redis)                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│               Face Detection Service                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Provider Manager                        │   │
│  │  ┌─────────────┐    ┌─────────────────────────┐    │   │
│  │  │ Cloud Vision│───▶│ Gemini Flash (Fallback) │    │   │
│  │  │  (Primary)  │    │                         │    │   │
│  │  └─────────────┘    └─────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Face Embedding & Clustering                     │
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │ Embedding Store │  │     Cluster Manager             │  │
│  │   (pgvector)    │  │  (Similarity Matching)          │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Face Groups API                            │
│         (Browse, Filter, Name, Organize)                    │
└─────────────────────────────────────────────────────────────┘
```

## User Flows

### Automatic Detection Flow
1. Photographer uploads photos to gallery
2. System queues photos for face detection
3. Background worker processes photos through AI provider
4. Faces are detected and embeddings generated
5. Faces are matched to existing clusters or new clusters created
6. Face groups become available for browsing

### Manual Correction Flow
1. User views detected faces in gallery
2. User identifies incorrect grouping
3. User manually assigns face to correct group
4. System updates cluster and improves future matching

### Face-Based Browsing Flow
1. User opens gallery
2. User views face groups sidebar
3. User selects one or more face groups
4. Gallery filters to show matching photos
5. User can further refine with other filters

## Configuration

### Admin Settings (Preferred)
All AI provider settings are managed through the admin interface:

- **Google Cloud Vision**
  - Service account credentials (JSON)
  - Rate limits
  - Timeout values

- **Google Gemini**
  - API key
  - Model selection (gemini-2.5-flash, gemini-3-flash-preview, etc.)
  - Rate limits
  - Timeout values

- **Detection Settings**
  - Similarity threshold (default: 0.85)
  - Minimum confidence threshold (default: 0.7)
  - Batch size for processing
  - Retry configuration

### Environment Variables (Fallback)
When admin settings are not configured:

```bash
# Google Cloud Vision
GOOGLE_CLOUD_VISION_CREDENTIALS=<path-to-service-account-json>

# Google Gemini
GEMINI_API_KEY=<api-key>
GEMINI_MODEL=gemini-3-flash-preview
GEMINI_MODEL_FAST=gemini-2.5-flash

# Detection Settings
FACE_SIMILARITY_THRESHOLD=0.85
FACE_MIN_CONFIDENCE=0.7
```

## API Endpoints

### Gallery Faces
```
GET /api/v1/galleries/{id}/faces
```
Returns all detected faces in a gallery with bounding boxes and cluster assignments.

### Face Details
```
GET /api/v1/faces/{id}
```
Returns detailed information about a specific detected face.

### Manual Identification
```
POST /api/v1/faces/{id}/identify
Body: { "faceGroupId": "uuid" }
```
Manually assigns a face to a specific face group.

### Face Groups
```
GET /api/v1/workspaces/{id}/face-groups
PUT /api/v1/face-groups/{id}
POST /api/v1/face-groups/merge
POST /api/v1/face-groups/{id}/split
```
Manage face groups within a workspace.

### Trigger Detection
```
POST /api/v1/photos/{id}/detect-faces
```
Manually trigger face detection for a specific photo.

## Database Schema

### faces Table
```sql
CREATE TABLE faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    photo_id UUID NOT NULL REFERENCES photos(id),
    face_group_id UUID REFERENCES face_groups(id),
    bounding_box JSONB NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,
    embedding vector(512),
    provider VARCHAR(50) NOT NULL,
    detection_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_faces_workspace ON faces(workspace_id);
CREATE INDEX idx_faces_photo ON faces(photo_id);
CREATE INDEX idx_faces_group ON faces(face_group_id);
CREATE INDEX idx_faces_embedding ON faces USING ivfflat (embedding vector_cosine_ops);
```

### face_groups Table
```sql
CREATE TABLE face_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    name VARCHAR(255),
    representative_face_id UUID REFERENCES faces(id),
    centroid vector(512),
    face_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_face_groups_workspace ON face_groups(workspace_id);
```

### ai_provider_settings Table
```sql
CREATE TABLE ai_provider_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name VARCHAR(50) NOT NULL UNIQUE,
    credentials_encrypted BYTEA,
    config JSONB NOT NULL DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    rate_limit_per_minute INTEGER,
    timeout_ms INTEGER DEFAULT 30000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Security Considerations

- All face data is scoped by workspace_id
- Cross-workspace face matching is prevented
- Provider credentials are encrypted at rest
- API endpoints require authentication
- Face data access is audited

## Performance Targets

- Face detection: < 3 seconds per photo
- Similarity search: < 100ms for 10,000 faces
- Batch processing: 100 photos per minute
- Embedding storage: Optimized with pgvector indexes

## Related Documentation

- `docs/TechnicalSpecs/people_face_recognition.json` - Technical specification
- `docs/Features/AI_POWERED_FEATURES.md` - AI features overview
- `docs/Features/GalleryFeatures.md` - Gallery features
