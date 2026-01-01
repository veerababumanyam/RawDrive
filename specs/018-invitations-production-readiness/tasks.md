# Tasks: Digital Invitations Microservice Production Readiness

**Input**: Design documents from `/specs/018-invitations-production-readiness/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml

**Tests**: Test tasks included per spec.md requirements for security and integration testing.

**Organization**: Tasks grouped by user story to enable independent implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US8)
- All paths relative to `services/invitations-service/`

---

## Phase 1: Setup

**Purpose**: Project initialization and dependency updates

- [x] T001 Add structlog>=23.3.0 and prometheus-client>=0.19.0 to requirements.txt
- [x] T002 [P] Create src/logging/__init__.py with structlog configuration
- [x] T003 [P] Create src/logging/formatters.py with JSON formatter and PII filter processor
- [x] T004 [P] Create src/middleware/correlation.py for correlation ID generation and propagation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure required by ALL user stories

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Run migration 0074: Add edit_token and edit_token_expires_at columns to invitation_guests table
- [x] T006 Run migration 0075: Create invitation_views table for analytics tracking
- [x] T007 Run migration 0076: Create audit_events table (append-only) with REVOKE UPDATE/DELETE
- [x] T008 Run migration 0077: Create email_send_log table for bulk invite tracking
- [x] T009 [P] Create src/schemas/rsvp.py with RSVPSubmission, RSVPResponse, RSVPDetails schemas
- [x] T010 [P] Create src/schemas/audit.py with AuditEvent, AuditLogResponse schemas
- [x] T011 Update src/main.py to add correlation middleware and configure structlog
- [x] T012 Create src/services/audit_service.py with append-only log_event() method

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Secure Guest Invitation Emails (Priority: P0)

**Goal**: Prevent XSS vulnerabilities in email templates by HTML-escaping all user content

**Independent Test**: Send invitation with guest name `<script>alert('xss')</script>` and verify email shows escaped text

### Security Tests for User Story 1

- [x] T013 [P] [US1] Create tests/security/test_xss.py with HTML escape verification tests
- [x] T014 [P] [US1] Create tests/unit/test_html_escape.py with unit tests for safe_email_content()

### Implementation for User Story 1

- [x] T015 [P] [US1] Create src/utils/security.py with safe_email_content() using html.escape() and urllib.parse.quote()
- [x] T016 [US1] Modify src/workers/email_worker.py to use safe_email_content() for all template interpolation
- [x] T017 [US1] Add unit tests for email_worker template escaping in tests/unit/test_email_worker.py

**Checkpoint**: All user-provided content in emails is HTML-escaped

---

## Phase 4: User Story 2 - GDPR-Compliant Error Handling (Priority: P0)

**Goal**: Return generic error messages and filter PII from logs

**Independent Test**: Trigger auth errors and verify responses show "Authentication failed" only, check logs for no PII

### Security Tests for User Story 2

- [x] T018 [P] [US2] Create tests/security/test_error_leakage.py with tests for generic error responses
- [x] T019 [P] [US2] Create tests/unit/test_pii_filter.py with tests for log PII filtering

### Implementation for User Story 2

- [x] T020 [US2] Modify src/api/v1/dependencies.py to return generic "Authentication failed" for all auth exceptions
- [x] T021 [US2] Add internal logging with correlation_id for auth errors in dependencies.py
- [x] T022 [US2] Update src/logging/formatters.py with PII patterns for email, phone, name detection
- [x] T023 [US2] Replace all logger instances to use structured logger with PII filter

**Checkpoint**: No internal details in error responses, no PII in logs

---

## Phase 5: User Story 3 - Guest RSVP Submission (Priority: P1)

**Goal**: Enable guests to submit, view, and update RSVP responses via public API

**Independent Test**: Access public invitation URL, submit RSVP with plus-ones, receive edit token, update response

### Tests for User Story 3

- [x] T024 [P] [US3] Create tests/integration/test_rsvp_flow.py with end-to-end RSVP submission tests
- [x] T025 [P] [US3] Create tests/unit/test_rsvp_service.py with edit token generation/validation tests

### Implementation for User Story 3

- [x] T026 [US3] Create src/services/rsvp_service.py with submit_rsvp(), get_rsvp(), update_rsvp() methods
- [x] T027 [US3] Add generate_edit_token() using UUID4 + HMAC-SHA256 to rsvp_service.py
- [x] T028 [US3] Add verify_edit_token() with constant-time comparison to rsvp_service.py
- [x] T029 [US3] Implement POST /invitations/{slug}/rsvp endpoint in src/api/v1/rsvp.py
- [x] T030 [US3] Implement GET /invitations/{slug}/rsvp/{rsvpId} endpoint in src/api/v1/rsvp.py
- [x] T031 [US3] Implement PATCH /invitations/{slug}/rsvp/{rsvpId} endpoint in src/api/v1/rsvp.py
- [x] T032 [US3] Add audit logging for rsvp.submit and rsvp.update actions
- [x] T033 [US3] Add rate limiting (10/min per IP) to RSVP submission endpoint

**Checkpoint**: Guests can submit and modify RSVPs with secure edit tokens

---

## Phase 6: User Story 4 - Invitation Analytics Dashboard (Priority: P1)

**Goal**: Provide organizers with view counts, RSVP statistics, and device breakdown

**Independent Test**: Have test guests view invitation and submit RSVPs, verify analytics show accurate counts

### Tests for User Story 4

- [x] T034 [P] [US4] Create tests/integration/test_analytics.py with analytics query tests
- [x] T035 [P] [US4] Create tests/unit/test_view_tracking.py with visitor fingerprint tests

### Implementation for User Story 4

- [x] T036 [US4] Create src/services/view_service.py with track_view() and generate_visitor_hash() methods
- [x] T037 [US4] Add parse_device_type() and parse_browser() helpers to view_service.py
- [x] T038 [US4] Create src/services/analytics_service.py with get_view_stats(), get_rsvp_stats(), get_device_stats()
- [x] T039 [US4] Add database queries for unique visitors, views by period in analytics_service.py
- [x] T040 [US4] Add RSVP aggregation query (attending/not/maybe counts) to analytics_service.py
- [x] T041 [US4] Implement GET /workspaces/{id}/invitations/{id}/analytics in src/api/v1/analytics.py
- [x] T042 [US4] Implement GET /workspaces/{id}/invitations/{id}/analytics/views in analytics.py
- [x] T043 [US4] Implement GET /workspaces/{id}/invitations/{id}/analytics/rsvp in analytics.py
- [x] T044 [US4] Add 10-minute cache TTL for analytics responses using redis_client

**Checkpoint**: Organizers see real-time analytics with cached performance

---

## Phase 7: User Story 5 - Bulk Email Invitations (Priority: P1)

**Goal**: Enable organizers to send invitations to hundreds of guests with status tracking

**Independent Test**: Trigger bulk invite for 50 guests, verify all queued, track delivery status

### Tests for User Story 5

- [x] T045 [P] [US5] Create tests/integration/test_bulk_invite.py with batch processing tests
- [x] T046 [P] [US5] Create tests/unit/test_email_send_log.py with status tracking tests

### Implementation for User Story 5

- [x] T047 [US5] Create src/services/bulk_invite_service.py with queue_bulk_invites() method
- [x] T048 [US5] Add batch_fetch_guests() for efficient N+1 prevention in bulk_invite_service.py
- [x] T049 [US5] Add insert_send_log_entries() for tracking individual sends in bulk_invite_service.py
- [x] T050 [US5] Modify email_worker.py to update email_send_log status on completion/failure
- [x] T051 [US5] Implement POST /workspaces/{id}/invitations/{id}/guests/bulk-invite in src/api/v1/guests.py
- [x] T052 [US5] Implement GET /workspaces/{id}/bulk-invite/{batchId}/status in guests.py
- [x] T053 [US5] Add audit logging for guest.bulk_invite action with batch_id and count metadata
- [x] T054 [US5] Add retry logic with exponential backoff (max 3 retries) to email_worker.py

**Checkpoint**: Bulk invites queued efficiently with individual tracking

---

## Phase 8: User Story 6 - Audit Trail for Compliance (Priority: P2)

**Goal**: Record all sensitive operations in immutable audit log

**Independent Test**: Perform guest CRUD and CSV import, query audit log to verify all recorded

### Tests for User Story 6

- [x] T055 [P] [US6] Create tests/unit/test_audit_service.py with append-only logging tests
- [x] T056 [P] [US6] Create tests/integration/test_audit_trail.py with full CRUD audit verification

### Implementation for User Story 6

- [x] T057 [US6] Add guest.create, guest.update, guest.delete logging in src/services/guest_service.py
- [x] T058 [US6] Add guest.bulk_import logging with count metadata in guest_service.py
- [x] T059 [US6] Implement GET /workspaces/{id}/audit-log endpoint in src/api/v1/audit.py (new file)
- [x] T060 [US6] Add query filters (resource_type, action, from, to, limit) to audit endpoint
- [x] T061 [US6] Include router in src/api/v1/__init__.py for audit endpoints

**Checkpoint**: All data modifications recorded with actor, timestamp, workspace context

---

## Phase 9: User Story 7 - System Observability (Priority: P2)

**Goal**: Enable operators to monitor system health via logs, metrics, and tracing

**Independent Test**: Make API requests, verify JSON logs with correlation IDs, scrape /metrics endpoint

### Tests for User Story 7

- [x] T062 [P] [US7] Create tests/unit/test_correlation.py with correlation ID propagation tests
- [x] T063 [P] [US7] Create tests/unit/test_metrics.py with Prometheus counter/histogram tests

### Implementation for User Story 7

- [x] T064 [US7] Create src/middleware/metrics.py with request count, latency histogram, error count
- [x] T065 [US7] Add http_requests_total, http_request_duration_seconds, rsvp_submissions_total counters
- [x] T066 [US7] Implement GET /metrics endpoint in src/main.py using prometheus_client
- [x] T067 [US7] Update src/workers/celery_app.py to propagate correlation_id via task headers
- [x] T068 [US7] Add correlation_id to all worker log entries in email_worker.py
- [x] T069 [US7] Update config.py with PROMETHEUS_ENABLED and LOG_FORMAT settings

**Checkpoint**: Full observability with JSON logs, correlation IDs, Prometheus metrics

---

## Phase 10: User Story 8 - Resilient External Service Integration (Priority: P3)

**Goal**: Handle external service failures gracefully with circuit breaker and fallback

**Independent Test**: Simulate Redis downtime, verify system serves requests from database

### Tests for User Story 8

- [x] T070 [P] [US8] Create tests/unit/test_circuit_breaker.py with state transition tests
- [x] T071 [P] [US8] Create tests/integration/test_resilience.py with Redis failure simulation

### Implementation for User Story 8

- [x] T072 [US8] Create src/core/circuit_breaker.py with CircuitBreaker class (closed/open/half-open states)
- [x] T073 [US8] Add failure_threshold=5, recovery_timeout=60 configuration to circuit_breaker.py
- [x] T074 [US8] Wrap redis_client operations with circuit breaker in src/cache/redis_client.py
- [x] T075 [US8] Add database fallback when cache circuit is open in redis_client.py
- [x] T076 [US8] Create src/services/email/base.py with EmailProvider abstract base class
- [x] T077 [US8] Create src/services/email/sendgrid.py implementing EmailProvider
- [x] T078 [US8] Create src/services/email/__init__.py with provider factory
- [x] T079 [US8] Wrap email provider with circuit breaker in email_worker.py
- [x] T080 [US8] Update GET /ready endpoint to report degraded status when cache unavailable
- [x] T081 [US8] Log circuit state changes with structured logging

**Checkpoint**: System resilient to external failures with automatic recovery

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, cleanup, and validation

- [x] T082 [P] Run all unit tests and ensure 85%+ coverage in services
- [x] T083 [P] Run all integration tests for RSVP, analytics, bulk invite flows
- [x] T084 [P] Run security tests for XSS and error leakage
- [x] T085 Validate all API endpoints match contracts/openapi.yaml
- [x] T086 Run quickstart.md validation scenarios
- [x] T087 Code cleanup: Remove placeholder responses from analytics.py and rsvp.py
- [x] T088 Update API documentation with new endpoints

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-10)**: All depend on Foundational phase
  - P0 stories (US1, US2): Must complete before P1 stories
  - P1 stories (US3, US4, US5): Can run in parallel after P0
  - P2 stories (US6, US7): Can run in parallel after P1
  - P3 story (US8): Can start after P2
- **Polish (Phase 11)**: Depends on all user stories

### User Story Dependencies

| Story | Priority | Depends On | Can Parallel With |
|-------|----------|------------|-------------------|
| US1 (XSS Prevention) | P0 | Foundational | US2 |
| US2 (Error Handling) | P0 | Foundational | US1 |
| US3 (RSVP) | P1 | US1, US2 | US4, US5 |
| US4 (Analytics) | P1 | US1, US2 | US3, US5 |
| US5 (Bulk Invite) | P1 | US1, US2 | US3, US4 |
| US6 (Audit) | P2 | US3, US5 | US7 |
| US7 (Observability) | P2 | Foundational | US6 |
| US8 (Resilience) | P3 | US6, US7 | None |

### Within Each User Story

1. Tests FIRST (marked [P] for parallel)
2. Service layer implementation
3. API endpoint implementation
4. Integration and cleanup

---

## Parallel Execution Examples

### Phase 3-4 (P0 Security - can run together)

```bash
# All P0 security tasks in parallel
Task: T013 [US1] Create tests/security/test_xss.py
Task: T014 [US1] Create tests/unit/test_html_escape.py
Task: T018 [US2] Create tests/security/test_error_leakage.py
Task: T019 [US2] Create tests/unit/test_pii_filter.py
```

### Phase 5-7 (P1 Core - can run in parallel after P0)

```bash
# US3 RSVP tests in parallel
Task: T024 [US3] Create tests/integration/test_rsvp_flow.py
Task: T025 [US3] Create tests/unit/test_rsvp_service.py

