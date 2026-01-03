# Implementation Plan: Invitation RSVP System Hardening

**Branch**: `020-invitation-rsvp-hardening` | **Date**: 2026-01-03 | **Spec**: `/specs/020-invitation-rsvp-hardening/spec.md`
**Input**: Feature specification from `/specs/020-invitation-rsvp-hardening/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Secure and harden the multi-tenant Invitation RSVP flow: enforce workspace isolation, prevent duplicate submissions via transactional unique keys, add SOC 2-aligned audit logging, wire SendGrid-based confirmation/edit/deletion-warning emails, and deliver reliable dashboard exports (CSV/PDF) with graceful error boundaries. Backend (FastAPI + PostgreSQL + Redis) will own RSVP creation/update, deduplication, audit events, and email job enqueueing; frontend (React + Vite + Tailwind) will deliver responsive, WCAG-compliant RSVP forms and dashboard views that adopt light/dark themes.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Backend Python 3.11 (FastAPI), Frontend TypeScript 5.2 + React 18 (Vite)  
**Primary Dependencies**: FastAPI, SQLAlchemy/asyncpg, Redis, structlog, SendGrid SDK, Zod, React Query, Tailwind UI kit (`AppButton`, `AppInput`, etc.)  
**Storage**: PostgreSQL 16 for RSVPs/audit events, Redis 7 for idempotency + job queues, S3/R2 for asset storage (unchanged)  
**Testing**: Backend pytest + pytest-asyncio + hypothesis; Frontend Vitest + React Testing Library + fast-check  
**Target Platform**: Multi-tenant web (RawDrive SaaS) deployed on Linux containers (FastAPI + Node build artifacts)  
**Project Type**: Web application with separate backend (`backend/`) and frontend (`frontend/`) projects  
**Performance Goals**: Reject duplicate RSVPs 100% (even concurrent), CSV export ≤5s for ≤500 RSVPs, confirmation emails delivered within 5 minutes for 95% of sends, dashboard render p95 < 200ms server response excluding network  
**Constraints**: SOC 2 logging rules (no PII in logs), WCAG 2.1 AA UI, p95 API latency < 300ms for RSVP submit, avoid race conditions via DB transactions and unique constraints, dark/light theme parity  
**Scale/Scope**: Up to 100 concurrent RSVP submissions per invitation; dashboard lists ≤5k RSVPs per invitation; PDF export sized for vendor handoffs

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
│   ├── models/           # Invitations, RSVPs, audit events, view records
│   ├── services/         # Invitation/RSVP domain logic, audit, email enqueueing
│   └── api/              # FastAPI routes (workspace-scoped)
└── tests/                # unit + integration

frontend/
├── src/
│   ├── components/       # UI kit (AppButton/AppInput/PhotoGrid)
│   ├── pages/            # Invitation portal + dashboard views
│   └── services/         # API clients (axios/react-query), theme + i18n
└── tests/                # vitest + RTL
```

**Structure Decision**: Web application split between `backend/` (FastAPI + PostgreSQL/Redis) and `frontend/` (React + Vite + Tailwind design system). Supporting services (email worker, audit logging) live alongside backend services.

## Architecture Decisions

- **Stack variance**: Backend remains FastAPI (Python 3.11) to match the existing codebase; this is a documented variance from the constitution’s Express+TS default and will be reconciled via a future amendment. Frontend stays React 18 + Vite + Tailwind design system.
- **Services**: `invitation_rsvp_service` owns submission/edit/delete with workspace isolation; `digital_invitation_service` handles invitation lifecycle; `audit_service` centralizes audit events; `idempotency_service` uses Redis with namespaced keys per workspace; `email_retry_service` introduces retry/backoff queue for confirmations/warnings.
- **API**: FastAPI routes under `/api/v1/` with workspace guards; public invitation routes validate workspace ownership and expiry/edit-deadline state.
- **Background jobs**: Email enqueue + retry via Redis-based queue; deletion warnings scheduled at 7d/24h.
- **Frontend**: Dashboard and public RSVP form consume workspace-scoped APIs, use UI kit tokens, and wrap data fetching in error boundaries with retry.

## Data Model & Migrations

- Unique constraint on `(invitation_id, lower(guest_email))` to prevent duplicates; migration cleans existing dupes.
- Dedup index on invitation views (fingerprint + window) to curb inflated analytics; validated via integration test and Grafana panel.
- Audit tables remain append-only; add new event types for RSVP/Invitation lifecycle and exports.
- PDF/CSV exports use workspace-scoped queries; no schema change required.

## Performance & Measurement

- **RSVP submit**: Target p95 < 300ms measured in staging with Locust (100 concurrent submissions) against FastAPI app; report in quickstart.md.
- **CSV export**: Target ≤5s for 500 RSVPs; add perf test harness in `backend/tests/performance/` and capture timings in quickstart.md.
- **Email delivery**: 95% within 5 minutes; measure via SendGrid event logs (staging) and log summary in quickstart.md.
- **View dedup**: Monitor dedup hits/misses via Grafana panel added in this feature.

## Risk, Rollback, and Ops

- **Risks**: Unique constraint deployment may fail if dupes remain; mitigate with pre-clean migration. Email retries could flood if misconfigured; cap backoff and max attempts.
- **Rollback**: Alembic downgrade scripts for new migrations; feature flags for PDF export and new email templates; ability to disable retry queue via env toggle.
- **Observability**: Structured logs with workspace_id, audit events for RSVP/Invitation lifecycle and exports, metrics for retries and dedup effectiveness.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _None_ | n/a | n/a |
