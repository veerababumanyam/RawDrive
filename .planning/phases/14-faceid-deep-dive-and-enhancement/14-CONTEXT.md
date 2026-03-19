# Phase 14: FaceID Deep Dive & Enhancement - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers a **fully reliable, polished, and competitive face identification system** for RawDrive. It covers:
- Fixing all known face detection/grouping/display bugs
- Enhancing the face management UX to competitive parity with Google Photos/Apple Photos
- Improving performance, caching, and error handling
- Strengthening GDPR biometric consent compliance
- Adding missing features identified through competitive research

**Out of scope:** New AI models (stick with ArcFace/InsightFace), new microservices, SSR/SEO for face pages.

</domain>

<decisions>
## Implementation Decisions

### Bug Fixes & Reliability (Priority 1)
- Fix FaceGroupResponse Pydantic 500 errors (duplicate `id` parameter in validation)
- Fix missing face avatars: ensure all face_groups have representative_face_id with valid thumbnail_urls
- Fix stuck/failed face detection jobs: implement proper timeout enforcement with asyncio.wait_for()
- Fix biometric consent flow for free-tier users (consent check failures blocking face detection)
- Fix API response format inconsistency (data/meta format vs direct arrays)
- Fix state sync after mutations (stale merge suggestions appearing after merge)
- Remove or gate the BYPASS_CONSENT_CHECKS environment variable (GDPR Article 9 violation risk)

### Performance & Infrastructure (Priority 2)
- Add pgvector HNSW index on face embedding column (currently O(n) scan, will timeout at >100k faces)
- Batch centroid recalculation (currently recalculates on every single face assignment)
- Implement proper cache invalidation across distributed workers (L1/L2/L3 coherence)
- Set actual SHA-256 hash for ONNX model integrity validation (currently None)
- Increase concurrent job limit from 2 (investigate OOM root cause first)
- Implement eager model loading on service startup (eliminate cold start latency)

### Security & Compliance (Priority 3)
- Remove embedding vectors from API responses (only return for internal similarity search)
- Add consent validation in background workers (currently only enforced at API level)
- Verify cascade delete on consent withdrawal actually removes all embeddings
- Add `withdrawn_by_user_id` to consent audit trail
- Implement deadlock prevention in merge operations (ordered transaction lock acquisition)

### UX Enhancements (Priority 4)
- Fix mobile responsiveness: replace fixed panel widths with responsive breakpoints
- Add keyboard navigation: proper escape handling, tab focus, arrow key navigation in face grid
- Add error boundaries around face operations
- Unify PersonCard responsive behavior across PeoplePage and PeoplePanel
- Add face confidence score filtering
- Add undo for merge operations
- Add context menu for quick face group actions (rename, merge, delete)
- Add face quality indicators

### Claude's Discretion
- Specific pgvector index type (HNSW vs IVFFlat) — choose based on data volume analysis
- Cache TTL strategy for centroid cache (adaptive vs fixed)
- Specific merge modal keyboard interaction patterns
- Error boundary placement granularity
- Rate limit enforcement strategy for bulk operations

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **261 Python files** reference face features across backend, services, repositories
- **908+ TypeScript files** reference face features across frontend
- **20+ API endpoints** for face CRUD, groups, merge/split, search, consent, retention, rate limits
- **Multi-tier caching system**: L1 memory (32MB), L2 Redis (256MB LRU), L3 database
- **InsightFace models**: buffalo_l/m/s, antelopev2 with ArcFace 512D embeddings
- **Property-based tests**: 5 property test suites for face operations
- **Comprehensive error codes**: FaceDetectionErrorCode enum with user-friendly messages
- **Biometric consent system**: Full GDPR Article 9 consent flow with audit trail

### Established Patterns
- 3-layer architecture: API → Service → Repository (mandatory)
- Multi-tenant isolation via workspace_id on every query
- Celery workers for async face processing (late ack, retry with backoff)
- FaceGroupHistory for audit trail on group mutations
- Rate limiting per workspace (face_search_rpm, daily_quota)

### Integration Points
- **Upload pipeline** → triggers face detection via Celery worker
- **Gallery detail page** → PeoplePanel for gallery-scoped face groups
- **People page** → workspace-level face group management
- **Public gallery** → ClientPeopleFilter (read-only face filter)
- **Photo lightbox** → FaceOverlay with FaceBox and PersonSelector
- **AI Processing Service** (port 8012) → detection, embedding, comparison endpoints
- **Milvus** (optional, disabled by default) → vector similarity search
- **pgvector** → default vector search backend

### Key File Locations
**Backend Core:**
- Models: `backend/src/app/models/face.py`, `face_group.py`, `face_assignment.py`
- Services: `backend/src/app/services/face_*.py` (15+ service files)
- Repositories: `backend/src/app/repositories/face_*.py` (6 repository files)
- API: `backend/src/app/api/v1/faces.py`, `face_groups.py`, `people.py`, `biometric_consent.py`
- Workers: `backend/src/app/face_worker_main.py`, `workers/face_retention_worker.py`

**AI Processing:**
- Detection: `services/ai-processing-service/src/services/face_detection_service.py` (22KB)
- Embeddings: `services/ai-processing-service/src/services/face_embedding_service.py` (26KB)
- Worker: `services/ai-processing-service/src/workers/face_detection_worker.py`

**Frontend:**
- Pages: `frontend/src/pages/workspace/PeoplePage.tsx`
- Components: `frontend/src/components/features/gallery/PeoplePanel.tsx`, `FaceOverlay`, `FaceBox`
- Services: `frontend/src/services/faceApiService.ts`
- Hooks: `usePeople`, `useFaceCache`, `useFacesSummary`, `usePeopleMerge`

**Diagnostic Scripts (reveal known bugs):**
- `backend/scripts/fix_face_avatars.py` — missing avatar fix
- `backend/scripts/diagnose_face_avatars.py` — avatar debugging
- `backend/src/scripts/diagnose_face_pipeline.py` — pipeline debugging
- `backend/src/scripts/reset_failed_face_jobs.py` — stuck job cleanup
- `backend/reproduce_500.py` — FaceGroupResponse 500 error reproduction
- `backend/reproduce_issue.py` — consent flow error reproduction
- `backend/verify_face_config.py` — config validation

</code_context>

<specifics>
## Specific Ideas

- User wants face features to "work seamlessly" — reliability is top priority
- User wants competitive parity with Google Photos, Apple Photos, Lightroom
- User wants "best of breed" face management UX — not just functional but polished
- The Google Cloud Vision service account key (`docs/RawDrivFaceID.json`) should be moved out of git entirely (security)
- Diagnostic scripts suggest a pattern of production bugs that were band-aided rather than properly fixed — this phase should fix root causes
- Face system already has sophisticated architecture (3-layer, multi-tier cache, GDPR consent, property tests) — the gap is in reliability and UX polish

</specifics>

<deferred>
## Deferred Ideas

- New AI model evaluation (e.g., CLIP-based face search, multi-modal face description)
- Pet detection (Google Photos feature)
- Face-based memory/highlight creation
- SSR for face pages
- Cross-workspace face matching (enterprise feature)
- Face-based auto-album creation
- Video frame face detection

</deferred>
