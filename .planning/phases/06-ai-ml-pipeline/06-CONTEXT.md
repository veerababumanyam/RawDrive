# Phase 6: AI/ML Pipeline - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the full AI/ML pipeline: CLIP embedding computation, pgvector storage with HNSW indexing, hash-based and embedding-based duplicate detection, DBSCAN clustering for curation, and persistent similarity groups. Offload image processing to ai-processing-service.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion. Specific targets:

- AI-01: CLIP ViT-B/32 pre-baked in Docker image (no runtime download)
- AI-02: CLIPEmbedder wired to backend similarity_worker via Celery
- AI-03: Batch embedding computation processes photos asynchronously
- AI-04: Embeddings stored in pgvector with HNSW index (m=16, ef_construction=64)
- AI-05: Hash-based duplicate detection fixed — image byte fetching from R2 working
- AI-06: Embedding-based duplicate detection using cosine similarity threshold
- AI-07: DBSCAN clustering groups similar photos for culling/curation
- AI-08: Similarity groups stored in database/Redis (not in-memory)
- PERF-01: Image processing moved from main backend to ai-processing-service
- PERF-02: Duplicate detection query uses indexed lookups
- PERF-03: Similarity groups migrated from in-memory to Redis

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `services/ai-processing-service/` — stabilized in Phase 3, runs on port 8012
- `backend/src/app/workers/similarity_worker.py` — existing similarity worker
- `backend/src/app/workers/curation_worker.py` — curation processing worker
- `backend/src/app/ai/` — AI module directory
- `backend/src/app/services/smart_curation_service.py` — curation logic
- `backend/src/app/services/photo_quality_service.py` — photo quality analysis

### Established Patterns
- Celery workers for async processing
- pgvector extension available in PostgreSQL
- R2 storage for photo assets
- 3-layer architecture

### Integration Points
- Upload flow triggers embedding computation
- Similarity worker connects to ai-processing-service for CLIP inference
- pgvector column on assets/photos table
- Curation UI consumes similarity groups

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond REQUIREMENTS.md (AI-01 through AI-08, PERF-01 through PERF-03).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
