# One-Click AI Analysis & Filtering

**Feature**: 025-ai-filter-simplify  
**Status**: Implemented (Backend MVP)  
**Last Updated**: 2026-01-05

## Overview

Unified AI analysis and filtering system that replaces the tabbed AI Tools UI with a streamlined one-click workflow. Photographers can analyze entire galleries, filter by quality/blur/technical scores, apply Smart Collection presets, and save filtered results as sub-galleries.

## Architecture

### Backend

**Endpoints**:
- `POST /workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/analyze` - Start comprehensive AI analysis
- `GET /workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/analyze/progress` - Poll analysis progress
- `GET /workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/analyze/summary` - Get analysis summary stats
- `GET /workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/ai-filter` - Filter assets by AI criteria
- `GET /workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/ai-filter/count` - Get real-time match count
- `GET /workspaces/{workspace_id}/smart-tagging/presets` - List Smart Collection presets
- `POST /workspaces/{workspace_id}/galleries/{gallery_id}/create-from-filter` - Create sub-gallery from filtered assets

**Services**:
- `AIFilterService` - Quality/blur/technical score filtering logic
- `CurationSessionService` - Analysis workflow orchestration (reused)
- `PhotoQualityService` - Quality scoring via Gemini AI
- `GalleryService.create_from_assets()` - Sub-gallery creation from asset lists

**Data Model**:
- `photo_quality_analysis` - Quality scores per asset (overall, sharpness, exposure, composition, blur)
- `curation_sessions` - Analysis workflow state tracking
- `curation_presets` - System and custom Smart Collection presets
- `similarity_groups` + `similarity_group_members` - Photo grouping (future use)
- `asset_analysis.ai_metadata` - Content tags (event type, activity, mood, lighting)

### Frontend

**Components** (Implemented):
- `useAIFilters` hook - Filter state management
- `QualityFilterSection` - Quality tier controls
- `BlurFilterSection` - Blur filtering controls
- `TechnicalScoreFilterSection` - Sharpness/exposure/composition sliders
- `GalleryToolbar` - AI match badge and clear filters link
- `GalleryDetailPage` - Integration point for filters and analysis

**Feature Flag**:
- Backend: `FEATURE_AI_FILTER_SIMPLIFY` env var (default: false)
- Frontend: `VITE_FEATURE_AI_FILTER_SIMPLIFY` env var (default: false)

## Feature Flags

**Backend** (`backend/src/app/config/feature_flags.py`):
```python
FEATURE_AI_FILTER_SIMPLIFY=true  # Enable AI filter endpoints
```

**Frontend** (`frontend/.env`):
```env
VITE_FEATURE_AI_FILTER_SIMPLIFY=true  # Enable AI filter UI
```

All new endpoints are gated by the backend feature flag and return `403 FEATURE_DISABLED` when off.

## API Key Configuration

### Face Detection (Centralized)
- **Google Cloud Vision API**: System-wide service for face detection
- Configured via `GOOGLE_APPLICATION_CREDENTIALS_FILE` environment variable
- Uses centralized Google Cloud service account credentials
- Shared across all workspaces for face detection operations

### AI Analysis Features (User-Specific)
**User-Level Gemini API Keys** (Primary for AI filtering/analysis):
- Each workspace/user configures their own Gemini API key in workspace settings
- Stored securely in `user_gemini_settings` table
- Used for:
  - Quality analysis (sharpness, exposure, composition scores)
  - Blur detection and classification
  - Content tagging (event type, activity, mood, lighting)
  - Smart curation and filtering
- Provides cost isolation and usage tracking per customer

**System Fallback Key** (Optional):
- `GEMINI_API_KEY` environment variable serves as fallback
- Only used when user has not configured their own key
- Useful for trial/demo accounts or system-level operations

**Testing**:
- Use `business@test.rawdrive.in` test account (already has Gemini key configured)
- See `docs/TEST_USERS.md` for complete test account list
- Password for all test users: `Test@123`

## Database Migrations

**Migration 0090**: Inserts three system presets into `curation_presets`:
- **Highlights** (preset_id: `a1b2c3d4-0001-4000-8000-000000000001`)  
  Top 10-15% quality with visual diversity (ratio: 0.12, quality ≥80, similarity ≥0.85)
