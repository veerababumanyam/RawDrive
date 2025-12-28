# Research: Smart Local Tagging Layer

**Feature**: 005-smart-tagging-cache
**Date**: 2025-12-28

---

## Executive Summary

Research reveals that RawDrive already has substantial infrastructure for tags, faces, and search. The Smart Tagging Layer should **extend existing patterns** rather than replace them. Key findings:

1. **Tags Table Exists** - `tags` and `asset_tags` tables support manual keyword tags (migration 0013)
2. **Face Detection Pipeline Exists** - Complete microservice with provider failover (Cloud Vision → Gemini → Local)
3. **Search Service Exists** - Unified search across galleries, assets, tags, people, comments
4. **Two Face Systems** - Need to reconcile `face_groups` (pgvector-based, migration 0025-26) with `people`/`face_detections` (migration 0013)

---

## Decision: Extend Tag Schema for AI Support

**What was chosen**: Add `source` column and AI metadata to existing tag infrastructure rather than creating parallel tables.

**Rationale**:
- Existing `tags` table already handles workspace-scoped tags with type, color, and search indexes
- Existing `asset_tags` already handles many-to-many relationships
- Adding source differentiation (AI vs manual) requires minimal schema changes
- Maintains backward compatibility with existing tag operations

**Alternatives considered**:
- **New `ai_tags` table**: Rejected - would fragment search and require complex union queries
- **Separate `ai_asset_labels` table**: Rejected - duplicates relationship logic already in `asset_tags`

**Schema Extension**:
```sql
-- Add to asset_tags table
ALTER TABLE asset_tags ADD COLUMN source VARCHAR(20) DEFAULT 'manual'
  CHECK (source IN ('manual', 'ai_vision', 'ai_gemini'));
ALTER TABLE asset_tags ADD COLUMN confidence NUMERIC(5, 4);
ALTER TABLE asset_tags ADD COLUMN ai_metadata JSONB;
```

---

## Decision: Consolidate Face Systems

**What was chosen**: Use `face_groups` (pgvector) as the primary face clustering system, link to `people` table for naming.

**Rationale**:
- `face_groups` has 512-dim embeddings with IVFFlat indexes - required for similarity search
- `people` table provides display names and cover photos - required for user-facing features
- `face_detections` can be deprecated in favor of the richer `faces` table

**Relationship**:
```
faces (pgvector embeddings) → face_groups (clusters) → people (names/display)
```

**Migration path**:
1. Add `person_id` column to `face_groups` for linking to `people` table
2. Migrate existing `face_detections` → `faces` records where applicable
3. Keep `people` table for user-assigned names, link via `face_groups.person_id`

---

## Decision: Asset Analysis Tracking

**What was chosen**: Create `asset_analysis` table to track AI processing state per asset.

**Rationale**:
- Need to know when each photo was last analyzed (FR-027)
- Need to track which provider was used
- Need to distinguish "never analyzed" from "analyzed but no tags found"
- Enables incremental processing (FR-016) and re-analysis (FR-017)

**Schema**:
```sql
CREATE TABLE asset_analysis (
  asset_id UUID PRIMARY KEY REFERENCES assets(asset_id),
  workspace_id UUID NOT NULL,
  status VARCHAR(20) CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  vision_analyzed_at TIMESTAMPTZ,
  vision_provider VARCHAR(50),
  face_analyzed_at TIMESTAMPTZ,
  face_provider VARCHAR(50),
  tags_count INTEGER DEFAULT 0,
  faces_count INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Decision: Content Tag Detection

**What was chosen**: Use existing AI provider infrastructure with new tag extraction logic.

**Rationale**:
- Cloud Vision API already returns labels (objects, scenes)
- Provider failover system already handles outages
- Just need to store Vision API labels as tags

**Implementation Pattern**:
```python
# In asset processing pipeline:
1. Call provider_manager.detect_labels(image_buffer)
2. For each label with confidence > threshold:
   - Get or create tag with source='ai_vision'
   - Create asset_tag with confidence + ai_metadata
