# GEO (Generative Engine Optimization)

## Overview

GEO is RawDrive's internal AI-powered photo search system that makes photos discoverable through natural language queries. Instead of browsing folders or remembering filenames, photographers can search their libraries using plain English.

**Core Problem**: How do photographers find the right photos without remembering exact filenames or manually tagging everything?

**GEO Solution**: AI-enriched metadata + vector embeddings + semantic search = natural language photo discovery.

## What GEO Enables

| Search Type | Example Query | How It Works |
|-------------|---------------|--------------|
| **Natural Language** | "outdoor wedding photos with golden hour" | Matches AI-generated tags + scene analysis |
| **Visual Similarity** | "photos similar to this one" | CLIP embeddings + cosine similarity |
| **People Search** | "photos with the bride smiling" | Face detection + expression analysis |
| **Technical Search** | "50mm lens, ISO > 1600" | EXIF metadata extraction |
| **Context Search** | "ceremony photos from Smith wedding" | Gallery + event context |

## Current State vs GEO Target

### What RawDrive Has Today

| Capability | Status | Location |
|------------|--------|----------|
| Quality scoring (sharpness, exposure, composition) | ✅ Implemented | `photo_quality_analysis` table |
| CLIP embeddings (512-dim) | ✅ Implemented | `image_embeddings` table |
| Face detection + clustering | ✅ Implemented | `detected_faces`, `face_groups` tables |
| Blur detection | ✅ Implemented | `photo_quality_analysis.blur_*` columns |
| AI content tagging | ✅ Implemented | `ContentDetectionService` |
| Similarity grouping | ✅ Implemented | `similarity_groups` table |

### What GEO Adds

| Capability | Status | Priority |
|------------|--------|----------|
| Natural language query parsing | 🚧 Not started | P1 |
| Semantic search API | 🚧 Not started | P1 |
| Query-to-embedding matching | 🚧 Not started | P1 |
| Search result ranking | 🚧 Not started | P2 |
| Search analytics/learning | 🚧 Not started | P3 |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GEO Search Service                        │
│  (Parses queries, orchestrates search, ranks results)        │
└────────────┬────────────────────────────────────────────────┘
             │
    ┌────────┴────────┬──────────────┬──────────────┐
    │                 │              │              │
┌───▼────────┐  ┌────▼─────┐  ┌────▼─────┐  ┌────▼────────┐
│  Metadata  │  │ Vector   │  │  Face    │  │   EXIF      │
│  Search    │  │ Search   │  │  Search  │  │   Search    │
│ (tags,     │  │ (CLIP    │  │ (people, │  │ (camera,    │
│  scenes)   │  │ cosine)  │  │ groups)  │  │  settings)  │
└───┬────────┘  └────┬─────┘  └────┬─────┘  └────┬────────┘
    │                │              │              │
    └────────────────┴──────────────┴──────────────┘
                            │
              ┌─────────────▼─────────────┐
              │    PostgreSQL + pgvector   │
              │  (existing RawDrive DB)    │
              └───────────────────────────┘
```

## Implementation Plan

### Phase 1: Search API Foundation (P1)

**Goal**: Basic natural language search that uses existing data.

1. **Create GEO Search Endpoint**
   - `POST /api/v1/workspaces/{id}/search`
   - Accept natural language query string
   - Return ranked photo results

2. **Query Parser**
   - Extract intent: what kind of photos?
   - Extract filters: people, dates, technical specs
   - Extract mood/scene descriptors

3. **Search Execution**
   - Query `photo_quality_analysis` for quality filters
   - Query `image_embeddings` for visual similarity
   - Query face tables for people filters
   - Combine and rank results

**Existing tables to leverage**:
```sql
-- Quality and technical data
SELECT * FROM photo_quality_analysis WHERE workspace_id = ?;

-- Visual similarity (pgvector)
SELECT * FROM image_embeddings
WHERE workspace_id = ?
ORDER BY embedding <=> query_embedding
LIMIT 20;

-- Face/people data
SELECT * FROM detected_faces df
JOIN face_groups fg ON df.face_group_id = fg.face_group_id
WHERE fg.workspace_id = ?;
```

### Phase 2: Enhanced Metadata (P2)

**Goal**: Richer AI-generated metadata for better search.

1. **Scene Classification**
   - Extend `ContentDetectionService` to tag scenes (ceremony, reception, portraits, candids)
   - Store in `asset_analysis.ai_metadata` JSONB

2. **Mood/Atmosphere Tags**
   - Detect: romantic, joyful, dramatic, serene, energetic
   - Use Gemini Vision for analysis

3. **Activity Detection**
   - Tag actions: dancing, kissing, laughing, walking, posing
   - Enable queries like "photos of people dancing"

### Phase 3: Search Learning (P3)

**Goal**: Improve search over time based on usage.

1. **Search Analytics**
   - Log queries and which results were clicked/downloaded
   - Identify common search patterns

2. **Result Feedback**
   - "Was this helpful?" on search results
   - Use feedback to tune ranking

## Database Schema

### Existing Tables (Already Available)

```sql
-- Photo quality scores (migration 0085)
photo_quality_analysis (
  asset_id UUID PRIMARY KEY,
  workspace_id UUID,
  overall_score DECIMAL(5,2),
  sharpness_score DECIMAL(5,2),
  exposure_score DECIMAL(5,2),
  composition_score DECIMAL(5,2),
  blur_detected BOOLEAN,
  blur_severity blur_severity,  -- none/slight/moderate/severe
  blur_type VARCHAR(50)
)

