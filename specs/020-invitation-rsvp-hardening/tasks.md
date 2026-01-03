# Tasks: Invitation RSVP System Hardening

**Input**: Design documents from `/specs/020-invitation-rsvp-hardening/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/
**Branch**: `020-invitation-rsvp-hardening`

**Tests**: Security stories expect tests (Constitution 95% on security-sensitive files; 85% services; 70% UI). Tests are included where relevant.

**Organization**: Tasks are grouped by user story (US1–US6) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable (different files, no ordering dependency)
- **[Story]**: User story label (US1, US2, …) — omitted for Setup/Foundational/Polish
- All tasks include exact file paths

## Path Conventions

- **Backend**: `backend/src/app/`, migrations in `backend/migrations/versions/`
- **Frontend**: `frontend/src/`
- **Tests Backend**: `backend/tests/`
- **Tests Frontend**: `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database dedup constraints and indexes

- [X] T001 Add migration to clean duplicates and enforce unique `(invitation_id, lower(guest_email))` in `backend/migrations/versions/0082_add_rsvp_unique_constraint.py`
- [X] T002 [P] Add migration for invitation views dedup index in `backend/migrations/versions/0083_add_views_dedup_index.py`
- [X] T003 [P] Verify local/staging Alembic upgrade head with new migrations in `backend/`
- [X] T004 Document migration run/rollback steps in `specs/020-invitation-rsvp-hardening/quickstart.md`
- [X] T057 Add monitoring panel to validate invitation view dedup index efficacy in `infrastructure/monitoring/grafana/dashboards/views.json`
- [X] T058 [P] Add integration test to assert dedup index prevents duplicate view counts in `backend/tests/integration/test_invitation_views_dedup.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared primitives required by all user stories

- [X] T005 Add audit event types for invitations/RSVPs in `backend/src/app/services/audit_service.py`
- [X] T006 Create idempotency service skeleton (Redis client + key format) in `backend/src/app/services/idempotency_service.py`
- [X] T007 [P] Ensure structured logging filters PII (guest_email/name) in `backend/src/app/logging.py`
- [X] T008 [P] Add contract header note for `Idempotency-Key` to public RSVP endpoint in `specs/020-invitation-rsvp-hardening/contracts/api-changes.yaml`
- [X] T009 Validate `.env` placeholders for `DATABASE_URL`, `REDIS_URL`, `SENDGRID_API_KEY`, `LOKI_URL` in `backend/.env.example`

**Checkpoint**: Foundations ready; user stories may proceed.

---

## Phase 3: User Story 1 - Secure RSVP Submission (Priority: P1) 🎯 MVP

**Goal**: Enforce workspace isolation and duplicate prevention for RSVP submission.

**Independent Test**: Submit RSVP via public link; verify visibility only within workspace; duplicate attempts return 409.

### Tests for User Story 1

- [ ] T010 [P] [US1] Add workspace isolation integration test in `backend/tests/integration/test_rsvp_workspace_isolation.py`
- [ ] T011 [P] [US1] Add duplicate prevention/unit test for repository in `backend/tests/unit/repositories/test_rsvp_repository_duplicates.py`
- [ ] T012 [P] [US1] Add concurrent submission test covering unique constraint in `backend/tests/integration/test_rsvp_concurrency.py`

### Implementation for User Story 1

- [ ] T013 [US1] Remove unsafe alias methods and require `workspace_id` in repository updates/deletes in `backend/src/app/repositories/rsvp_repository.py`
- [ ] T014 [US1] Update service callers to pass `workspace_id` to repository methods in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T015 [US1] Normalize email and handle `UniqueViolation` with 409 response in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T016 [US1] Strip PII from RSVP logging (use ids only) in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T017 [US1] Emit `RSVP_SUBMITTED` audit event after successful create in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T018 [US1] Ensure public RSVP route validates invitation workspace ownership in `backend/src/app/api/v1/public_invitations.py`
- [ ] T019 [US1] Run US1 test set and confirm 95% coverage on touched modules in `backend/tests/`
- [ ] T059 [P] [US1] Add expired invitation response test for public RSVP in `backend/tests/integration/test_invitation_expired.py`
- [ ] T060 [US1] Implement expired invitation guard with user-facing message in `backend/src/app/api/v1/public_invitations.py`
- [ ] T061 [P] [US1] Add edit deadline enforcement test for RSVP edit link in `backend/tests/integration/test_rsvp_edit_deadline.py`
- [ ] T062 [US1] Enforce edit deadline and return clear message in `backend/src/app/services/invitation_rsvp_service.py`

**Checkpoint**: RSVP submission secure, isolated, and deduplicated.

---

## Phase 4: User Story 2 - RSVP Confirmation & Edit Notifications (Priority: P2)

**Goal**: Guests receive confirmation email with edit link; deletion warnings sent ahead of auto-delete.

**Independent Test**: Submit RSVP → receive confirmation with working edit link within 5 minutes; 7-day/24h warnings enqueue.

### Tests for User Story 2

- [ ] T020 [P] [US2] Add confirmation email enqueue test in `backend/tests/unit/services/test_invitation_rsvp_email.py`
- [ ] T021 [P] [US2] Add deletion warning scheduling test (7d/24h) in `backend/tests/unit/services/test_invitation_auto_deletion_service.py`

### Implementation for User Story 2

- [ ] T022 [US2] Generate signed edit link token (workspace + invitation + rsvp + nonce) in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T023 [US2] Queue confirmation email with template + edit link in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T024 [US2] Add confirmation email template in `backend/src/app/templates/email/rsvp_confirmation.html`
- [ ] T025 [US2] Implement deletion warning enqueue (7d/24h) in `backend/src/app/services/invitation_auto_deletion_service.py`
- [ ] T026 [US2] Add deletion warning templates in `backend/src/app/templates/email/deletion_warning_7day.html` and `.../deletion_warning_24hr.html`
- [ ] T027 [US2] Audit log email enqueue events (`RSVP_UPDATED`/warning) in `backend/src/app/services/invitation_auto_deletion_service.py`
- [X] T063 [US2] Implement email retry/backoff queue for confirmation and warnings in `backend/src/app/services/email_retry_service.py`
- [X] T064 [P] [US2] Unit test for email retry/backoff enqueue wrapper in `backend/tests/unit/services/test_email_retry_service.py`
- [X] T065 [US2] Document email retry semantics and headers in `specs/020-invitation-rsvp-hardening/contracts/api-changes.yaml`

**Checkpoint**: Email notifications and edit links operational.

---

## Phase 5: User Story 3 - RSVP Management Dashboard (Priority: P2)

**Goal**: Dashboard lists RSVPs with correct stats and CSV export is workspace-scoped.

**Independent Test**: Dashboard shows only workspace RSVPs; CSV export contains only workspace rows.

### Tests for User Story 3

- [ ] T028 [P] [US3] Add CSV export workspace isolation test in `backend/tests/integration/test_invitation_export_csv.py`
- [ ] T029 [P] [US3] Add dashboard stats calculation test in `backend/tests/unit/services/test_invitation_dashboard_stats.py`

### Implementation for User Story 3

- [ ] T030 [US3] Enforce workspace filter on dashboard queries in `backend/src/app/services/invitation_dashboard_service.py`
- [ ] T031 [US3] Stream CSV export with workspace filter and PII-free logs in `backend/src/app/api/v1/invitation_exports.py`
- [ ] T032 [US3] Add audit event `RSVP_EXPORTED` for CSV downloads in `backend/src/app/services/audit_service.py`
- [ ] T033 [US3] Update frontend dashboard to display counts from workspace-scoped API in `frontend/src/features/invitations/components/RSVPDashboard.tsx`
- [X] T066 [P] [US3] Add CSV export performance test (≤5s @ 500 RSVPs) in `backend/tests/performance/test_invitation_export_csv_perf.py`

**Checkpoint**: Dashboard data and CSV export isolated per workspace.

---

## Phase 6: User Story 4 - Compliance Audit Trail (Priority: P2)

**Goal**: All invitation/RSVP lifecycle events and denied access attempts are audited.

**Independent Test**: Trigger create/update/delete/access-denied and verify audit entries in Loki/DB.

### Tests for User Story 4

- [ ] T034 [P] [US4] Add audit event coverage test for invitation lifecycle in `backend/tests/integration/test_invitation_audit_logging.py`
- [ ] T035 [P] [US4] Add access-denied audit test for workspace guard in `backend/tests/integration/test_workspace_authorization.py`

### Implementation for User Story 4

- [ ] T036 [US4] Emit audit events for invitation create/publish/archive/delete in `backend/src/app/services/digital_invitation_service.py`
- [ ] T037 [US4] Emit audit events for RSVP update/delete/edit-token use in `backend/src/app/services/invitation_rsvp_service.py`
- [ ] T038 [US4] Log failed access attempts with workspace context in `backend/src/app/middleware/workspace_auth.py`
- [ ] T039 [US4] Add Loki/structlog context binding for `workspace_id` in `backend/src/app/logging.py`

**Checkpoint**: Compliance audit trail complete.

---

## Phase 7: User Story 5 - Error Recovery for Dashboard (Priority: P3)

**Goal**: Dashboard has error boundary with retry; UI responsive and themed.

**Independent Test**: Force API failure → error boundary shows; retry reloads; mobile + dark/light theme render correctly.

### Tests for User Story 5

- [ ] T040 [P] [US5] Add error boundary component test in `frontend/tests/components/InvitationErrorBoundary.test.tsx`
- [ ] T041 [P] [US5] Add visual regression baseline for dashboard (mobile/desktop, light/dark) in `frontend/tests/visual/rsvp_dashboard.spec.ts`

### Implementation for User Story 5

- [ ] T042 [US5] Create `InvitationErrorBoundary` with retry hook in `frontend/src/components/ErrorBoundary/InvitationErrorBoundary.tsx`
- [ ] T043 [US5] Wrap dashboard content with error boundary and retry behavior in `frontend/src/features/invitations/components/RSVPDashboard.tsx`
- [ ] T044 [US5] Apply responsive layout + design tokens for dashboard grid in `frontend/src/features/invitations/components/RSVPDashboard.tsx`
- [ ] T045 [US5] Ensure theme toggle + system preference honored in `frontend/src/features/invitations/components/RSVPDashboard.tsx`

**Checkpoint**: Dashboard resilient with responsive, themed UI.

---

## Phase 8: User Story 6 - PDF Guest List Export (Priority: P3)

**Goal**: Photographers can download workspace-scoped guest list as PDF.

**Independent Test**: Click export → PDF downloads with correct workspace data and branding.

### Tests for User Story 6

- [ ] T046 [P] [US6] Add PDF export integration test covering workspace filter in `backend/tests/integration/test_invitation_pdf_export.py`
- [ ] T047 [P] [US6] Add frontend download flow test (blob download) in `frontend/tests/features/invitations/rsvp_export_pdf.test.ts`

### Implementation for User Story 6

- [ ] T048 [US6] Implement PDF render endpoint (WeasyPrint) with workspace filter in `backend/src/app/api/v1/invitation_exports.py`
- [ ] T049 [US6] Add PDF template for guest list in `backend/src/app/templates/pdf/guest_list.html`
- [ ] T050 [US6] Audit log PDF exports as `RSVP_EXPORTED` in `backend/src/app/services/audit_service.py`
- [ ] T051 [US6] Wire frontend export button to PDF endpoint with blob download in `frontend/src/features/invitations/components/RSVPExport.tsx`

**Checkpoint**: PDF export delivered end-to-end.

---

## Final Phase: Polish & Cross-Cutting Concerns

- [ ] T052 Harden PII scrubbing and structured logging across new codepaths in `backend/src/app/`
- [ ] T053 Add Grafana/Loki panel for RSVP errors + audit anomalies in `infrastructure/monitoring/grafana/dashboards/rsvp.json`
- [ ] T054 Update docs with final behavior and `lastUpdated` in `docs/Features/DigitalInvitation.md` and `docs/TechnicalSpecs/invitations.json`
- [ ] T055 Validate WCAG AA contrast for RSVP UI tokens in `frontend/src/features/invitations/components/RSVPDashboard.tsx`
- [ ] T056 Run full backend + frontend suites (pytest, vitest) and record results in `specs/020-invitation-rsvp-hardening/quickstart.md`

---

## Dependencies / Execution Order

1. Phase 1 → Phase 2 (foundations) → user stories in priority order: US1 (P1 MVP) → US2/US3/US4 (P2) → US5/US6 (P3) → Final Polish.
2. Each user story is independently testable via its listed tests and checkpoint.

### User Story Dependencies

| Story | Depends On | Can Proceed After |
|-------|-----------|-------------------|
| US1 (Security) | Foundational | Phase 2 complete |
| US2 (Notifications) | Foundational | Phase 2 complete |
| US3 (Dashboard Audit) | Foundational | Phase 2 complete |
| US4 (Compliance) | Foundational | Phase 2 complete |
| US5 (Error UI) | Foundational | Phase 2 complete |
| US6 (PDF Export) | US3 (audit pattern) | Phase 5 complete |

### Parallel Opportunities

- [P] tasks across different files: migrations (T001–T002), logging/audit updates (T007–T008), most tests (T010–T012, T020–T021, T028–T029, T034–T035, T040–T041, T046–T047), frontend styling vs backend exports (T042–T051).

### Parallel Examples

```bash
# US1 security tests together
Task: "Create workspace isolation test" (backend/tests/integration/test_rsvp_workspace_isolation.py)
Task: "Create duplicate prevention test" (backend/tests/unit/repositories/test_rsvp_repository_duplicates.py)
Task: "Create concurrent submission test" (backend/tests/integration/test_rsvp_concurrency.py)

