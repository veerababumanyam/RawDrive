# Implementation Plan: One-Click AI Analysis & Filtering

**Branch**: `025-ai-filter-simplify` | **Date**: 2026-01-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-ai-filter-simplify/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Single "Analyze Gallery" entry point replaces the tabbed Analyze/Curate UI. The flow triggers existing Gemini-powered analysis (quality, blur, content tags) in one action, shows progress, and presents unified filters plus Smart Collection presets. Hybrid filtering applies client-side for galleries under 5k assets and server-side for larger sets; existing smart-tagging endpoints are extended with quality/blur/content params and a new `create-from-filter` action to form sub-galleries.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Backend Python 3.11 (FastAPI 0.115+), Frontend TypeScript 5.2+ with React 19 + Vite 5.  
**Primary Dependencies**: FastAPI, SQLAlchemy, Alembic, Celery, Redis client; Frontend uses React Query, Tailwind-based design tokens, UI kit (`AppButton`, `AppInput`, etc.).  
**Storage**: PostgreSQL 16 with pgvector; Redis 7 for cache/queues; Cloudflare R2 (S3-compatible) for assets.  
**Testing**: Backend `pytest` + `ruff check` + `mypy`; Frontend `npm test` (Vitest) + ESLint.  
**Target Platform**: Web app (desktop/mobile browsers) with backend on Linux containers / Docker compose.  
**Project Type**: Web application with separate frontend and backend workspaces.  
**Performance Goals**: Progress updates at least every 5s; filter apply <2s for ≤5k photos; sub-gallery creation <3s for ≤500 assets.  
**Constraints**: Enforce workspace isolation on all queries; WCAG 2.1 AA UI; use design tokens (no hardcoded colors); API versioned under `/api/v1`; no secrets in code.  
**Scale/Scope**: Galleries up to 10k photos; multi-tenant SaaS with per-workspace isolation and feature flag rollout.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with RawDrive Constitution (`.specify/memory/constitution.md`):

- [x] **I. Security**: No hardcoded secrets, parameterized queries, input validation
- [x] **II. Accessibility**: WCAG 2.1 AA compliance, keyboard nav, screen reader support
- [x] **III. Design System**: Uses design tokens, no hardcoded colors, standard UI components
- [x] **IV. Multi-Tenant Isolation**: All queries include workspace_id, RBAC enforced
- [x] **V. Testing**: Coverage targets defined (95% security, 85% services, 70% UI)
- [x] **VI. Clean Code**: SOLID principles, max file lengths, no over-engineering
- [x] **VII. Observability**: Structured logging, metrics, audit trail for sensitive ops

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
backend/
├── src/
│   ├── api/v1/
│   ├── services/
│   ├── repositories/
│   └── models/
└── tests/

frontend/
├── src/
│   ├── components/features/ai/
│   ├── components/features/gallery/
│   ├── hooks/
│   └── pages/
└── tests/
```

**Structure Decision**: Web application with dedicated backend (FastAPI) and frontend (React/Vite) workspaces; AI filter UX touches `frontend/src/components/features/ai` and `frontend/src/components/features/gallery`, while backend changes live under `backend/src/api/v1` with supporting services/repositories.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _None_ | — | — |

**Note**: Constitution Technology Standards table lists "Backend: Express + TypeScript", but RawDrive actually uses FastAPI (Python 3.11+). This is a documentation drift issue in the Constitution, not a feature-specific violation. The plan adheres to the *actual* tech stack; Constitution will be updated via separate governance process.