3. Update asset_analysis.vision_analyzed_at
```

---

## Decision: PostgreSQL Polling for Tag Jobs

**What was chosen**: Follow existing `face_detection_jobs` pattern with new `content_detection_jobs` table.

**Rationale**:
- Existing face worker uses PostgreSQL polling (simpler than BullMQ)
- `FOR UPDATE SKIP LOCKED` pattern proven for concurrent processing
- Exponential backoff retry logic already implemented
- Same worker can process both face and content detection with priority control

**Alternatives considered**:
- **BullMQ**: Rejected - would introduce new infrastructure; existing pattern works well
- **Single jobs table**: Considered but separate tables cleaner for independent scaling

---

## Decision: Gallery Tagging Health

**What was chosen**: Aggregate queries on `asset_analysis` for health metrics (FR-029).

**Rationale**:
- Don't need denormalized counters in gallery table
- Simple COUNT queries on `asset_analysis` grouped by status
- Cache results in Redis with 1-minute TTL for dashboard performance

**Query Pattern**:
```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') as tagged,
  COUNT(*) FILTER (WHERE status = 'pending') as pending,
  COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM assets a
JOIN gallery_assets ga ON a.asset_id = ga.asset_id
LEFT JOIN asset_analysis aa ON a.asset_id = aa.asset_id
WHERE ga.gallery_id = $1 AND a.deleted = FALSE
```

---

## Technical Context Resolution

| Unknown | Resolution | Source |
|---------|------------|--------|
| Tag storage approach | Extend existing `tags`/`asset_tags` | Migration 0013 analysis |
| Face clustering system | Use `faces`/`face_groups` (pgvector) | Migration 0025-26 |
| Job queue system | PostgreSQL polling (not BullMQ) | face_detection_worker.py |
| AI providers | Cloud Vision → Gemini → Local | provider_manager.py |
| Search infrastructure | Extend `SearchService` | search_service.py |

---

## Existing Infrastructure Inventory

### Database Tables (to extend)

| Table | Purpose | Smart Tagging Changes |
|-------|---------|----------------------|
| `tags` | Workspace-scoped tags | Add AI tag types |
| `asset_tags` | Asset-tag relationships | Add source, confidence, ai_metadata |
| `faces` | Detected faces with embeddings | No changes needed |
| `face_groups` | Face clusters | Add person_id for naming |
| `people` | Named people | Link to face_groups |

### New Tables Required

| Table | Purpose |
|-------|---------|
| `asset_analysis` | Track AI processing state per asset |
| `content_detection_jobs` | Queue for content analysis jobs |

### Services (to extend)

| Service | Location | Changes |
|---------|----------|---------|
| `TagService` | `services/tag_service.py` | Add AI tag methods |
| `SearchService` | `services/search_service.py` | Add tag-based filtering |
| `FaceClusterService` | `services/face_cluster_service.py` | Add person naming |

### New Services

| Service | Purpose |
|---------|---------|
| `ContentDetectionService` | Orchestrate content tag analysis |
| `ContentDetectionWorker` | Process content detection jobs |
| `TaggingHealthService` | Gallery tagging metrics |

---

## Performance Considerations

### Indexing Strategy

```sql
-- For fast tag-based asset lookup
CREATE INDEX idx_asset_tags_workspace_tag_source
  ON asset_tags(workspace_id, tag_id, source);

-- For AI metadata search
CREATE INDEX idx_asset_tags_ai_metadata
  ON asset_tags USING gin(ai_metadata)
  WHERE source != 'manual';

-- For analysis status queries
CREATE INDEX idx_asset_analysis_workspace_status
  ON asset_analysis(workspace_id, status);
```

### Query Optimization

- Use pg_trgm for fuzzy tag name matching (already exists)
- Cache gallery health metrics in Redis (1-minute TTL)
- Batch tag creation to avoid N+1 inserts

---

## Integration Points

### Upload Pipeline
- After upload commit → queue content detection job
- Priority: manual re-analysis (10) > new uploads (5) > batch processing (0)

### Gallery View
- Include tag counts in gallery response
- Include tagging health in gallery detail

### Search
- Extend unified search to weight AI tags
- Add "photos with tag X" filter endpoint

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Two face systems create confusion | Document clear migration path; deprecate face_detections |
| AI provider costs | Cache all results; never re-call for existing photos |
| Large gallery performance | Use cursor pagination; cache aggregates |
| Provider outages | Circuit breaker already exists; graceful degradation |
