# Implementation Plan: Enhanced Smart Curate - AI Photo Culling System

**Branch**: `023-enhanced-smart-curate` | **Date**: 2026-01-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-enhanced-smart-curate/spec.md`

## Summary

Enhanced Smart Curate is a production-grade AI-powered photo culling system that enables professional photographers to intelligently curate large galleries (up to 10,000 photos). The system leverages the user's Gemini API key to provide quality scoring, duplicate grouping, expression analysis, moment detection, and target-count culling with variety preservation. Built on a modular architecture with 7 reusable service modules, elastic auto-scaling (KEDA-based scale-to-zero), and comprehensive observability.

## Technical Context

**Language/Version**: Python 3.11 (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 19, Celery, CLIP (image embeddings), Gemini Vision API
**Storage**: PostgreSQL 16 + pgvector extension, Redis 7, Cloudflare R2
**Testing**: pytest (backend 85% coverage target), Vitest (frontend 70% coverage target)
**Target Platform**: Web application (SPA + API)
**Project Type**: Web application (frontend + backend)
**Performance Goals**:
- Quality analysis: 1,000 photos in < 5 minutes
- Similarity grouping: 1,000 photos in < 2 minutes
- Target-count curation: 3,000→500 in < 30 seconds post-analysis
- UI operations: < 2 seconds at 5K concurrent users
**Constraints**:
- API response: < 100ms for session retrieval
- Elastic scaling: 0 workers when idle (cost optimization)
- Memory: CLIP embedding workers require GPU instances
**Scale/Scope**: 5,000 concurrent users, 10,000 photos per gallery, 1M photos/day throughput

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with RawDrive Constitution (`.specify/memory/constitution.md`):

- [x] **I. Security**: Gemini API keys encrypted at rest via EncryptionService, parameterized queries, Zod/Pydantic validation at API boundaries, no PII in logs
- [x] **II. Accessibility**: Curation panel follows WCAG 2.1 AA, keyboard navigation for comparison view, focus indicators on all interactive elements
- [x] **III. Design System**: Uses design tokens for quality badges, AppButton/AppInput components, supports dark mode
- [x] **IV. Multi-Tenant Isolation**: All queries include workspace_id, curation sessions scoped to workspace, RBAC enforced via middleware
- [x] **V. Testing**: Coverage targets defined (95% auth/security paths, 85% services, 70% UI components)
- [x] **VI. Clean Code**: Modular service design with single responsibility, max file lengths respected, no over-engineering
- [x] **VII. Observability**: Structured logging with correlation IDs, Prometheus metrics for analysis throughput, audit trail for session operations

## Project Structure

### Documentation (this feature)

```text
specs/023-enhanced-smart-curate/
├── spec.md              # Feature specification (complete)
├── architecture.md      # Production architecture design (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI specs)
│   ├── curation-api.yaml
│   ├── quality-api.yaml
│   └── similarity-api.yaml
├── checklists/
│   └── requirements.md  # Quality validation checklist (complete)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── api/v1/
│   │   ├── smart_tagging.py         # Existing - extend with new endpoints
│   │   └── curation_sessions.py     # NEW: Session management endpoints
│   ├── services/
│   │   ├── smart_curation_service.py      # Existing - major enhancement
│   │   ├── photo_quality_service.py       # NEW: Quality analysis module
│   │   ├── similarity_grouping_service.py # NEW: Duplicate detection module
│   │   ├── expression_analysis_service.py # NEW: Face expression module
│   │   ├── scene_detection_service.py     # NEW: Moment/scene detection
│   │   ├── curation_selection_service.py  # NEW: Target-count culling logic
│   │   ├── curation_session_service.py    # NEW: Session management
│   │   └── preference_learning_service.py # NEW: User preference learning
│   ├── repositories/
│   │   ├── curation_session_repository.py # NEW
│   │   ├── photo_quality_repository.py    # NEW
│   │   └── similarity_group_repository.py # NEW
│   ├── workers/
│   │   ├── quality_analysis_worker.py     # NEW: Celery task for analysis
│   │   ├── similarity_worker.py           # NEW: Embedding + clustering
│   │   └── curation_worker.py             # NEW: Selection algorithm
│   └── schemas/
│       └── curation_schemas.py            # NEW: Pydantic models
├── migrations/versions/
│   └── 0078_enhanced_smart_curate.py      # NEW: Database schema
└── tests/
    ├── unit/
    │   └── services/test_curation_*.py
    └── integration/
        └── api/test_curation_endpoints.py

