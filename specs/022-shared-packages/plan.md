# Implementation Plan: Shared Packages Infrastructure

**Branch**: `022-shared-packages` | **Date**: 2026-01-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/022-shared-packages/spec.md`

## Summary

RawDrive currently has 15+ duplicate type/enum definitions across frontend (TypeScript/React), backend (Python/FastAPI), and microservices (invitations-service). This plan implements a shared packages infrastructure with four npm packages (`@rawdrive/shared-types`, `@rawdrive/shared-constants`, `@rawdrive/shared-validation`, `@rawdrive/shared-utils`) that eliminate duplication while maintaining zero-downtime backward compatibility.

TypeScript serves as the single source of truth, with Python equivalents generated via JSON Schema bridge. Migration follows an incremental phased approach allowing gradual adoption over multiple releases.

## Technical Context

**Language/Version**: TypeScript 5.2+, Python 3.9+
**Primary Dependencies**: npm/pnpm workspaces, Zod 4.2+, Pydantic 2.7+, json-schema-to-typescript
**Storage**: N/A (no database changes - application-level type sharing)
**Testing**: Vitest (TypeScript), pytest (Python), cross-platform parity tests
**Target Platform**: Node.js 18+, Browser (ES2020), Python 3.9+
**Project Type**: Monorepo with shared packages (web application)
**Performance Goals**: Package build <30s, tree-shakeable bundles <5KB gzipped per package
**Constraints**: Zero breaking changes during migration, existing test suites must pass
**Scale/Scope**: 4 shared packages, ~15 duplicated types to consolidate, 3 consuming services

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with RawDrive Constitution (`.specify/memory/constitution.md`):

- [x] **I. Security**: No hardcoded secrets, parameterized queries, input validation
  - Shared packages contain only types/constants/validation - no secrets or queries
  - XSS sanitization functions included in shared-validation (FR-033)
- [x] **II. Accessibility**: WCAG 2.1 AA compliance, keyboard nav, screen reader support
  - N/A - shared packages are not UI components
- [x] **III. Design System**: Uses design tokens, no hardcoded colors, standard UI components
  - N/A - shared packages are not UI components
- [x] **IV. Multi-Tenant Isolation**: All queries include workspace_id, RBAC enforced
  - N/A - shared packages contain no database queries
- [x] **V. Testing**: Coverage targets defined (95% security, 85% services, 70% UI)
  - FR-034: >90% coverage for each shared package
  - FR-035: Cross-platform parity tests for TS/Python
  - FR-036: Integration tests for consuming services
- [x] **VI. Clean Code**: SOLID principles, max file lengths, no over-engineering
  - Single Responsibility: Each package has one purpose (types/constants/validation/utils)
  - DRY: Eliminates 15+ duplications
  - KISS: Simple re-exports, no complex abstractions
- [x] **VII. Observability**: Structured logging, metrics, audit trail for sensitive ops
  - N/A - shared packages are compile-time dependencies with no runtime logging

## Project Structure

### Documentation (this feature)

```text
specs/022-shared-packages/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/                          # NEW: Shared packages root
├── shared-types/
│   ├── package.json               # @rawdrive/shared-types
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts               # Main exports
│   │   ├── invitations.ts         # InvitationStatus, RSVPStatus, EventType, etc.
│   │   ├── gallery.ts             # GalleryStatus, DownloadPolicy, ThemeMode, etc.
│   │   ├── gradient.ts            # GradientConfiguration, ColorStop
│   │   └── common.ts              # PaginatedResponse, ErrorResponse
│   ├── generated/
│   │   └── python/                # Auto-generated Pydantic models
│   └── tests/
├── shared-constants/
│   ├── package.json               # @rawdrive/shared-constants
│   ├── src/
│   │   ├── index.ts
│   │   ├── api.ts                 # API_BASE, API_VERSION, route paths
│   │   ├── storage.ts             # GB, MB, KB conversions
│   │   └── thresholds.ts          # Face search, pagination limits
│   ├── generated/
│   │   └── python/
│   └── tests/
├── shared-validation/
│   ├── package.json               # @rawdrive/shared-validation
│   ├── src/
│   │   ├── index.ts
│   │   ├── patterns.ts            # Hex color, UUID v4, email regex
│   │   ├── schemas.ts             # Zod schemas
│   │   └── sanitizers.ts          # XSS sanitization
│   ├── generated/
│   │   └── python/
│   └── tests/
└── shared-utils/
    ├── package.json               # @rawdrive/shared-utils
    ├── src/
    │   ├── index.ts
    │   ├── date.ts                # formatRelativeDate, formatDateTime
    │   └── format.ts              # File size formatting
    ├── generated/
    │   └── python/
    └── tests/

backend/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── schemas.py         # MODIFIED: Import from generated packages
│   │   └── shared/                # NEW: Symlink/copy of generated Python modules
└── tests/

frontend/
├── src/
│   ├── types/
│   │   ├── invitations.ts         # MODIFIED: Re-export from @rawdrive/shared-types
│   │   ├── gallery.ts             # MODIFIED: Re-export from @rawdrive/shared-types
│   │   └── gradient.ts            # MODIFIED: Re-export from @rawdrive/shared-types
│   ├── constants/
│   │   ├── api.ts                 # MODIFIED: Re-export from @rawdrive/shared-constants
│   │   └── gallery.ts             # MODIFIED: Re-export from @rawdrive/shared-constants
│   └── validation/
│       └── profileEditor.ts       # MODIFIED: Import from @rawdrive/shared-validation
└── tests/

services/invitations-service/
├── src/
│   ├── schemas/
│   │   ├── guest.py               # MODIFIED: Import from shared modules
│   │   └── rsvp.py                # MODIFIED: Import from shared modules
│   └── shared/                    # NEW: Symlink/copy of generated Python modules
└── tests/

scripts/
└── generate-python-types.ts       # NEW: TypeScript to Python generation script
```

**Structure Decision**: Monorepo with dedicated `packages/` directory for shared npm packages. TypeScript is the source of truth with Python equivalents generated into `generated/python/` subdirectories. Each consuming service (frontend, backend, invitations-service) imports from shared packages, with existing local files modified to re-export for backward compatibility during migration.

## Complexity Tracking

> **No Constitution violations requiring justification**

All shared packages follow SOLID principles and avoid over-engineering. The 4-package structure directly maps to the 4 categories of duplicated code identified in the specification (types, constants, validation, utilities).