# US2 email templates together
Task: "Create confirmation email template" (backend/src/app/templates/email/rsvp_confirmation.html)
Task: "Create 7-day warning template" (backend/src/app/templates/email/deletion_warning_7day.html)
Task: "Create 24-hour warning template" (backend/src/app/templates/email/deletion_warning_24hr.html)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only) 🎯

1. Complete Phase 1: Setup (migrations)
2. Complete Phase 2: Foundational (audit types, logging/idempotency scaffolding)
3. Complete Phase 3: User Story 1 (security fixes)
4. **STOP and VALIDATE**: Run security tests, verify 95% coverage
5. Deploy security fixes immediately

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. **US1 (Security)** → Deploy (critical security fixes live)
3. **US2 (Notifications)** → Deploy (email confirmations + edit links)
4. **US3 + US4 (Dashboard + Audit)** → Deploy (workspace isolation + compliance)
5. **US5 + US6 (UI + PDF)** → Deploy (resilient UI + exports)

### Priority Guidance

| Priority | User Story | Recommendation |
|----------|-----------|----------------|
| P1 | US1 - Security | **Ship first** to close vulnerabilities |
| P2 | US2 - Notifications | High-value guest comms |
| P2 | US3 - Dashboard | Required for host usability |
| P2 | US4 - Compliance | SOC 2-aligned auditability |
| P3 | US5 - Error UI | UX resilience |
| P3 | US6 - PDF Export | Vendor-facing enhancement |

### Task Summary

| Phase | Tasks | Parallel | Story |
|-------|-------|----------|-------|
| Setup | T001–T004, T057–T058 (6) | 3 | - |
| Foundational | T005–T009 (5) | 2 | - |
| US1 Security | T010–T019, T059–T062 (14) | 5 | US1 |
| US2 Notifications | T020–T027, T063–T065 (11) | 3 | US2 |
| US3 Dashboard | T028–T033, T066 (7) | 3 | US3 |
| US4 Compliance | T034–T039 (6) | 2 | US4 |
| US5 Error UI | T040–T045 (6) | 2 | US5 |
| US6 PDF Export | T046–T051 (6) | 2 | US6 |
| Polish | T052–T056 (5) | 2 | - |
| **Total** | **66 tasks** | **22 [P] slots** | |

### Notes

- [P] tasks = different files, no dependencies on other tasks in flight
- [Story] labels map tasks to user stories for traceability
- Security (US1) targets 95% coverage; keep PII out of logs throughout
- Each user story has an independent test + checkpoint for incremental delivery
- MVP scope: deliver through US1 for immediate hardening

### Format Validation

- All tasks follow `- [ ] T### [P?] [Story?] Description with file path`.
