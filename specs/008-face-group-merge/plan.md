# Implementation Plan: Face Group Merge & Primary Face Selection

**Branch**: `008-face-group-merge` | **Date**: 2025-12-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-face-group-merge/spec.md`

## Summary

Enable users to merge multiple face groups representing the same person into a unified group, designate a primary face for improved thumbnail display and similarity matching, and receive system-suggested merge candidates based on embedding similarity.

**Existing Infrastructure**:
- Backend: Two-group merge API (`/face-groups/merge`) and split API exist
- Frontend: PeoplePanel with single-group selection
- Database: `face_groups.representative_face_id` column exists but isn't user-selectable

**New Capabilities**:
- Multi-group merge (3+ groups in single operation)
- Primary face selection UI with weighted centroid recalculation
- Merge suggestions based on centroid similarity
- Multi-select mode in People panel

## Technical Context

**Language/Version**: Python 3.11 (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, SQLAlchemy 2.0+, asyncpg 0.29+, pgvector
**Storage**: PostgreSQL 16 with pgvector extension, Redis 7 (for caching)
**Testing**: pytest (Backend), Vitest + React Testing Library (Frontend)
**Target Platform**: Web application (SaaS)
**Project Type**: Web (frontend + backend)
**Performance Goals**: Merge operation < 2s, similarity search < 100ms for 10k groups
**Constraints**: Multi-tenant isolation via workspace_id, max 100 groups per merge operation
**Scale/Scope**: Workspaces with 1000+ face groups, 100k+ detected faces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| Multi-tenancy | PASS | All queries filtered by workspace_id |
| Security | PASS | JWT auth, workspace access validation |
| Testing | PASS | Unit + integration tests planned |
| Simplicity | PASS | Extends existing merge/split architecture |
| Accessibility | PASS | ARIA patterns for selection mode |

## Project Structure

### Documentation (this feature)

```text
specs/008-face-group-merge/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── openapi.yaml     # API contract additions
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── api/
│   │   ├── face_schemas.py           # Add MultiMergeFaceGroupsRequest
│   │   └── v1/face_groups.py         # Add multi-merge, set-primary, suggestions endpoints
│   ├── services/
│   │   ├── face_cluster_service.py   # Add multi_merge_groups, weighted centroid
│   │   └── face_suggestion_service.py # NEW: Merge suggestion logic
│   └── repositories/
│       └── face_group_repository.py  # Add find_all_similar_pairs
└── tests/
    ├── unit/
    │   └── test_face_cluster_service.py
    └── integration/
        └── test_face_group_merge_api.py

frontend/
├── src/
│   ├── components/features/gallery/
│   │   ├── PeoplePanel.tsx           # Add selection mode
│   │   ├── FaceGroupMergeModal.tsx   # NEW: Merge confirmation dialog
│   │   ├── FaceGroupDetailPanel.tsx  # NEW: View faces, set primary
│   │   └── MergeSuggestionCard.tsx   # NEW: Suggestion UI
│   ├── hooks/
│   │   └── useFaceGroupMerge.ts      # NEW: Merge mutation hook
│   └── services/
│       └── faceApiService.ts         # Add multi-merge, set-primary methods
└── tests/
    └── components/
        └── FaceGroupMergeModal.test.tsx
```

**Structure Decision**: Web application with frontend (React) and backend (FastAPI). Follows existing RawDrive patterns with feature components in `frontend/src/components/features/gallery/` and backend services in `backend/src/app/services/`.

## Complexity Tracking

> No constitution violations requiring justification.
