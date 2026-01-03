# Tasks: Invitation RSVP System Hardening

**Input**: Design documents from `/specs/020-invitation-rsvp-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-changes.yaml
**Branch**: `020-invitation-rsvp-hardening`

**Tests**: Test tasks are included for security-critical changes (95% coverage required per Constitution).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, etc.)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/app/` (Python FastAPI)
- **Frontend**: `frontend/src/` (React TypeScript)
- **Tests Backend**: `backend/tests/`
- **Tests Frontend**: `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migrations and shared infrastructure preparation

- [ ] T001 Create duplicate check query to identify existing duplicates in `backend/src/app/db/migrations/20260103_00_check_duplicates.sql`
- [ ] T002 Create migration to clean duplicates in `backend/src/app/db/migrations/20260103_01_clean_duplicates.sql`
- [ ] T003 Create migration for unique constraint in `backend/src/app/db/migrations/20260103_02_add_rsvp_unique_constraint.sql`
- [ ] T004 [P] Create migration for views dedup index in `backend/src/app/db/migrations/20260103_03_add_views_dedup_index.sql`
- [ ] T005 Run migrations in development environment and verify constraint is active

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: User stories depend on audit event types being available

- [ ] T006 Add RSVP audit event types to `AuditEventType` enum in `backend/src/app/services/audit_service.py`
- [ ] T007 Add invitation lifecycle audit event types to enum in `backend/src/app/services/audit_service.py`
- [ ] T008 [P] Create `DuplicateRSVPError` exception class in `backend/src/app/exceptions/rsvp_exceptions.py`
- [ ] T009 Verify audit service is properly initialized and Loki connection works

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Secure RSVP Submission (Priority: P1) 🎯 MVP

**Goal**: Ensure RSVP data is workspace-isolated and duplicates are prevented atomically

**Independent Test**: Submit RSVP through public link, verify data appears only in correct workspace, attempt duplicate submission

### Tests for User Story 1

> **NOTE: Security tests required - 95% coverage target**

- [ ] T010 [P] [US1] Create workspace isolation test in `backend/tests/integration/test_rsvp_workspace_isolation.py`
- [ ] T011 [P] [US1] Create duplicate prevention test in `backend/tests/unit/repositories/test_rsvp_repository_duplicates.py`
- [ ] T012 [P] [US1] Create concurrent submission test in `backend/tests/integration/test_rsvp_concurrent_submissions.py`

### Implementation for User Story 1

- [ ] T013 [US1] Remove dangerous `delete()` alias method from `backend/src/app/repositories/rsvp_repository.py`
- [ ] T014 [US1] Remove dangerous `update()` alias method from `backend/src/app/repositories/rsvp_repository.py`
- [ ] T015 [US1] Add workspace_id parameter to `_get_guest_record()` in `backend/src/app/services/rsvp_service.py`
- [ ] T016 [US1] Update `_get_guest_record()` query to join with invitations for workspace check in `backend/src/app/services/rsvp_service.py`
- [ ] T017 [US1] Update all callers of `_get_guest_record()` to pass workspace_id in `backend/src/app/services/rsvp_service.py`
- [ ] T018 [US1] Add duplicate detection using unique constraint with friendly error in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T019 [US1] Handle `UniqueViolation` exception and return 409 Conflict in `backend/src/app/api/v1/public_invitations.py`
- [ ] T020 [US1] Remove PII (guest_email) from logger calls in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T021 [US1] Search and remove any remaining PII logging in RSVP-related files
- [ ] T022 [US1] Add audit logging for `RSVP_SUBMITTED` event in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T023 [US1] Run security tests and verify 95% coverage on modified files

**Checkpoint**: RSVP submission is secure - workspace isolation enforced, duplicates prevented, PII removed from logs

---

## Phase 4: User Story 2 - RSVP Confirmation & Edit Notifications (Priority: P2)

**Goal**: Guests receive confirmation emails with edit links, and deletion warnings are sent

**Independent Test**: Submit RSVP and verify confirmation email with working edit link arrives within 5 minutes

### Tests for User Story 2

- [ ] T024 [P] [US2] Create email queue test in `backend/tests/unit/services/test_rsvp_email_sending.py`
- [ ] T025 [P] [US2] Create deletion warning test in `backend/tests/unit/services/test_auto_deletion_warnings.py`

### Implementation for User Story 2

- [ ] T026 [US2] Implement RSVP confirmation email sending in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T027 [US2] Create email template for RSVP confirmation in `backend/src/app/templates/email/rsvp_confirmation.html`
- [ ] T028 [US2] Implement `send_deletion_warning()` method in `backend/src/app/services/invitation_auto_deletion_service.py`
- [ ] T029 [US2] Create email template for 7-day warning in `backend/src/app/templates/email/deletion_warning_7day.html`
- [ ] T030 [US2] Create email template for 24-hour warning in `backend/src/app/templates/email/deletion_warning_24hr.html`
- [ ] T031 [US2] Add task type `send_deletion_warning` to task queue processor in `backend/src/app/services/task_queue.py`
- [ ] T032 [US2] Add audit logging for `RSVP_UPDATED` event in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T033 [US2] Add audit logging for `RSVP_EDIT_TOKEN_USED` and `RSVP_EDIT_TOKEN_INVALID` events in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T034 [US2] Verify email templates render correctly with test data

**Checkpoint**: Email notifications working - confirmation emails sent, deletion warnings scheduled

---

## Phase 5: User Story 3 - RSVP Management Dashboard (Priority: P2)

**Goal**: Dashboard displays accurate statistics and exports work correctly (existing functionality, enhanced with audit)

**Independent Test**: Create invitation, collect RSVPs, verify dashboard shows correct stats and CSV export works

### Implementation for User Story 3

- [ ] T035 [US3] Add audit logging for `RSVP_DELETED` event when host deletes RSVP in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T036 [US3] Add audit logging for `RSVP_EXPORTED` event in CSV export in `backend/src/app/api/v1/invitation_exports.py`
- [ ] T037 [US3] Verify CSV export works with workspace isolation in `backend/src/app/api/v1/invitation_exports.py`

**Checkpoint**: Dashboard management operations are fully audited

---

## Phase 6: User Story 4 - Compliance Audit Trail (Priority: P2)

**Goal**: All invitation lifecycle events are logged to audit trail

**Independent Test**: Perform invitation operations and verify corresponding audit entries in Loki

### Implementation for User Story 4

- [ ] T038 [US4] Add audit logging for `INVITATION_CREATED` in `backend/src/app/services/digital_invitation_service.py`
- [ ] T039 [US4] Add audit logging for `INVITATION_PUBLISHED` in `backend/src/app/services/digital_invitation_service.py`
- [ ] T040 [US4] Add audit logging for `INVITATION_ARCHIVED` in `backend/src/app/services/digital_invitation_service.py`
- [ ] T041 [US4] Add audit logging for `INVITATION_DELETED` in `backend/src/app/services/digital_invitation_service.py`
- [ ] T042 [US4] Add failed access attempt logging in workspace authorization middleware
- [ ] T043 [US4] Create audit log verification test in `backend/tests/integration/test_invitation_audit_logging.py`

**Checkpoint**: Full audit trail for compliance - all operations logged

---

## Phase 7: User Story 5 - Error Recovery for Dashboard (Priority: P3)

**Goal**: Dashboard gracefully handles loading errors with retry functionality

**Independent Test**: Simulate API error and verify error boundary displays with retry button

### Implementation for User Story 5

- [ ] T044 [P] [US5] Create `InvitationErrorBoundary` component in `frontend/src/components/ErrorBoundary/InvitationErrorBoundary.tsx`
- [ ] T045 [US5] Wrap RSVPDashboard with error boundary in `frontend/src/components/features/invitations/RSVPDashboard.tsx`
- [ ] T046 [US5] Add retry functionality that invalidates React Query cache
- [ ] T047 [US5] Create error boundary test in `frontend/tests/components/InvitationErrorBoundary.test.tsx`

**Checkpoint**: Dashboard has graceful error recovery

---

## Phase 8: User Story 6 - PDF Guest List Export (Priority: P3)

**Goal**: Photographers can export RSVP guest list as formatted PDF

**Independent Test**: Click PDF export button and verify properly formatted PDF downloads

### Implementation for User Story 6

- [ ] T048 [P] [US6] Create PDF template in `backend/src/app/templates/pdf/guest_list.html`
- [ ] T049 [US6] Implement PDF export endpoint in `backend/src/app/api/v1/invitation_exports.py`
- [ ] T050 [US6] Add audit logging for PDF export with `RSVP_EXPORTED` event
- [ ] T051 [US6] Update frontend `RSVPExport.tsx` to call PDF export endpoint in `frontend/src/components/features/invitations/RSVPExport.tsx`
- [ ] T052 [US6] Remove "coming soon" toast and implement actual PDF download
- [ ] T053 [US6] Create PDF export test in `backend/tests/unit/api/test_pdf_export.py`

**Checkpoint**: PDF export functional - formatted document downloads correctly

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and documentation

- [ ] T054 Run full test suite and verify coverage targets (95% security, 85% services, 70% UI)
- [ ] T055 Run quickstart.md validation commands
- [ ] T056 [P] Update API documentation with new 409 response code
- [ ] T057 [P] Search for any remaining `console.log` or debug statements
- [ ] T058 Final security review of workspace isolation changes
- [ ] T059 Update feature spec status to "Complete"

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup ────────────────────────────┐
                                           ▼
Phase 2: Foundational ─────────────────────┤
                                           ▼
┌──────────────────────────────────────────┴──────────────────────────────────────────┐
│                     (All User Stories can proceed in parallel)                       │
├─────────────────┬─────────────────┬─────────────────┬─────────────────┬─────────────┤
│ Phase 3: US1    │ Phase 4: US2    │ Phase 5: US3    │ Phase 6: US4    │ Phase 7: US5│
│ (P1) MVP 🎯     │ (P2)            │ (P2)            │ (P2)            │ (P3)        │
│ Security        │ Notifications   │ Dashboard       │ Audit Trail     │ Error UI    │
└────────┬────────┴────────┬────────┴────────┬────────┴────────┬────────┴──────┬──────┘
         │                 │                 │                 │               │
         └─────────────────┴─────────────────┴─────────────────┴───────────────┘
                                           │
                                           ▼
                              Phase 8: US6 (P3) - PDF Export
                                           │
                                           ▼
                              Phase 9: Polish & Validation
```

