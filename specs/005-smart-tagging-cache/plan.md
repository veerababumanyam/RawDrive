# Implementation Plan: Smart Local Tagging Layer

**Branch**: `005-smart-tagging-cache` | **Date**: 2025-12-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-smart-tagging-cache/spec.md`

---

## Summary

The Smart Local Tagging Layer caches and reuses AI-generated tags and face recognition results to enable instant gallery search and filtering without repeated external API calls. The implementation **extends existing infrastructure** (tags, faces, search services) rather than replacing it, adding AI tag source tracking, asset analysis state, and a content detection worker following the proven face_detection_worker pattern.

**Key Design Decision**: Extend `asset_tags` table with `source`, `confidence`, and `ai_metadata` columns rather than creating parallel tables. This maintains backward compatibility and leverages existing search infrastructure.

---

## Technical Context

**Language/Version**: Python 3.11+ (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, asyncpg 0.29+, pgvector
**Storage**: PostgreSQL 16 (pgvector for embeddings), Redis 7 (caching)
**Testing**: pytest (backend), Vitest (frontend)
**Target Platform**: Linux server (Docker), Modern browsers
**Project Type**: Web application (frontend + backend)
**Performance Goals**: <1s search for 10,000 photos, 90%+ AI cost reduction
**Constraints**: No external AI calls for cached data, graceful degradation on provider outage
**Scale/Scope**: Millions of photos per workspace, 10 concurrent galleries processing

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file contains template placeholders, so applying RawDrive's established patterns:

| Gate | Status | Notes |
|------|--------|-------|
| Workspace isolation | **PASS** | All tables include `workspace_id`, queries filter by workspace |
| Extend vs. replace | **PASS** | Extends existing `tags`, `faces`, `face_groups` tables |
| Provider abstraction | **PASS** | Uses existing `provider_manager.py` with failover |
| Background processing | **PASS** | Follows `face_detection_worker` polling pattern |
| No secrets in code | **PASS** | Uses existing credential management via env vars |
| Migration strategy | **PASS** | Additive columns with defaults, backward compatible |

---

## Project Structure

### Documentation (this feature)

```text
specs/005-smart-tagging-cache/
├── plan.md              # This file
├── research.md          # Phase 0 output - existing infrastructure analysis
├── data-model.md        # Phase 1 output - schema extensions
├── quickstart.md        # Phase 1 output - implementation guide
├── contracts/           # Phase 1 output - API specifications
│   └── api.yaml         # OpenAPI 3.1 contract
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/versions/
│   ├── 0041_smart_tagging_extensions.py    # Extend asset_tags
│   ├── 0042_asset_analysis.py              # Analysis tracking
│   ├── 0043_content_detection_jobs.py      # Job queue
│   ├── 0044_face_groups_person_link.py     # Person linking
│   └── 0045_gallery_tagging_stats.py       # Materialized view
├── src/app/
│   ├── api/v1/
│   │   ├── smart_tagging.py                # New endpoints
│   │   ├── tags.py                         # Extended
│   │   ├── face_groups.py                  # Extended
│   │   └── search.py                       # Extended
│   ├── services/
│   │   ├── content_detection_service.py    # New
│   │   ├── content_detection_worker.py     # New
│   │   ├── tagging_health_service.py       # New
│   │   ├── tag_service.py                  # Extended
│   │   ├── face_cluster_service.py         # Extended
│   │   └── search_service.py               # Extended
│   ├── repositories/
│   │   ├── asset_analysis_repository.py    # New
│   │   └── content_job_repository.py       # New
│   └── workers/
│       └── content_worker_main.py          # New entrypoint
└── tests/
    ├── unit/
    │   ├── test_content_detection_service.py
    │   ├── test_tag_service_ai.py
    │   └── test_tagging_health_service.py
    └── integration/
        ├── test_smart_tagging_flow.py
        └── test_face_naming_search.py

