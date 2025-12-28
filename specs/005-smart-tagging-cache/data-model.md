# Data Model: Smart Local Tagging Layer

**Feature**: 005-smart-tagging-cache
**Date**: 2025-12-28

---

## Overview

This data model **extends** the existing RawDrive schema rather than replacing it. The design adds AI-generated tag support to the existing `tags`/`asset_tags` infrastructure and introduces asset analysis tracking.

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SMART TAGGING DATA MODEL                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────┐          ┌─────────────┐          ┌──────────────┐            │
│  │  assets  │─────────▶│ asset_tags  │◀─────────│    tags      │            │
│  │          │          │  (extended) │          │  (existing)  │            │
│  └────┬─────┘          └─────────────┘          └──────────────┘            │
│       │                                                                      │
│       │                                                                      │
│       ▼                                                                      │
│  ┌────────────────┐    ┌──────────────────┐    ┌─────────────────┐          │
│  │ asset_analysis │    │content_detection │    │ tagging_stats   │          │
│  │    (new)       │    │   _jobs (new)    │    │   (view)        │          │
│  └────────────────┘    └──────────────────┘    └─────────────────┘          │
│                                                                              │
│                                                                              │
│  ┌──────────┐          ┌─────────────┐          ┌──────────────┐            │
│  │  faces   │─────────▶│ face_groups │─────────▶│   people     │            │
│  │(existing)│          │  (extended) │          │  (existing)  │            │
│  └──────────┘          └─────────────┘          └──────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Schema Changes

### 1. Extend `asset_tags` Table

Add columns to track AI-generated tags:

```sql
-- Migration: 0041_smart_tagging_extensions.py

ALTER TABLE asset_tags
  ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai_vision', 'ai_gemini', 'ai_local'));

ALTER TABLE asset_tags
  ADD COLUMN confidence NUMERIC(5, 4);

ALTER TABLE asset_tags
  ADD COLUMN ai_metadata JSONB;

-- Index for filtering by source
CREATE INDEX idx_asset_tags_source
  ON asset_tags(workspace_id, source);

-- Index for AI metadata queries
CREATE INDEX idx_asset_tags_ai_metadata
  ON asset_tags USING gin(ai_metadata)
  WHERE source != 'manual';

COMMENT ON COLUMN asset_tags.source IS
  'Tag source: manual (user added), ai_vision (Cloud Vision), ai_gemini (Gemini), ai_local (local model)';

COMMENT ON COLUMN asset_tags.confidence IS
  'AI confidence score 0.0-1.0, NULL for manual tags';

COMMENT ON COLUMN asset_tags.ai_metadata IS
  'Provider-specific metadata (e.g., detection bounding box, model version)';
```

### 2. New `asset_analysis` Table

Track AI processing state per asset:

```sql
CREATE TABLE asset_analysis (
  asset_id UUID PRIMARY KEY REFERENCES assets(asset_id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

  -- Overall status
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),

  -- Content/vision analysis tracking
  vision_status VARCHAR(20) DEFAULT 'pending'
    CHECK (vision_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  vision_analyzed_at TIMESTAMPTZ,
  vision_provider VARCHAR(50),
  vision_model_version VARCHAR(100),
  vision_tags_count INTEGER DEFAULT 0,

  -- Face analysis tracking
  face_status VARCHAR(20) DEFAULT 'pending'
    CHECK (face_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  face_analyzed_at TIMESTAMPTZ,
  face_provider VARCHAR(50),
  faces_detected INTEGER DEFAULT 0,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_asset_analysis_workspace_status
  ON asset_analysis(workspace_id, status);

CREATE INDEX idx_asset_analysis_vision_status
  ON asset_analysis(vision_status)
  WHERE vision_status IN ('pending', 'processing');

CREATE INDEX idx_asset_analysis_face_status
  ON asset_analysis(face_status)
  WHERE face_status IN ('pending', 'processing');

CREATE INDEX idx_asset_analysis_next_retry
  ON asset_analysis(next_retry_at)
  WHERE next_retry_at IS NOT NULL AND status = 'failed';

COMMENT ON TABLE asset_analysis IS
  'Tracks AI analysis state for each asset to prevent duplicate processing';
```

### 3. New `content_detection_jobs` Table

Queue for content/vision analysis (follows face_detection_jobs pattern):

