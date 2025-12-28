# Implementation Plan: Fix Gallery PIN and Password Persistence

**Branch**: `007-fix-gallery-pin-password` | **Date**: 2025-12-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-fix-gallery-pin-password/spec.md`

## Summary

Fix gallery password and PIN settings to persist properly and be viewable by gallery owners. Currently, the frontend displays empty fields when credentials are set, and the eye toggle only shows locally-typed values. The solution involves:

1. **Database**: Add encrypted plaintext columns (`password_encrypted`, `pin_encrypted`) alongside existing hashes
2. **Backend**: New API endpoint to retrieve decrypted credentials for authorized workspace members
3. **Frontend**: Update `AccessSettings.tsx` and `PinSettings.tsx` to load and display existing credentials

## Technical Context

**Language/Version**: Python 3.11 (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, cryptography (AES-256-GCM via existing EncryptionService)
**Storage**: PostgreSQL 16 (new columns: `password_encrypted`, `password_iv`, `pin_encrypted`, `pin_iv`)
**Testing**: pytest (backend), Vitest (frontend)
**Target Platform**: Web application (Linux server + browser)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Credential reveal < 200ms response time
**Constraints**: HTTPS required, workspace-scoped encryption, audit logging for credential access
**Scale/Scope**: Existing gallery settings feature, affects 2 frontend components and 1 backend endpoint

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is template-only (not yet customized for RawDrive). Applying general best practices:

| Principle | Status | Notes |
|-----------|--------|-------|
| Security-first | PASS | Using existing AES-256-GCM encryption service with workspace-scoped keys |
| Test coverage | PASS | Will add unit tests for new encryption/decryption flow |
| Backward compatibility | PASS | Adding new columns, not modifying existing hash columns |
| Audit logging | PASS | Will log credential access per SEC-005 requirement |

**Gate Status**: PASSED - No violations requiring justification

## Project Structure

### Documentation (this feature)

```text
specs/007-fix-gallery-pin-password/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── gallery-credentials-api.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── api/v1/
│   │   └── galleries.py          # Add GET credentials endpoint
│   ├── services/
│   │   └── gallery_service.py    # Add credential encryption/decryption
│   └── migrations/
│       └── versions/
│           └── 0046_gallery_credentials_encrypted.py  # New migration
└── tests/
    └── unit/
        └── test_gallery_credentials.py

frontend/
├── src/
│   ├── components/features/gallery/
│   │   ├── AccessSettings.tsx    # Update to load/display credentials
│   │   └── PinSettings.tsx       # Update to load/display credentials
│   ├── services/
│   │   └── galleryService.ts     # Add getCredentials API call
│   └── types/
│       └── gallery.ts            # Add credential types
└── tests/
    └── components/gallery/
        └── AccessSettings.test.tsx
```

**Structure Decision**: Web application structure - this feature spans both backend (new API endpoint, database migration, encryption service integration) and frontend (component updates to load and display credentials).

## Complexity Tracking

> No violations requiring justification. The solution uses existing infrastructure:
> - Existing `EncryptionService` for AES-256-GCM encryption
> - Existing `gallery_service.py` patterns for credential handling
> - Existing component structure in `AccessSettings.tsx` and `PinSettings.tsx`