frontend/
├── src/
│   ├── components/features/gallery/
│   │   ├── AssetTagPanel.tsx               # New
│   │   ├── TaggingHealthBadge.tsx          # New
│   │   ├── GallerySearchBar.tsx            # Extended
│   │   └── FaceGroupNaming.tsx             # New
│   ├── hooks/
│   │   ├── useAssetTags.ts                 # New
│   │   ├── useAssetAnalysis.ts             # New
│   │   ├── useGalleryTaggingHealth.ts      # New
│   │   └── useAssetSearch.ts               # Extended
│   └── services/
│       └── api.ts                          # Extended
└── tests/
    └── components/
        └── AssetTagPanel.test.tsx
```

**Structure Decision**: Web application structure extending existing backend/frontend organization. New services follow existing patterns (singleton, async, workspace-scoped).

---

## Research Summary

See [research.md](./research.md) for full analysis. Key findings:

| Question | Resolution |
|----------|------------|
| Tag storage approach | Extend existing `tags`/`asset_tags` with source column |
| Face clustering | Use `faces`/`face_groups` (pgvector), link to `people` for naming |
| Job queue system | PostgreSQL polling (matches face_detection_worker) |
| AI providers | Use existing Cloud Vision → Gemini → Local failover |
| Search infrastructure | Extend `SearchService` with tag source filtering |

---

## Data Model Summary

See [data-model.md](./data-model.md) for full schema. Key changes:

### Schema Extensions

| Table | Change | Purpose |
|-------|--------|---------|
| `asset_tags` | Add `source`, `confidence`, `ai_metadata` | Distinguish AI vs manual tags |
| `face_groups` | Add `person_id` | Link clusters to named people |

### New Tables

| Table | Purpose |
|-------|---------|
| `asset_analysis` | Track AI processing state per asset |
| `content_detection_jobs` | Queue for content analysis (mirrors face_detection_jobs) |
| `gallery_tagging_stats` | Materialized view for health metrics |

---

## API Contract Summary

See [contracts/api.yaml](./contracts/api.yaml) for full OpenAPI spec. Key endpoints:

### New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/assets/{id}/analysis` | Get asset AI analysis status |
| POST | `/assets/{id}/reanalyze` | Queue single asset for re-analysis |
| POST | `/assets/reanalyze/bulk` | Queue multiple assets for re-analysis |
| GET | `/galleries/{id}/tagging-health` | Get gallery tagging completion stats |
| GET | `/tagging-health` | Get workspace-wide tagging overview |
| PUT | `/face-groups/{id}/name` | Assign person name to face cluster |
| GET | `/galleries/{id}/filter` | Filter assets by tags/people |

### Extended Endpoints

| Endpoint | Extension |
|----------|-----------|
| `GET /assets/{id}/tags` | Add `source` query param (all/manual/ai) |
| `POST /assets/tags/bulk` | Bulk add/remove tags across assets |
| `GET /search` | Add `tag_source` filter param |

---

## Implementation Phases

### Phase 1: Database Schema
- Migrations 0041-0045
- Repository classes for new tables
- Backward-compatible (no breaking changes)

### Phase 2: Content Detection Worker
- `ContentDetectionService` for orchestration
- `ContentDetectionWorker` following face_detection_worker pattern
- Integration with existing AI provider infrastructure

### Phase 3: Tag Service Extensions
- Add AI tag CRUD methods to `TagService`
- Update `SearchService` for tag source filtering
- Face group → person linking in `FaceClusterService`

### Phase 4: API Layer
- New smart_tagging endpoints
- Extended tags, face_groups, search endpoints
- Request/response schemas

### Phase 5: Frontend
- Asset tag panel with AI/manual distinction
- Tagging health badges in gallery views
- Enhanced search with tag/person filters
- Face group naming UI

### Phase 6: Integration & Testing
- Upload pipeline integration
- Worker container configuration
- End-to-end testing
- Performance validation

---

## Complexity Tracking

No constitution violations requiring justification. Design follows established patterns:

| Pattern | Existing Example | This Feature |
|---------|------------------|--------------|
| PostgreSQL job queue | `face_detection_jobs` | `content_detection_jobs` |
| Workspace isolation | All existing tables | All new tables |
| Provider failover | `provider_manager.py` | Reused directly |
| Singleton services | `get_tag_service()` | Same pattern |
| Materialized views | N/A | New, but standard PostgreSQL |

---

## Next Steps

Run `/speckit.tasks` to generate detailed implementation tasks from this plan.
