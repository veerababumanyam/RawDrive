# Implementation Plan: AI-Powered Photo Features

**Branch**: `010-ai-powered-features` | **Date**: 2025-12-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-ai-powered-features/spec.md`

## Summary

Implement AI-powered photo features using customer-provided Gemini API keys, leveraging the existing AI infrastructure (gemini_client_service, content_detection_service) to add comprehensive photo analysis with quality scoring, multi-tone caption generation, categorized hashtag generation, gallery story generation, and smart photo curation with duplicate detection.

## Technical Context

**Language/Version**: Python 3.11+ (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, google-generativeai SDK, Pydantic 2.7+, asyncpg 0.29+
**Storage**: PostgreSQL 16 (JSONB for analysis results, pgvector for embeddings), Redis 7 (caching, job queues)
**Testing**: pytest (backend), Vitest (frontend)
**Target Platform**: Linux server (backend), Web browsers (frontend)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: <30s photo analysis, <15s captions, <10s hashtags, <30s gallery stories
**Constraints**: Rate limit 30 AI ops/minute/workspace, customer-provided API keys only, no hardcoded credentials
**Scale/Scope**: 10k users, 1M photos, multi-workspace isolation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Max 3 projects | ✅ Pass | Using existing backend + frontend (2 projects) |
| Single source of truth | ✅ Pass | Database-first, API contracts define interface |
| No premature abstractions | ✅ Pass | Extending existing patterns (gemini_client_service) |
| Mobile-first | ✅ Pass | Existing responsive design system |
| WCAG 2.1 AA | ✅ Pass | Following accessibility guidelines |
| No hardcoded secrets | ✅ Pass | User-provided API keys, env-based configuration |

## Project Structure

### Documentation (this feature)

```text
specs/010-ai-powered-features/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output (complete)
├── data-model.md        # Phase 1 output (complete)
├── quickstart.md        # Phase 1 output (complete)
├── contracts/           # Phase 1 output (complete)
│   └── ai-features-api.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/
│   └── app/
│       ├── api/v1/
│       │   └── smart_tagging.py      # Extend with new endpoints
│       ├── services/
│       │   ├── photo_analysis_service.py      # Existing - extend
│       │   ├── caption_hashtag_service.py     # Existing - extend
│       │   ├── gallery_story_service.py       # New - gallery narratives
│       │   ├── smart_curation_service.py      # New - photo curation
│       │   └── duplicate_detection_service.py # New - pHash detection
│       ├── repositories/
│       │   └── ai_job_repository.py           # New - job queue repo
│       └── models/
│           └── ai_models.py                   # Extend with new schemas
└── tests/
    ├── unit/
    │   └── services/
    │       └── test_ai_services.py            # AI service tests
    └── integration/
        └── test_smart_tagging.py              # API integration tests

frontend/
├── src/
│   ├── components/
│   │   └── features/
│   │       └── ai/
│   │           ├── PhotoAnalysisPanel.tsx     # Analysis results UI
│   │           ├── CaptionGenerator.tsx       # Caption generation UI
│   │           ├── HashtagGenerator.tsx       # Hashtag generation UI
│   │           ├── GalleryStoryPanel.tsx      # Story generation UI
│   │           ├── SmartCurationPanel.tsx     # Curation UI
│   │           └── DuplicateDetector.tsx      # Duplicate detection UI
│   ├── hooks/
│   │   └── useAIFeatures.ts                   # AI operations hooks
│   ├── services/
│   │   └── aiService.ts                       # AI API client
│   └── types/
│       └── aiFeatures.ts                      # TypeScript types
└── tests/
    └── components/
        └── ai/
            └── ai.test.tsx                    # Component tests
```

**Structure Decision**: Web application (Option 2) - extending existing backend/frontend structure with new AI feature modules.

## Complexity Tracking

> No constitution violations - existing patterns fully support this feature.

## Generated Artifacts

| Artifact | Status | Description |
|----------|--------|-------------|
| [research.md](./research.md) | ✅ Complete | Gemini API patterns, architecture decisions |
| [data-model.md](./data-model.md) | ✅ Complete | Schema extensions, migrations, JSON validation |
| [contracts/ai-features-api.yaml](./contracts/ai-features-api.yaml) | ✅ Complete | OpenAPI 3.0 contract for all endpoints |
| [quickstart.md](./quickstart.md) | ✅ Complete | Development setup and testing guide |

## Implementation Phases

### Phase 1: Core Photo Analysis (P1)
- Extend photo_analysis_service.py with full analysis response
- Add quality scoring (sharpness, exposure, composition → 1-5 stars)
- Add dominant colors, lighting, mood detection
- Add improvement suggestions
- Cache results in asset_analysis table

### Phase 2: Caption & Hashtag Generation (P1)
- Extend caption_hashtag_service.py with multi-tone support
- Add professional/casual/poetic tone selection
- Add categorized hashtag generation (trending/niche/general/branded)
- Implement copy-to-clipboard functionality

### Phase 3: Gallery Story Generation (P2)
- Create gallery_story_service.py
- Aggregate analyzed photos into narrative
- Support short/medium/long lengths
- Support professional/casual/poetic/journalistic tones
- Require minimum 5 analyzed photos

### Phase 4: Smart Curation (P2)
- Create smart_curation_service.py
- Rank photos by quality score
- Apply diversity filtering (avoid near-duplicates)
- Support "prefer people" criteria
- Mark selections as "Highlights"

### Phase 5: Duplicate Detection (P2)
- Create duplicate_detection_service.py
- Implement pHash-based similarity comparison
- Group photos >85% similarity
- Provide "Keep Best" action
- Move non-selected to "To Review" folder

### Phase 6: Frontend Components
- Create PhotoAnalysisPanel.tsx
- Create CaptionGenerator.tsx
- Create HashtagGenerator.tsx
- Create GalleryStoryPanel.tsx
- Create SmartCurationPanel.tsx
- Create DuplicateDetector.tsx
- Create useAIFeatures.ts hook

### Phase 7: Testing & Documentation
- Unit tests for all services (mocked AI responses)
- Integration tests for API endpoints
- Update API documentation
- Add user-facing help content

## Next Steps

Run `/speckit.tasks` to generate actionable implementation tasks.