-- CLIP embeddings for similarity (migration 0085)
image_embeddings (
  asset_id UUID PRIMARY KEY,
  workspace_id UUID,
  embedding VECTOR(512),  -- CLIP ViT-B/32
  model_name VARCHAR(100),
  model_version VARCHAR(50)
)

-- Face detection results
detected_faces (
  face_id UUID PRIMARY KEY,
  asset_id UUID,
  workspace_id UUID,
  bounding_box JSONB,
  confidence DECIMAL(5,4),
  embedding VECTOR(512)
)

-- Face grouping (people)
face_groups (
  face_group_id UUID PRIMARY KEY,
  workspace_id UUID,
  name VARCHAR(200),
  representative_face_id UUID
)
```

### New Tables for GEO

```sql
-- Search query logs (for analytics)
CREATE TABLE geo_search_logs (
  search_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  query_text TEXT NOT NULL,
  parsed_intent JSONB,
  result_count INTEGER,
  clicked_asset_ids UUID[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Query embedding cache (for repeated searches)
CREATE TABLE geo_query_embeddings (
  query_hash VARCHAR(64) PRIMARY KEY,
  query_text TEXT NOT NULL,
  embedding VECTOR(512),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Design

### Search Endpoint

```
POST /api/v1/workspaces/{workspace_id}/geo/search
```

**Request**:
```json
{
  "query": "outdoor wedding photos with bride smiling",
  "gallery_id": "optional-gallery-filter",
  "limit": 50,
  "offset": 0
}
```

**Response**:
```json
{
  "results": [
    {
      "asset_id": "uuid",
      "relevance_score": 0.92,
      "match_reasons": ["outdoor scene", "wedding tag", "bride detected", "smiling expression"],
      "thumbnail_url": "..."
    }
  ],
  "total": 127,
  "query_interpretation": {
    "scene": "outdoor",
    "event_type": "wedding",
    "people": ["bride"],
    "expression": "smiling"
  }
}
```

## What to Remove/Simplify

The following sections from the original GEO spec are **not needed** for RawDrive's internal search:

| Original Section | Decision | Reason |
|------------------|----------|--------|
| Complex GEO scoring formula (5 weighted factors) | Remove | Overcomplicated; use simple relevance ranking |
| Semantic relationship graph | Simplify | Use existing `similarity_groups` instead |
| 768-dim embeddings | Correct to 512 | Already using CLIP ViT-B/32 |
| Gallery context propagation | Keep simple | Gallery metadata already exists |
| External AI discoverability | Remove | Not the focus (internal search only) |

## Success Metrics

| Metric | Target |
|--------|--------|
| Search latency (p95) | < 500ms |
| "No results" rate | < 10% |
| Relevant result in top 5 | > 80% |
| Daily active search users | > 20% of photographers |

## Related Files

### Backend Services
- [ai_filter_service.py](../backend/src/app/services/ai_filter_service.py) - Quality filtering
- [smart_curation_service.py](../backend/src/app/services/smart_curation_service.py) - AI curation
- [face_detection_service.py](../backend/src/app/services/face_detection_service.py) - Face detection
- [content_detection_service.py](../backend/src/app/services/content_detection_service.py) - Content tagging
- [vision_service.py](../backend/src/app/services/vision_service.py) - Captions/analysis

### API Endpoints
- [smart_tagging.py](../backend/src/app/api/v1/smart_tagging.py) - Current AI endpoints

### Database Migrations
- [0085_enhanced_smart_curate.py](../backend/migrations/versions/0085_enhanced_smart_curate.py) - Core schema

### Frontend
- [AIToolsHub.tsx](../frontend/src/components/features/ai/AIToolsHub.tsx) - AI interface

## Next Steps

1. **Create GEO search service** (`backend/src/app/services/geo_search_service.py`)
2. **Add search API endpoint** (`backend/src/app/api/v1/geo_search.py`)
3. **Build query parser** using Gemini to extract intent
4. **Create search UI component** for gallery pages
5. **Add search analytics logging**

---

*Last Updated: 2026-01-05*
