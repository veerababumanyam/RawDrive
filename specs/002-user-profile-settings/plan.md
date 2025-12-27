# Implementation Plan: User Profile Settings

**Branch**: `002-user-profile-settings` | **Date**: 2025-12-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-user-profile-settings/spec.md`

## Summary

Comprehensive user profile settings module enabling users to manage personal identity (profile), account security (password, 2FA, sessions), notification preferences, privacy controls, and account deletion. Integrates with existing RawDrive authentication system (FastAPI/PostgreSQL/Redis) and React frontend design system.

## Technical Context

**Language/Version**: Python 3.9+ (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, argon2-cffi, pyotp (new), react-hook-form, zod
**Storage**: PostgreSQL 16 (pgvector), Redis 7 (sessions/cache), Cloudflare R2 (avatar storage)
**Testing**: pytest/vitest (Backend), Vitest + React Testing Library (Frontend)
**Target Platform**: Web (responsive), API server (Linux)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Profile update < 500ms, session list load < 2s, avatar upload < 3s
**Constraints**: 12-char password minimum, 5MB avatar limit, 14-day deletion grace period
**Scale/Scope**: Multi-tenant SaaS, workspace-scoped where applicable, ~10k users initial scale

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Since the constitution template is not yet configured for this project, we apply RawDrive-specific principles from CLAUDE.md:

| Principle | Status | Evidence |
|-----------|--------|----------|
| Multi-tenant data isolation | PASS | All queries will include user_id/workspace_id filtering |
| SOC 2 compliance | PASS | Audit logging, password hashing, 2FA support designed in |
| No hardcoded secrets | PASS | All keys/tokens from environment variables |
| Accessibility (WCAG 2.1 AA) | PASS | Using existing design system with a11y support |
| Centralized design system | PASS | Using AppButton, AppInput, AppCard components |
| Input validation (Zod) | PASS | All endpoints use Pydantic/Zod schemas |

## Project Structure

### Documentation (this feature)

```text
specs/002-user-profile-settings/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI specs)
│   └── user-settings-api.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── users.py              # Extend existing (profile endpoints)
│   │   │   └── user_settings.py      # NEW: security, notifications, privacy, deletion
│   │   └── schemas.py                # Extend (new request/response schemas)
│   ├── services/
│   │   ├── auth_service.py           # Extend (password change)
│   │   ├── session_service.py        # Extend (location enrichment)
│   │   ├── totp_service.py           # NEW: 2FA management
│   │   ├── notification_service.py   # NEW: preference management
│   │   ├── data_export_service.py    # NEW: GDPR data export
│   │   └── account_deletion_service.py # NEW: deletion workflow
│   └── workers/
│       ├── data_export_worker.py     # NEW: async export generation
│       └── account_deletion_worker.py # NEW: scheduled deletion processor
├── migrations/versions/
│   └── 0037_user_profile_settings.py # NEW: schema extensions
└── tests/
    ├── unit/
    │   └── services/
    │       └── test_totp_service.py
    └── integration/
        └── api/
            └── test_user_settings.py

frontend/
├── src/
│   ├── pages/workspace/settings/
│   │   ├── ProfileSettingsPage.tsx   # NEW: profile editing
│   │   ├── SecuritySettingsPage.tsx  # NEW: password, 2FA, sessions
│   │   ├── NotificationSettingsPage.tsx # NEW: notification prefs
│   │   ├── PrivacySettingsPage.tsx   # NEW: privacy & data
│   │   └── DangerZonePage.tsx        # NEW: account deletion
│   ├── components/settings/
│   │   ├── AvatarUploader.tsx        # NEW: crop & upload
│   │   ├── TwoFactorSetup.tsx        # NEW: 2FA wizard
│   │   ├── SessionList.tsx           # NEW: active sessions
│   │   └── DeleteAccountModal.tsx    # NEW: confirmation flow
│   ├── services/
│   │   └── userSettingsService.ts    # NEW: API client
│   └── hooks/
│       └── useUserSettings.ts        # NEW: React Query hooks
└── tests/
    └── pages/settings/
        └── ProfileSettingsPage.test.tsx
```

**Structure Decision**: Web application structure extending existing backend/frontend directories with new services and pages. Follows RawDrive patterns: services in `backend/src/app/services/`, pages in `frontend/src/pages/workspace/settings/`.

## Complexity Tracking

No constitution violations requiring justification. Design follows existing patterns:
- Services pattern: Consistent with AuthService, SessionService
- Page structure: Consistent with existing settings pages
- API structure: Consistent with /api/v1/* patterns
