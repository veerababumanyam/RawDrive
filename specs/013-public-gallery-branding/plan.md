# Implementation Plan: Public Gallery Branding & Album Title

**Branch**: `013-public-gallery-branding` | **Date**: 2025-12-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-public-gallery-branding/spec.md`

## Summary

Enable photographers to present professional, client-facing album titles on public gallery pages while keeping internal gallery names for organization. Additionally, display the company name next to the logo in the header, auto-fill the hero section with the cover photo (or first available photo), and remove date/photo count badges for a cleaner design.

**Technical Approach**: Extend the `magic_links` table with an `album_title` column, update the Share Dialog to require album title input, and modify the PublicGalleryPage to display company name in header and album title in hero section.

## Technical Context

**Language/Version**: Python 3.11 (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, SQLAlchemy 2.0+, Pydantic 2.7+, TailwindCSS
**Storage**: PostgreSQL 16 (magic_links table extension with `album_title VARCHAR(200)`)
**Testing**: pytest (backend), Vitest (frontend)
**Target Platform**: Web application (responsive desktop/mobile)
**Project Type**: Web (frontend + backend)
**Performance Goals**: Page load < 2s with cover photo visible
**Constraints**: Backward compatible - existing magic links without album_title must continue to work
**Scale/Scope**: Affects ShareDialog (1 component), PublicGalleryPage (1 page), magic_links API (2 endpoints)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **No new services required** - Extends existing magic_link_service
- [x] **No new external dependencies** - Uses existing FastAPI/React stack
- [x] **Backward compatible** - NULL album_title falls back to gallery.title
- [x] **Follows existing patterns** - Same schema/service/API/component structure

## Project Structure

### Documentation (this feature)

```text
specs/013-public-gallery-branding/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Technical findings from codebase exploration
├── data-model.md        # Entity definitions (Magic Link extension)
├── quickstart.md        # Step-by-step implementation guide
├── contracts/           # API contracts
│   ├── create-magic-link.md
│   └── validate-magic-link.md
└── tasks.md             # Implementation tasks (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/versions/
│   └── 0056_add_album_title_to_magic_links.py  # NEW: Database migration
├── src/app/
│   ├── api/
│   │   ├── schemas.py                          # MODIFY: Add album_title to schemas
│   │   └── v1/magic_links.py                   # MODIFY: Pass album_title to service
│   └── services/
│       └── magic_link_service.py               # MODIFY: Store/return album_title

frontend/
├── src/
│   ├── types/
│   │   └── gallery.ts                          # MODIFY: Add album_title to interfaces
│   ├── components/features/gallery/
│   │   └── ShareDialog.tsx                     # MODIFY: Add album title input
│   ├── pages/public/
│   │   └── PublicGalleryPage.tsx               # MODIFY: Header + hero updates
│   └── services/
│       └── galleryService.ts                   # MODIFY: Return album_title from validation
```

**Structure Decision**: Web application structure (Option 2) - RawDrive uses a monorepo with `backend/` (FastAPI) and `frontend/` (React) directories. This feature modifies existing files across both, with one new migration file.

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `backend/migrations/versions/0031_magic_links_and_qr.py` | - | Current magic_links schema (reference) |
| `backend/src/app/api/schemas.py` | 845-893 | Magic link Pydantic schemas |
| `backend/src/app/services/magic_link_service.py` | - | Magic link business logic |
| `frontend/src/types/gallery.ts` | 377-405 | MagicLink TypeScript interfaces |
| `frontend/src/components/features/gallery/ShareDialog.tsx` | 73-78 | Form state definition |
| `frontend/src/pages/public/PublicGalleryPage.tsx` | 988-994, 1082-1094 | Header and hero sections |

## Complexity Tracking

> No constitution violations. This feature uses existing patterns and requires minimal new code.

| Item | Status | Notes |
|------|--------|-------|
| New table | Not needed | Extends existing `magic_links` table |
| New service | Not needed | Extends existing `magic_link_service` |
| New component | Not needed | Modifies existing `ShareDialog` |
| Breaking changes | None | NULL album_title → fallback to gallery.title |