### User Story Dependencies

| Story | Depends On | Can Proceed After |
|-------|-----------|-------------------|
| US1 (Security) | Foundational | Phase 2 complete |
| US2 (Notifications) | Foundational | Phase 2 complete |
| US3 (Dashboard Audit) | Foundational | Phase 2 complete |
| US4 (Compliance) | Foundational | Phase 2 complete |
| US5 (Error UI) | Foundational | Phase 2 complete |
| US6 (PDF Export) | US3 (for audit pattern) | Phase 5 complete |

### Within Each User Story

1. Tests written first (if included) and verified to FAIL
2. Backend changes before frontend
3. Core implementation before integration
4. Audit logging added after core functionality works

### Parallel Opportunities

**Phase 1** (all can run in parallel):
- T001-T004 migrations can be written in parallel

**Phase 2** (after T006-T007):
- T008 exception class is independent

**Phase 3 Tests** (all can run in parallel):
- T010, T011, T012 test files are independent

**Phase 4-6** (can run in parallel after Phase 2):
- US2, US3, US4 have no dependencies on each other
- Different team members can work simultaneously

**Phase 7-8** (can run in parallel):
- Frontend (US5) and Backend PDF (US6) are independent

---

## Parallel Example: User Story 1 Security Tests

```bash
# Launch all security tests for US1 together:
Task: "Create workspace isolation test in backend/tests/integration/test_rsvp_workspace_isolation.py"
Task: "Create duplicate prevention test in backend/tests/unit/repositories/test_rsvp_repository_duplicates.py"
Task: "Create concurrent submission test in backend/tests/integration/test_rsvp_concurrent_submissions.py"
```

