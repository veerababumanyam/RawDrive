# Implementation Plan: Client Favorites System

**Branch**: `012-client-favorites` | **Date**: December 29, 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-client-favorites/spec.md`

## Summary

Enable clients viewing photo galleries to mark photos as favorites, organize them into multiple named lists (e.g., "Must Print", "Family Favorites"), download favorites as ZIP files, and optionally share read-only favorites links with family members. Photographers gain visibility into aggregate client favorites for editing prioritization.

**Technical Approach**: Extend the existing `client_interactions` table pattern and `gallery_assets.is_favorited` field with new `favorite_lists` and `favorite_shares` tables. Implement ZIP generation using streaming multipart downloads with progress tracking. Client identification uses existing visitor/client token mechanisms with optional email association.

## Technical Context

**Language/Version**: Python 3.11+ (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, SQLAlchemy 2.0+, asyncpg 0.29+, python-zipstream-ng (streaming ZIP)
**Storage**: PostgreSQL 16 (new tables: `favorite_lists`, `favorite_shares`, `favorite_downloads`), Redis 7 (ZIP job queue), Cloudflare R2 (temporary ZIP storage)
**Testing**: pytest (backend), Vitest (frontend)
**Target Platform**: Web (desktop/mobile browsers), Linux servers (Docker)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Favorite toggle <500ms p95, ZIP generation <30s for 100 photos, list load <250ms
**Constraints**: ZIP files max 2GB, temporary ZIP storage expires after 24 hours, 10 lists per client per gallery limit
**Scale/Scope**: 10k concurrent clients, 1000 favorites per list max, 500MB max ZIP download

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: Project constitution is template-only. Applying reasonable defaults based on existing codebase patterns.

| Principle | Status | Notes |
|-----------|--------|-------|
| Workspace Isolation | PASS | All queries scoped by workspace_id, client tokens scoped to gallery |
| Security | PASS | Client tokens validated, share links use secure random tokens |
| Simplicity | PASS | Extends existing client_interactions pattern, no new abstractions |
| Test Coverage | PASS | Contract tests for API, unit tests for services |

## Project Structure

### Documentation (this feature)

```text
specs/012-client-favorites/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── client-favorites.yaml    # Client-facing API
│   ├── photographer-favorites.yaml  # Photographer dashboard API
│   └── favorites-download.yaml  # ZIP download API
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── api/v1/
│   │   ├── client_favorites.py      # Client favorites endpoints
│   │   └── favorites_analytics.py   # Photographer view endpoints
│   ├── services/
│   │   ├── favorites_service.py     # Core favorites logic
│   │   ├── favorites_list_service.py # Multiple lists management
│   │   ├── favorites_share_service.py # Share link generation
│   │   └── favorites_download_service.py # ZIP generation
│   └── repositories/
│       └── favorites_repository.py  # Database operations
├── migrations/versions/
│   └── 0053_client_favorites.py     # New tables migration
└── tests/
    ├── unit/
    │   └── services/test_favorites_*.py
    └── integration/
        └── api/test_client_favorites.py

frontend/
├── src/
│   ├── components/features/gallery/
│   │   ├── FavoriteButton.tsx       # Heart icon component
│   │   ├── FavoritesPanel.tsx       # Favorites sidebar/view
│   │   ├── FavoriteListSelector.tsx # List picker dropdown
│   │   ├── CreateListModal.tsx      # New list creation
│   │   └── ShareFavoritesModal.tsx  # Share link generation
│   ├── pages/public/
│   │   └── SharedFavoritesPage.tsx  # Read-only shared view
│   ├── pages/workspace/
│   │   └── GalleryFavoritesAnalytics.tsx # Photographer view
│   ├── services/
│   │   └── favoritesService.ts      # API client
│   └── hooks/
│       └── useFavorites.ts          # Client state management
└── tests/
    └── components/features/gallery/
        └── FavoriteButton.test.tsx
```

**Structure Decision**: Web application structure matching existing RawDrive patterns. Backend follows existing service/repository pattern with FastAPI routers. Frontend uses React components with dedicated hooks for state management.

## Complexity Tracking

> No constitution violations requiring justification.

| Decision | Rationale |
|----------|-----------|
| Extends existing `client_interactions` | Reuses proven pattern, maintains data consistency |
| New `favorite_lists` table | Spec requires multiple lists; existing table lacks this concept |
| Streaming ZIP | Avoid memory issues with large galleries; matches existing download patterns |