frontend/
├── src/
│   ├── components/features/ai/
│   │   ├── SmartCurationPanel.tsx         # Existing - major enhancement
│   │   ├── CurationSessionManager.tsx     # NEW: Session controls
│   │   ├── PhotoGroupCard.tsx             # NEW: Similarity group display
│   │   ├── QualityBadge.tsx               # NEW: Quality score badge
│   │   ├── ComparisonView.tsx             # NEW: Side-by-side compare
│   │   ├── tabs/CurateTab.tsx             # NEW: Curation tab with inline progress
│   │   └── PresetSelector.tsx             # NEW: Curation presets
│   ├── hooks/
│   │   ├── useCurationSession.ts          # NEW
│   │   ├── useSimilarityGroups.ts         # NEW
│   │   └── useQualityAnalysis.ts          # NEW
│   ├── services/
│   │   └── curationService.ts             # NEW: API client
│   └── types/
│       └── curation.ts                    # NEW: TypeScript types
└── tests/
    └── components/ai/
        └── SmartCurationPanel.test.tsx

infrastructure/
└── kubernetes/
    └── keda/
        ├── analysis-worker-scaler.yaml    # NEW: Elastic scaling config
        ├── grouping-worker-scaler.yaml    # NEW
        └── curation-worker-scaler.yaml    # NEW
```

**Structure Decision**: Web application with enhanced backend services and frontend components. All new modules follow existing patterns in `backend/src/app/services/` and `frontend/src/components/features/ai/`.

## Complexity Tracking

> No Constitution violations requiring justification. Design adheres to all 7 principles.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

---

## Phase 0: Research Tasks

Based on Technical Context, the following areas need research:

### R1: CLIP Embedding Service Integration
- **Question**: How to efficiently compute CLIP embeddings for similarity detection?
- **Context**: Need 512-dim embeddings for 10K photos per gallery
- **Research**: Best practices for CLIP in production, GPU vs CPU trade-offs

### R2: pgvector Similarity Search Performance
- **Question**: How to optimize vector similarity search at scale?
- **Context**: 1M+ embeddings across all workspaces
- **Research**: IVFFlat vs HNSW indexing, partitioning strategies

### R3: Gemini Vision API Batch Processing
- **Question**: Optimal batch size and rate limiting for quality analysis?
- **Context**: User's own API key with variable quotas
- **Research**: Gemini API limits, batch image analysis patterns

### R4: Celery + KEDA Integration
- **Question**: How to configure Celery for elastic scale-to-zero?
- **Context**: Workers should scale from 0 based on queue depth
- **Research**: KEDA ScaledObject configuration for Celery queues

### R5: Curation Algorithm Design
- **Question**: How to balance quality, diversity, and story coverage?
- **Context**: Target-count culling with variety preservation
- **Research**: Photo curation algorithms, diversity sampling techniques

---

## Phase 1: Design Artifacts

### 1.1 Data Model (→ data-model.md)

Extract from spec.md Key Entities:
- CurationSession
- PhotoQualityAnalysis
- SimilarityGroup
- SceneCategory
- UserCurationPreference
- CurationPreset

### 1.2 API Contracts (→ contracts/)

Extract from FR-001 to FR-035:
- Session management endpoints
- Quality analysis endpoints
- Similarity grouping endpoints
- Curation selection endpoints
- Preference learning endpoints

### 1.3 Quickstart Guide (→ quickstart.md)

Developer setup for:
- Local development environment
- Running curation workers
- Testing with mock Gemini responses

---

## Next Steps

1. **Phase 0**: Generate `research.md` with decisions on R1-R5
2. **Phase 1**: Generate `data-model.md`, `contracts/`, `quickstart.md`
3. **Update agent context**: Run `.specify/scripts/bash/update-agent-context.sh`
4. **Phase 2**: Run `/speckit.tasks` to generate implementation tasks