## Parallel Example: Email Templates (US2)

```bash
# Launch all email templates together:
Task: "Create email template for RSVP confirmation in backend/src/app/templates/email/rsvp_confirmation.html"
Task: "Create email template for 7-day warning in backend/src/app/templates/email/deletion_warning_7day.html"
Task: "Create email template for 24-hour warning in backend/src/app/templates/email/deletion_warning_24hr.html"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only) 🎯

1. Complete Phase 1: Setup (migrations)
2. Complete Phase 2: Foundational (audit types, exception)
3. Complete Phase 3: User Story 1 (security fixes)
4. **STOP and VALIDATE**: Run security tests, verify 95% coverage
5. Deploy security fixes immediately

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. **US1 (Security)** → Deploy (critical security fixes live)
3. **US2 (Notifications)** → Deploy (email confirmations working)
4. **US3+US4 (Dashboard + Audit)** → Deploy (full audit trail)
5. **US5+US6 (UI + PDF)** → Deploy (enhanced user experience)

### Priority Guidance

| Priority | User Story | Recommendation |
|----------|-----------|----------------|
| P1 | US1 - Security | **MUST deploy first** - critical vulnerability fixes |
| P2 | US2 - Notifications | High value, user-facing improvement |
| P2 | US3 - Dashboard Audit | Compliance requirement |
| P2 | US4 - Compliance | SOC 2 requirement |
| P3 | US5 - Error UI | Nice-to-have UX improvement |
| P3 | US6 - PDF Export | Feature enhancement |

---

## Task Summary

| Phase | Tasks | Parallel | Story |
|-------|-------|----------|-------|
| Setup | T001-T005 (5) | 1 | - |
| Foundational | T006-T009 (4) | 1 | - |
| US1 Security | T010-T023 (14) | 3 | US1 |
| US2 Notifications | T024-T034 (11) | 2 | US2 |
| US3 Dashboard | T035-T037 (3) | 0 | US3 |
| US4 Compliance | T038-T043 (6) | 0 | US4 |
| US5 Error UI | T044-T047 (4) | 1 | US5 |
| US6 PDF Export | T048-T053 (6) | 1 | US6 |
| Polish | T054-T059 (6) | 2 | - |
| **Total** | **59 tasks** | **11** | |

---

## Notes

- [P] tasks = different files, no dependencies on other tasks in flight
- [Story] label maps task to specific user story for traceability
- Security tasks (US1) require 95% test coverage per Constitution
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- PDF export (US6) depends on US3 pattern for audit logging consistency