```sql
CREATE TABLE content_detection_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(asset_id) ON DELETE CASCADE,

  -- Job state
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),

  -- Processing details
  provider_used VARCHAR(50),
  tags_detected INTEGER DEFAULT 0,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Priority (higher = processed first)
  -- 0 = batch processing, 5 = new upload, 10 = manual re-analysis
  priority INTEGER DEFAULT 5,

  -- Scheduling
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate jobs for same asset
  UNIQUE(asset_id)
);

-- Queue index (matching face_detection_jobs pattern)
CREATE INDEX idx_content_detection_jobs_queue
  ON content_detection_jobs(status, priority DESC, scheduled_at ASC)
  WHERE status = 'pending';

CREATE INDEX idx_content_detection_jobs_workspace
  ON content_detection_jobs(workspace_id);

COMMENT ON TABLE content_detection_jobs IS
  'Job queue for AI content/vision analysis processing';
```

### 4. Extend `face_groups` Table

Link face groups to people for naming:

```sql
ALTER TABLE face_groups
  ADD COLUMN person_id UUID REFERENCES people(person_id) ON DELETE SET NULL;

CREATE INDEX idx_face_groups_person
  ON face_groups(person_id)
  WHERE person_id IS NOT NULL;

COMMENT ON COLUMN face_groups.person_id IS
  'Links face cluster to named person for search and display';
```

### 5. Gallery Tagging Stats View

Materialized view for efficient health metrics:

```sql
CREATE MATERIALIZED VIEW gallery_tagging_stats AS
SELECT
  ga.gallery_id,
  g.workspace_id,
  COUNT(DISTINCT a.asset_id) as total_assets,
  COUNT(DISTINCT CASE WHEN aa.status = 'completed' THEN a.asset_id END) as tagged_assets,
  COUNT(DISTINCT CASE WHEN aa.status = 'pending' THEN a.asset_id END) as pending_assets,
  COUNT(DISTINCT CASE WHEN aa.status = 'failed' THEN a.asset_id END) as failed_assets,
  COUNT(DISTINCT CASE WHEN aa.status IS NULL THEN a.asset_id END) as unqueued_assets,
  MAX(aa.updated_at) as last_analysis_at
FROM galleries g
JOIN gallery_assets ga ON g.gallery_id = ga.gallery_id
JOIN assets a ON ga.asset_id = a.asset_id AND a.deleted = FALSE
LEFT JOIN asset_analysis aa ON a.asset_id = aa.asset_id
WHERE g.deleted = FALSE
GROUP BY ga.gallery_id, g.workspace_id;

CREATE UNIQUE INDEX idx_gallery_tagging_stats_gallery
  ON gallery_tagging_stats(gallery_id);

CREATE INDEX idx_gallery_tagging_stats_workspace
  ON gallery_tagging_stats(workspace_id);

-- Refresh function (call periodically or on-demand)
CREATE OR REPLACE FUNCTION refresh_gallery_tagging_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY gallery_tagging_stats;
END;
$$ LANGUAGE plpgsql;
```

---

## Entity Specifications

### AssetTag (Extended)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| asset_tag_id | UUID | PK | Primary key |
| workspace_id | UUID | FK, NOT NULL | Workspace isolation |
| asset_id | UUID | FK, NOT NULL | Reference to asset |
| tag_id | UUID | FK, NOT NULL | Reference to tag |
| created_by_user_id | UUID | FK, nullable | User who added (null for AI) |
| **source** | VARCHAR(20) | NOT NULL, DEFAULT 'manual' | 'manual', 'ai_vision', 'ai_gemini', 'ai_local' |
| **confidence** | NUMERIC(5,4) | nullable | AI confidence 0.0-1.0 |
| **ai_metadata** | JSONB | nullable | Provider-specific metadata |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

### AssetAnalysis (New)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| asset_id | UUID | PK, FK | Reference to asset |
| workspace_id | UUID | FK, NOT NULL | Workspace isolation |
| status | VARCHAR(20) | NOT NULL | Overall status |
| vision_status | VARCHAR(20) | DEFAULT 'pending' | Content analysis status |
| vision_analyzed_at | TIMESTAMPTZ | nullable | When content analyzed |
| vision_provider | VARCHAR(50) | nullable | Provider used for content |
| vision_model_version | VARCHAR(100) | nullable | Model version for audit |
| vision_tags_count | INTEGER | DEFAULT 0 | Tags found |
| face_status | VARCHAR(20) | DEFAULT 'pending' | Face analysis status |
| face_analyzed_at | TIMESTAMPTZ | nullable | When faces analyzed |
| face_provider | VARCHAR(50) | nullable | Provider used for faces |
| faces_detected | INTEGER | DEFAULT 0 | Faces found |
| error_message | TEXT | nullable | Last error |
| retry_count | INTEGER | DEFAULT 0 | Retry attempts |
| next_retry_at | TIMESTAMPTZ | nullable | Scheduled retry |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Created |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last updated |

