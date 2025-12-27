# Implementation Plan: Per-User Gemini LLM Settings

**Branch**: `003-user-gemini-settings` | **Date**: 2025-12-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-user-gemini-settings/spec.md`

## Summary

Enable users to bring their own Gemini API keys and select a preferred model from an admin-managed catalogue. Keys are encrypted at rest using the existing `EncryptionService` (AES-256-GCM with workspace-scoped HKDF). All AI features will consume user configuration via a new `GeminiClientService` that resolves credentials per-request.

## Technical Context

**Language/Version**: Python 3.9+ (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, SQLAlchemy 2.0+, asyncpg 0.29+, httpx 0.27+ (Gemini calls)
**Storage**: PostgreSQL 16 (new tables: `user_gemini_settings`, `gemini_models`), Redis 7 (settings cache)
**Testing**: pytest + pytest-asyncio (Backend), Vitest + React Testing Library (Frontend)
**Target Platform**: Web application (Linux server + modern browsers)
**Project Type**: Web (frontend/ + backend/)
**Performance Goals**: API key validation < 5s, settings page load < 500ms
**Constraints**: Zero API key exposure in logs/responses; per-user isolation
**Scale/Scope**: ~10K users, each with 1 API key config

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Security-First | PASS | Keys encrypted via existing `EncryptionService`; never returned in responses |
| Test-First | PASS | Unit tests for service + integration tests for API endpoints planned |
| Simplicity | PASS | Extends existing patterns (migrations, services, settings pages) |
| Workspace Isolation | PASS | `user_id` scoping for personal settings; workspace context for admin catalogue |

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/003-user-gemini-settings/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI specs)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── api/v1/
│   │   └── gemini_settings.py      # NEW: User settings endpoints
│   ├── services/
│   │   ├── gemini_settings_service.py   # NEW: User settings CRUD
│   │   └── gemini_client_service.py     # NEW: Per-user Gemini client factory
│   └── db/
│       └── seeds/seed_gemini_models.py  # NEW: Default model catalogue
├── migrations/versions/
│   └── 0038_gemini_settings.py     # NEW: Schema migration
└── tests/
    ├── unit/
    │   └── test_gemini_settings_service.py
    └── integration/
        └── test_gemini_settings_api.py

frontend/
├── src/
│   ├── pages/settings/
│   │   └── AISettingsPage.tsx      # NEW: AI & Gemini settings page
│   ├── components/settings/
│   │   ├── GeminiApiKeyForm.tsx    # NEW: Key entry/validation form
│   │   └── GeminiModelSelector.tsx # NEW: Model dropdown
│   ├── services/
│   │   └── geminiSettingsService.ts # NEW: API client
│   ├── hooks/
│   │   └── useGeminiSettings.ts    # NEW: React Query hooks
│   └── types/
│       └── geminiSettings.ts       # NEW: TypeScript types
└── tests/
    └── components/
        └── GeminiApiKeyForm.test.tsx

# Admin microservice (if 001-admin-microservice is active)
# Otherwise: backend/src/app/api/v1/admin_gemini_models.py
```

**Structure Decision**: Web application pattern with existing backend/frontend split. Admin model management will be added to the admin microservice if available, otherwise to the main backend with admin-only middleware.

## Complexity Tracking

> No violations requiring justification - this feature uses existing patterns.

| Area | Approach | Justification |
|------|----------|---------------|
| Encryption | Reuse `EncryptionService` | Already handles workspace-scoped HKDF; extend to user-scoped keys |
| Settings UI | Extend existing `/settings/*` pattern | Consistent UX with Profile, Security, Notifications pages |
| Admin Catalogue | New table + seed data | Simple CRUD with sort order and default flag |