- **Portraits** (preset_id: `a1b2c3d4-0002-4000-8000-000000000002`)  
  Face-focused selection (quality ≥70, similarity ≥0.80, prioritize expressions)
- **Event Coverage** (preset_id: `a1b2c3d4-0003-4000-8000-000000000003`)  
  Balanced event coverage (ratio: 0.25, quality ≥60, similarity ≥0.75, full story coverage)

Run migration:
```bash
cd backend
alembic upgrade head
```

## Filter Logic

### Quality Tiers
- **Excellent**: `overall_score >= 90`
- **Good**: `overall_score >= 70`
- **Fair**: `overall_score >= 50`
- **All**: No minimum score

### Blur Filtering
- `blur_hide=true`: Hide photos with `blur_detected=true` AND `blur_type != 'bokeh'`
- `blur_show_bokeh=true`: Show artistic bokeh even when hiding blur
- `blur_severity` levels: `none`, `slight`, `moderate`, `severe`

### Technical Scores
- `min_sharpness`: 0-100 (filters `sharpness_score`)
- `min_exposure`: 0-100 (filters `exposure_score`)
- `min_composition`: 0-100 (filters `composition_score`)

All filters use AND semantics (asset must pass all criteria).

## Performance Characteristics

- **Filter Apply**: <2s for ≤5k photos (client-side for <5k, server-side for ≥5k)
- **Analysis Progress**: Updates every ≤5s during analysis
- **Sub-Gallery Creation**: <3s for ≤500 assets (500 asset limit enforced)

## Security & Isolation

- **Workspace Isolation**: All queries filter by `workspace_id` from authenticated context
- **RBAC**: Enforces workspace access via `WorkspaceAccessDep` dependency
- **Audit Logging**: Analysis start/finish and sub-gallery creation logged via `AuditService`
- **No PII in Logs**: Structured logs include workspace_id and requestId, exclude user data

## API Contract

Full OpenAPI spec: `backend/src/app/api/v1/openapi/ai_filter.yaml`

## Testing

**Backend Tests** (target: 95% security-critical, 85% services):
- `backend/tests/api/v1/test_ai_filter.py` - Endpoint tests
- `backend/tests/api/v1/test_smart_tagging_analyze.py` - Analysis endpoint tests
- `backend/tests/services/test_ai_filter_service.py` - Service tests

**Frontend Tests** (target: 70%):
- `frontend/tests/unit/hooks/useAIFilters.test.ts` - Hook tests (DONE)
- `frontend/tests/unit/components/ai/QualityFilterSection.test.tsx` - Component tests (DONE)

**E2E Tests**:
- `tests/e2e/test_ai_filter_flow.py` - Happy path validation per `quickstart.md`

## Known Limitations (MVP)

1. **Content Filtering** (US4): Event type/activity/mood/lighting filters not yet implemented (deferred post-MVP)
2. **Similarity Organization** (US5): Photo grouping/stacking not yet implemented (requires CLIP embeddings)
3. **AI Create Panel** (US6): Separate Create button not yet implemented (current Create tab remains)
4. **Frontend Components**: Analysis progress UI, Smart Collection selector, Save as Gallery modal pending

## Roadmap

**P1 (MVP - Complete)**:
- ✅ Backend analyze/progress/summary endpoints
- ✅ Backend AI filter endpoint (quality/blur/technical)
- ✅ Backend create-from-filter endpoint
- ✅ Frontend feature flag and hooks
- ✅ Frontend filter controls (quality/blur/technical)
- ✅ Database migration for presets

**P2 (Post-MVP)**:
- Frontend Analysis UI (progress bar, summary card)
- Frontend Smart Collection selector
- Frontend "Save as Gallery" modal
- Content filtering (event type, activity, mood, lighting)

**P3 (Future)**:
- Similarity grouping and stacking
- Separate AI Create entry point
- Custom user presets

## References

- **Spec**: `specs/025-ai-filter-simplify/spec.md`
- **Plan**: `specs/025-ai-filter-simplify/plan.md`
- **Data Model**: `specs/025-ai-filter-simplify/data-model.md`
- **API Contracts**: `specs/025-ai-filter-simplify/contracts/api-contracts.yaml`
- **Quickstart**: `specs/025-ai-filter-simplify/quickstart.md`
