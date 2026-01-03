# Implementation Plan: Invitation RSVP System Hardening

**Branch**: `020-invitation-rsvp-hardening` | **Date**: 2026-01-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/020-invitation-rsvp-hardening/spec.md`

## Summary

This plan addresses critical security vulnerabilities and implements missing features in the Invitation RSVP system. Key deliverables include:

1. **Security Hardening**: Fix workspace isolation bypasses in repository aliases and microservice guest lookups
2. **Race Condition Prevention**: Add database unique constraint for duplicate RSVP prevention
3. **PII Removal**: Remove email addresses from application logs (SOC 2 compliance)
4. **Audit Logging**: Implement comprehensive audit trail for all RSVP operations using existing `AuditService`
5. **Email Notifications**: Complete email sending implementation for RSVP confirmations and auto-deletion warnings
6. **Dashboard Improvements**: Add error boundaries and PDF export functionality

## Technical Context

**Language/Version**: Python 3.11 (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 19, SQLAlchemy 2.0+, asyncpg 0.29+, Pydantic 2.7+
**Storage**: PostgreSQL 16 (existing tables: `invitation_rsvps`, `digital_invitations`, `invitation_events`)
**Testing**: pytest (Backend), Vitest (Frontend)
**Target Platform**: Web (responsive, desktop-first)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: 100 simultaneous RSVP submissions without data corruption, CSV export <5s for 500 RSVPs
**Constraints**: Zero cross-workspace data leakage, SOC 2 compliance for PII handling
**Scale/Scope**: Multi-tenant SaaS, typical workspace handles 50-500 RSVPs per invitation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with RawDrive Constitution (`.specify/memory/constitution.md`):

- [x] **I. Security**: No hardcoded secrets, parameterized queries, input validation
  - All queries use parameterized SQL via asyncpg
  - Input validation via Pydantic schemas with `sanitize_text()`
  - Edit tokens SHA-256 hashed, not stored in plain text
- [x] **II. Accessibility**: WCAG 2.1 AA compliance, keyboard nav, screen reader support
  - Existing RSVPDashboard uses AppButton, AppInput from design system
  - Error boundary will use semantic HTML with proper ARIA
- [x] **III. Design System**: Uses design tokens, no hardcoded colors, standard UI components
  - All UI uses AppButton, AppCard, DataTable components
  - No custom styling outside design system
- [x] **IV. Multi-Tenant Isolation**: All queries include workspace_id, RBAC enforced
  - THIS IS THE PRIMARY FIX: Adding workspace_id to all repository methods
  - Removing alias methods that bypass workspace isolation
- [x] **V. Testing**: Coverage targets defined (95% security, 85% services, 70% UI)
  - Security fixes (workspace isolation) require 95% coverage
  - Service layer changes require 85% coverage
  - Dashboard UI changes require 70% coverage
- [x] **VI. Clean Code**: SOLID principles, max file lengths, no over-engineering
  - Using existing service/repository patterns
  - No new abstractions needed
- [x] **VII. Observability**: Structured logging, metrics, audit trail for sensitive ops
  - Adding audit logging via existing `AuditService`
  - Removing PII from application logs

## Project Structure

### Documentation (this feature)

```text
specs/020-invitation-rsvp-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-changes.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── services/
│   │   ├── invitation_rsvp_service.py     # Fix PII logging, add audit events
│   │   ├── audit_service.py               # Add RSVP event types
│   │   ├── invitation_auto_deletion_service.py  # Implement email sending
│   │   └── task_queue.py                  # Email task processing
│   ├── repositories/
│   │   └── rsvp_repository.py             # Fix workspace isolation
│   └── api/v1/
│       ├── invitation_schemas.py          # No changes needed
│       └── invitation_exports.py          # PDF export endpoint
└── tests/
    ├── unit/
    │   └── services/
    │       ├── test_invitation_rsvp_service.py
    │       └── test_rsvp_repository.py
    └── integration/
        └── test_rsvp_workspace_isolation.py

frontend/
├── src/
│   ├── components/features/invitations/
│   │   ├── RSVPDashboard.tsx              # Add error boundary wrapper
│   │   └── RSVPExport.tsx                 # Implement PDF export
│   └── components/ErrorBoundary/
│       └── InvitationErrorBoundary.tsx    # New component
└── tests/
    └── components/
        └── RSVPDashboard.test.tsx
```

**Structure Decision**: Using existing web application structure. Backend changes focus on services and repositories. Frontend changes focus on RSVPDashboard component and export functionality.

## Complexity Tracking

> No Constitution violations requiring justification. All changes use existing patterns.

| Aspect | Approach | Rationale |
|--------|----------|-----------|
| Workspace Isolation | Fix existing methods, remove dangerous aliases | Minimally invasive, existing pattern |
| Duplicate Prevention | Database unique constraint + application check | Defense in depth, atomic guarantee |
| Audit Logging | Extend existing AuditService | Reuse production infrastructure |
| Email Sending | Implement via existing task queue | Background processing pattern already established |

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking existing RSVP functionality | High | Comprehensive test coverage before/after |
| Database migration issues | Medium | Add constraint with `IF NOT EXISTS`, handle duplicates first |
| Email delivery failures | Low | Existing retry mechanism in task queue |
| Performance degradation from audit logging | Low | Non-blocking async logging via Loki |

## Implementation Phases

### Phase 1: Security Fixes (P1 - Critical)

1. Fix `rsvp_repository.py` workspace isolation
2. Fix microservice guest lookup isolation
3. Add database unique constraint for duplicate prevention
4. Remove PII from logs

### Phase 2: Compliance (P2 - High)

5. Add RSVP audit event types to `AuditService`
6. Implement audit logging in `invitation_rsvp_service.py`
7. Add audit logging for invitation lifecycle events

### Phase 3: Notifications (P2 - High)

8. Implement email sending in auto-deletion service
9. Implement RSVP confirmation email sending
10. Add email retry and failure handling

### Phase 4: Dashboard (P3 - Medium)

11. Add error boundary to RSVPDashboard
12. Implement PDF export functionality

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| AuditService (Loki) | Ready | Existing infrastructure |
| TaskQueue (Redis) | Ready | Existing infrastructure |
| SendGrid integration | Exists | Via notification templates |
| Database migrations | Required | Add unique constraint |

## Artifacts

- [research.md](./research.md) - Phase 0 research findings
- [data-model.md](./data-model.md) - Database schema changes
- [contracts/api-changes.yaml](./contracts/api-changes.yaml) - API contract changes
- [quickstart.md](./quickstart.md) - Developer setup guide