### ContentDetectionJob (New)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Job ID |
| workspace_id | UUID | FK, NOT NULL | Workspace isolation |
| asset_id | UUID | FK, UNIQUE | Asset to process |
| status | VARCHAR(20) | NOT NULL | Job status |
| provider_used | VARCHAR(50) | nullable | Provider that processed |
| tags_detected | INTEGER | DEFAULT 0 | Tags found |
| error_message | TEXT | nullable | Error details |
| retry_count | INTEGER | DEFAULT 0 | Retry attempts |
| priority | INTEGER | DEFAULT 5 | Processing priority |
| scheduled_at | TIMESTAMPTZ | DEFAULT NOW() | When to process |
| started_at | TIMESTAMPTZ | nullable | Processing started |
| completed_at | TIMESTAMPTZ | nullable | Processing completed |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Created |

### FaceGroup (Extended)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Cluster ID |
| workspace_id | UUID | FK, NOT NULL | Workspace isolation |
| name | VARCHAR(255) | nullable | User-assigned name |
| representative_face_id | UUID | FK, nullable | Thumbnail face |
| centroid | vector(512) | nullable | Mean embedding |
| face_count | INTEGER | DEFAULT 0 | Faces in cluster |
| **person_id** | UUID | FK, nullable | Link to people table |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Created |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Updated |

---

## State Transitions

### Asset Analysis Status

```
                    ┌──────────────┐
                    │   pending    │
                    └──────┬───────┘
                           │ Job picked up
                           ▼
                    ┌──────────────┐
                    │  processing  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌──────────┐ ┌───────────┐ ┌─────────┐
       │completed │ │  failed   │ │ skipped │
       └──────────┘ └─────┬─────┘ └─────────┘
                          │ Retry
                          ▼
                   ┌──────────────┐
                   │   pending    │
                   └──────────────┘
```

### Content Detection Job Status

```
pending → processing → completed
                    ↘ failed (retry up to 3x → stays failed)
```

---

## Validation Rules

### Tag Source Validation
- `source` must be one of: 'manual', 'ai_vision', 'ai_gemini', 'ai_local'
- `confidence` required when source != 'manual'
- `created_by_user_id` required when source = 'manual'

### Confidence Score Validation
- Range: 0.0000 to 1.0000
- Precision: 4 decimal places
- NULL allowed only for manual tags

### Face Group to Person Linking
- One face_group can link to one person
- Multiple face_groups can link to same person (rare)
- Setting person_id makes face group searchable by person name

### Job Priority Values
- 0: Batch/background processing
- 5: New upload (default)
- 10: Manual re-analysis request
- 15+: Reserved for critical/admin

---

## Indexes Summary

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| asset_tags | idx_asset_tags_source | workspace_id, source | Filter by tag source |
| asset_tags | idx_asset_tags_ai_metadata | ai_metadata (GIN) | AI metadata queries |
| asset_analysis | idx_asset_analysis_workspace_status | workspace_id, status | Health queries |
| asset_analysis | idx_asset_analysis_vision_status | vision_status | Job processing |
| asset_analysis | idx_asset_analysis_next_retry | next_retry_at | Retry scheduling |
| content_detection_jobs | idx_content_detection_jobs_queue | status, priority, scheduled_at | Job queue |
| face_groups | idx_face_groups_person | person_id | Person search |
| gallery_tagging_stats | idx_gallery_tagging_stats_gallery | gallery_id | Stats lookup |

---

## Migration Strategy

### Migration Order

1. **0041_smart_tagging_extensions.py**
   - Extend asset_tags with source, confidence, ai_metadata
   - Add indexes

2. **0042_asset_analysis.py**
   - Create asset_analysis table
   - Add indexes

3. **0043_content_detection_jobs.py**
   - Create content_detection_jobs table
   - Add indexes

4. **0044_face_groups_person_link.py**
   - Add person_id to face_groups
   - Add index

5. **0045_gallery_tagging_stats.py**
   - Create materialized view
   - Add refresh function

### Backward Compatibility

- All existing queries continue to work
- Default `source='manual'` preserves existing tag behavior
- Existing face_groups remain functional
- SearchService queries unchanged (extend, don't break)