# US4 Analytics tests in parallel
Task: T034 [US4] Create tests/integration/test_analytics.py
Task: T035 [US4] Create tests/unit/test_view_tracking.py

# US5 Bulk invite tests in parallel
Task: T045 [US5] Create tests/integration/test_bulk_invite.py
Task: T046 [US5] Create tests/unit/test_email_send_log.py
```

---

## Implementation Strategy

### MVP First (P0 Security Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: US1 (XSS Prevention)
4. Complete Phase 4: US2 (Error Handling)
5. **STOP and VALIDATE**: Run security tests
6. Deploy security-hardened microservice

### Core Functionality (Add P1)

7. Complete Phase 5: US3 (RSVP)
8. Complete Phase 6: US4 (Analytics)
9. Complete Phase 7: US5 (Bulk Invite)
10. **STOP and VALIDATE**: Run integration tests
11. Deploy with full functionality

### Production Ready (Add P2/P3)

12. Complete Phase 8: US6 (Audit)
13. Complete Phase 9: US7 (Observability)
14. Complete Phase 10: US8 (Resilience)
15. Complete Phase 11: Polish
16. **FINAL VALIDATION**: All tests pass
17. Production deployment

---

## Task Summary

| Phase | User Story | Task Count | Parallel Tasks |
|-------|------------|------------|----------------|
| 1 | Setup | 4 | 3 |
| 2 | Foundational | 8 | 2 |
| 3 | US1 (XSS) | 5 | 2 |
| 4 | US2 (Errors) | 6 | 2 |
| 5 | US3 (RSVP) | 10 | 2 |
| 6 | US4 (Analytics) | 11 | 2 |
| 7 | US5 (Bulk) | 10 | 2 |
| 8 | US6 (Audit) | 7 | 2 |
| 9 | US7 (Observability) | 8 | 2 |
| 10 | US8 (Resilience) | 12 | 2 |
| 11 | Polish | 7 | 4 |
| **Total** | | **88** | **25** |

---

## Notes

- All file paths relative to `services/invitations-service/`
- [P] tasks = different files, no dependencies within phase
- [US#] label maps task to specific user story
- Commit after each task or logical group
- Security tests (XSS, error leakage) must pass before P1 work
- Run `alembic upgrade head` after migrations in Phase 2
