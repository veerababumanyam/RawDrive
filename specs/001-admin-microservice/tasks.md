# Tasks: Admin Microservice

**Input**: Design documents from `/specs/001-admin-microservice/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), data-model.md (complete), contracts/ (complete)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `admin-service/src/` (FastAPI microservice)
- **Migrations**: `admin-service/migrations/`
- **Tests**: `admin-service/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure for the admin-service microservice

- [ ] T001 Create `admin-service/` directory structure per plan.md
- [ ] T002 Initialize Python project with pyproject.toml (FastAPI, SQLAlchemy, pydantic-settings, pyotp, bcrypt)
- [ ] T003 [P] Create `admin-service/src/core/config.py` - Settings with pydantic-settings
- [ ] T004 [P] Create `admin-service/src/core/exceptions.py` - Custom exception classes
- [ ] T005 [P] Create `admin-service/src/core/logging.py` - Structured logging with structlog
- [ ] T006 [P] Create `admin-service/Dockerfile` for containerized deployment
- [ ] T007 [P] Create `admin-service/.env.example` with required environment variables
- [ ] T008 Configure linting (ruff) and formatting (black) in pyproject.toml

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**Critical**: No user story work can begin until this phase is complete

### Database Foundation

- [ ] T009 Setup Alembic migrations framework in `admin-service/migrations/`
- [ ] T010 Create `admin-service/src/db/base.py` - SQLAlchemy declarative base
- [ ] T011 Create `admin-service/src/db/session.py` - Async database session factory
- [ ] T012 Create initial migration for `admin_platform_permissions` table (seed data)
- [ ] T013 [P] Create initial migration for `admin_platform_admins` table
- [ ] T014 [P] Create initial migration for `admin_sessions` table
- [ ] T015 [P] Create initial migration for `admin_audit_logs` table with monthly partitioning
- [ ] T016 [P] Create initial migration for `admin_role_permissions` table
- [ ] T017 Create migration seed data for system role templates (super_admin, platform_admin, support_admin, etc.)

### Core Security Infrastructure

- [ ] T018 Create `admin-service/src/core/security.py` - JWT handling, password hashing, session binding (FR-086)
- [ ] T019 Create `admin-service/src/core/mfa.py` - TOTP with pyotp, backup codes
- [ ] T020 Create `admin-service/src/api/deps.py` - Dependency injection (get_current_admin, require_permission)
- [ ] T021 Create `admin-service/src/middleware/session_binding.py` - IP/device validation per request

### API Framework

- [ ] T022 Create `admin-service/src/main.py` - FastAPI app entry point with CORS, middleware
- [ ] T023 Create `admin-service/src/api/v1/__init__.py` - API router aggregation
- [ ] T024 Create `admin-service/src/schemas/common.py` - Pagination, ErrorResponse schemas

### Audit Logging Infrastructure

- [ ] T025 Create `admin-service/src/db/models/audit_log.py` - AuditLogEntry ORM model
- [ ] T026 Create `admin-service/src/services/audit_service.py` - Audit logging with severity levels
- [ ] T027 Create `admin-service/src/middleware/audit.py` - Request/response audit middleware

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Super Admin Manages Platform Admins (Priority: P1) - MVP

**Goal**: Super Admin can invite, list, disable admins and assign roles with full audit trail

**Entities**: admin_platform_admins, admin_invites, admin_role_permissions
**Endpoints**: /admin/v1/auth/*, /admin/v1/admins/*, /admin/v1/invites/*, /admin/v1/roles/*
**Requirements**: FR-001 to FR-010, FR-086, FR-087

### Models for US1

- [ ] T028 [P] [US1] Create `admin-service/src/db/models/admin.py` - AdminPlatformAdmin ORM model
- [ ] T029 [P] [US1] Create `admin-service/src/db/models/invite.py` - AdminInvite ORM model
- [ ] T030 [P] [US1] Create `admin-service/src/db/models/permission.py` - AdminPlatformPermission, AdminRolePermission ORM models
- [ ] T031 [P] [US1] Create `admin-service/src/db/models/session.py` - AdminSession ORM model

### Schemas for US1

- [ ] T032 [P] [US1] Create `admin-service/src/schemas/auth.py` - LoginRequest, MFAChallenge, AuthTokens
- [ ] T033 [P] [US1] Create `admin-service/src/schemas/admin.py` - AdminResponse, AdminUpdateRequest, DisableRequest
- [ ] T034 [P] [US1] Create `admin-service/src/schemas/invite.py` - InviteRequest, InviteResponse, AcceptInviteRequest
- [ ] T035 [P] [US1] Create `admin-service/src/schemas/role.py` - RoleAssignmentRequest, RoleListResponse, PermissionListResponse

### Services for US1

- [ ] T036 [US1] Create `admin-service/src/services/auth_service.py` - Login flow, MFA verification, session management
- [ ] T037 [US1] Create `admin-service/src/services/admin_service.py` - Admin CRUD, status transitions, role assignments
- [ ] T038 [US1] Create `admin-service/src/services/invite_service.py` - Invite creation, token generation, acceptance flow

### API Endpoints for US1

- [ ] T039 [US1] Create `admin-service/src/api/v1/auth.py` - POST /auth/login, /auth/mfa/verify, /auth/logout
- [ ] T040 [US1] Create `admin-service/src/api/v1/admins.py` - GET/PATCH /admins, /admins/{id}, /admins/{id}/disable, /admins/{id}/roles
- [ ] T041 [US1] Create `admin-service/src/api/v1/invites.py` - GET/POST /invites, DELETE /invites/{id}, POST /invites/accept
- [ ] T042 [US1] Create `admin-service/src/api/v1/roles.py` - GET /roles, GET /permissions

### Step-Up Authentication for US1

- [ ] T043 [US1] Implement step-up MFA verification for sensitive operations (FR-087) in deps.py
- [ ] T044 [US1] Add session binding validation to all authenticated endpoints

### Validation & Error Handling for US1

- [ ] T045 [US1] Add input validation for all US1 endpoints using Pydantic
- [ ] T046 [US1] Add proper error responses and logging for edge cases (EC-001 to EC-007)

**Checkpoint**: Super Admin can manage platform admins with full MFA and audit trail

---

## Phase 4: User Story 2 - Support Admin Accesses Customer Workspace (Priority: P1) - MVP

**Goal**: Support Admin can create time-limited sessions to access customer workspaces with justification

**Entities**: admin_support_sessions
**Endpoints**: /admin/v1/support/sessions/*
**Requirements**: FR-011 to FR-020

### Database for US2

- [ ] T047 [US2] Create migration for `admin_support_sessions` table

### Models for US2

- [ ] T048 [US2] Create `admin-service/src/db/models/support_session.py` - AdminSupportSession ORM model

### Schemas for US2

- [ ] T049 [US2] Create `admin-service/src/schemas/support_session.py` - CreateSupportSessionRequest, SupportSessionResponse, ExtendSessionRequest

### Services for US2

- [ ] T050 [US2] Create `admin-service/src/services/support_session_service.py` - Create, extend, revoke, list sessions
- [ ] T051 [US2] Create `admin-service/src/services/notification_service.py` - Customer notification on session start/end

### API Endpoints for US2

- [ ] T052 [US2] Create `admin-service/src/api/v1/support_access.py` - All support session endpoints per contracts/support-access.yaml

### Integration for US2

- [ ] T053 [US2] Implement main backend integration for workspace access token generation
- [ ] T054 [US2] Add real-time WebSocket notification to workspace owners (FR-015)

### Session Controls for US2

- [ ] T055 [US2] Implement automatic session expiry worker in `admin-service/src/workers/session_expiry.py`
- [ ] T056 [US2] Add session action logging to audit trail (FR-017)

**Checkpoint**: Support Admin can access customer workspaces with full audit trail and notifications

---

## Phase 5: User Story 3 - Super Admin Handles Break-Glass Emergency (Priority: P1) - MVP

**Goal**: Super Admin can request emergency access requiring dual control approval

**Entities**: admin_break_glass_sessions
**Endpoints**: /admin/v1/break-glass/*
**Requirements**: FR-021 to FR-025

### Database for US3

- [ ] T057 [US3] Create migration for `admin_break_glass_sessions` table

### Models for US3

- [ ] T058 [US3] Create `admin-service/src/db/models/break_glass.py` - AdminBreakGlassSession ORM model

### Schemas for US3

- [ ] T059 [US3] Create `admin-service/src/schemas/break_glass.py` - CreateBreakGlassRequest, BreakGlassRequestResponse, ApproveBreakGlassRequest

### Services for US3

- [ ] T060 [US3] Create `admin-service/src/services/break_glass_service.py` - Request, approve, deny, terminate workflows
- [ ] T061 [US3] Create `admin-service/src/services/alert_service.py` - Multi-channel critical alerts (email, SMS, Slack)

### API Endpoints for US3

- [ ] T062 [US3] Create `admin-service/src/api/v1/break_glass.py` - All break-glass endpoints per contracts/support-access.yaml

### Dual Control for US3

- [ ] T063 [US3] Implement approver validation (cannot approve own request)
- [ ] T064 [US3] Implement 15-minute approval window expiry
- [ ] T065 [US3] Implement 1-hour max access duration with auto-termination

### Alerting for US3

- [ ] T066 [US3] Add high-severity alert generation on break-glass request (FR-024)
- [ ] T067 [US3] Add post-incident report requirement tracking

**Checkpoint**: Emergency access works with dual control, alerts, and audit trail

---

## Phase 6: User Story 4 - Billing Admin Manages Subscriptions (Priority: P2)

**Goal**: Billing Admin can view/modify customer subscriptions and process refunds

**Entities**: Uses main backend subscription tables via service call
**Endpoints**: Proxied via admin service to main backend
**Requirements**: FR-026 to FR-035

### Proxy Service for US4

- [ ] T068 [US4] Create `admin-service/src/services/billing_proxy_service.py` - Proxy to main backend billing APIs
- [ ] T069 [US4] Create `admin-service/src/schemas/billing.py` - Subscription, refund request schemas

### API Endpoints for US4

- [ ] T070 [US4] Create `admin-service/src/api/v1/billing.py` - GET /subscriptions, POST /refunds, PUT /plan-changes

### Audit Integration for US4

- [ ] T071 [US4] Add billing-specific audit logging with before/after states
- [ ] T072 [US4] Implement refund approval workflow for amounts > threshold

**Checkpoint**: Billing Admin can manage subscriptions with approval workflows

---

## Phase 7: User Story 5 - Platform Admin Views System Health (Priority: P2)

**Goal**: Platform Admin can view system metrics, health status, and active sessions

**Endpoints**: /admin/v1/health/*, /admin/v1/metrics/*
**Requirements**: FR-036 to FR-040

### Health Monitoring for US5

- [ ] T073 [P] [US5] Create `admin-service/src/services/health_service.py` - Health check aggregation
- [ ] T074 [P] [US5] Create `admin-service/src/services/metrics_service.py` - Prometheus metrics integration

### API Endpoints for US5

- [ ] T075 [US5] Create `admin-service/src/api/v1/health.py` - GET /health, /health/detailed
- [ ] T076 [US5] Create `admin-service/src/api/v1/metrics.py` - GET /metrics/system, /metrics/usage

**Checkpoint**: Platform Admin can monitor system health

---

## Phase 8: User Story 6 - Content Moderator Reviews Flagged Content (Priority: P2)

**Goal**: Content Moderator can review and action flagged content

**Entities**: admin_moderation_queue
**Endpoints**: /admin/v1/moderation/*
**Requirements**: FR-041 to FR-050

### Database for US6

- [ ] T077 [US6] Create migration for `admin_moderation_queue` table

### Models for US6

- [ ] T078 [US6] Create `admin-service/src/db/models/moderation.py` - AdminModerationQueue ORM model

### Schemas for US6

- [ ] T079 [US6] Create `admin-service/src/schemas/moderation.py` - QueueItem, ModerationAction schemas

### Services for US6

- [ ] T080 [US6] Create `admin-service/src/services/moderation_service.py` - Queue management, action processing

### API Endpoints for US6

- [ ] T081 [US6] Create `admin-service/src/api/v1/moderation.py` - All endpoints per contracts/moderation.yaml

**Checkpoint**: Content Moderator can manage flagged content queue

---

## Phase 9: User Story 7 - Auditor Generates Compliance Reports (Priority: P2)

**Goal**: Auditor can query audit logs and generate compliance reports

**Endpoints**: /admin/v1/audit/*
**Requirements**: FR-051 to FR-060

### Services for US7

- [ ] T082 [US7] Enhance `admin-service/src/services/audit_service.py` - Add query, filter, export capabilities

### API Endpoints for US7

- [ ] T083 [US7] Create `admin-service/src/api/v1/audit_logs.py` - All endpoints per contracts/audit-logs.yaml
- [ ] T084 [US7] Implement audit log export to CSV/JSON (FR-055)

### Compliance Reports for US7

- [ ] T085 [US7] Create `admin-service/src/services/compliance_report_service.py` - Report generation
- [ ] T086 [US7] Implement pre-built compliance report templates (SOC 2, GDPR)

**Checkpoint**: Auditor can query logs and generate compliance reports

---

## Phase 10: User Story 8 - Product Admin Manages Feature Flags (Priority: P3)

**Goal**: Product Admin can create and manage feature flags with targeting rules

**Entities**: admin_feature_flags, admin_feature_flag_rules
**Endpoints**: /admin/v1/feature-flags/*
**Requirements**: FR-061 to FR-070

### Database for US8

- [ ] T087 [P] [US8] Create migration for `admin_feature_flags` table
- [ ] T088 [P] [US8] Create migration for `admin_feature_flag_rules` table

### Models for US8

- [ ] T089 [P] [US8] Create `admin-service/src/db/models/feature_flag.py` - AdminFeatureFlag, AdminFeatureFlagRule ORM models

### Schemas for US8

- [ ] T090 [US8] Create `admin-service/src/schemas/feature_flag.py` - FlagRequest, FlagResponse, RuleRequest schemas

### Services for US8

- [ ] T091 [US8] Create `admin-service/src/services/feature_flag_service.py` - CRUD, rule evaluation with Redis caching

### API Endpoints for US8

- [ ] T092 [US8] Create `admin-service/src/api/v1/feature_flags.py` - All endpoints per contracts/feature-flags.yaml

### Advanced Features for US8

- [ ] T093 [US8] Implement percentage rollout with consistent hashing
- [ ] T094 [US8] Implement scheduled flag activation/deactivation
- [ ] T095 [US8] Implement optimistic locking for concurrent edits (EC-011)

**Checkpoint**: Feature flags with targeting and rollout controls

---

## Phase 11: User Story 9 - Security Admin Reviews Audit Logs (Priority: P3)

**Goal**: Security Admin can analyze security events and configure anomaly alerts

**Requirements**: FR-071 to FR-080

### Services for US9

- [ ] T096 [US9] Create `admin-service/src/services/anomaly_service.py` - Anomaly detection with configurable rules
- [ ] T097 [US9] Create `admin-service/src/services/security_dashboard_service.py` - Security metrics aggregation

### API Endpoints for US9

- [ ] T098 [US9] Create `admin-service/src/api/v1/security.py` - GET /security/events, /security/anomalies

### Workers for US9

- [ ] T099 [US9] Create `admin-service/src/workers/anomaly_detector.py` - Background anomaly detection

**Checkpoint**: Security Admin can analyze logs and configure alerts

---

## Phase 12: User Story 10 - Observability Admin Accesses Logs (Priority: P3)

**Goal**: Observability Admin can view application logs, metrics, and traces

**Requirements**: FR-081 to FR-085

### Services for US10

- [ ] T100 [US10] Create `admin-service/src/services/log_aggregation_service.py` - Log query and filtering
- [ ] T101 [US10] Create `admin-service/src/services/trace_service.py` - Distributed tracing integration

### API Endpoints for US10

- [ ] T102 [US10] Create `admin-service/src/api/v1/observability.py` - GET /logs, /traces, /metrics

**Checkpoint**: Observability Admin has visibility into system internals

---

## Phase 13: User Story 11 - Admin Manages Churn Prevention (Priority: P3)

**Goal**: Admin can identify at-risk accounts and apply retention offers

**Requirements**: FR-088 to FR-090

### Services for US11

- [ ] T103 [US11] Create `admin-service/src/services/churn_prevention_service.py` - Risk scoring, retention offers

### API Endpoints for US11

- [ ] T104 [US11] Create `admin-service/src/api/v1/churn.py` - GET /at-risk, POST /retention-offers

**Checkpoint**: Churn prevention tooling available

---

## Phase 14: User Story 12-16 - Enhancement Stories

### US12: Admin Password Reset (FR-091)

- [ ] T105 [US12] Add /me/password endpoint for password change
- [ ] T106 [US12] Implement secure password reset flow with MFA verification

### US13: Admin MFA Recovery (FR-092)

- [ ] T107 [US13] Implement MFA device rotation flow
- [ ] T108 [US13] Implement backup code regeneration

### US14: Concurrent Edit Conflict Resolution (EC-011)

- [ ] T109 [US14] Add version field and optimistic locking to all editable entities
- [ ] T110 [US14] Return 409 Conflict with current state on version mismatch

### US15: Vacation Coverage Delegation (FR-095-097)

- [ ] T111 [US15] Create migration for `admin_delegations` table
- [ ] T112 [US15] Create `admin-service/src/db/models/delegation.py` - AdminDelegation ORM model
- [ ] T113 [US15] Create `admin-service/src/services/delegation_service.py` - Create, revoke, validate delegations
- [ ] T114 [US15] Create `admin-service/src/api/v1/delegation.py` - All endpoints per contracts/delegation.yaml

### US16: DSAR Automation (FR-098-101)

- [ ] T115 [US16] Create migration for `admin_dsar_requests` table
- [ ] T116 [US16] Create `admin-service/src/db/models/dsar.py` - AdminDsarRequest ORM model
- [ ] T117 [US16] Create `admin-service/src/services/dsar_service.py` - Request intake, processing, export
- [ ] T118 [US16] Create `admin-service/src/api/v1/dsar.py` - All endpoints per contracts/dsar.yaml
- [ ] T119 [US16] Create `admin-service/src/workers/dsar_processor.py` - Background DSAR processing

**Checkpoint**: All enhancement features implemented

---

## Phase 15: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

### Documentation

- [ ] T120 [P] Update `admin-service/README.md` with setup and API documentation
- [ ] T121 [P] Generate OpenAPI spec from FastAPI app

### Performance & Caching

- [ ] T122 Implement Redis caching for permission lookups
- [ ] T123 Implement query optimization for audit log searches
- [ ] T124 Add database connection pooling configuration

### Notification Infrastructure

- [ ] T125 [P] Create `admin-service/src/db/models/notification_preferences.py` - AdminNotificationPreferences ORM model
- [ ] T126 [P] Create migration for `admin_notification_preferences` table
- [ ] T127 Implement multi-channel notifications (email, SMS, Slack) in alert_service.py

### Configuration Management

- [ ] T128 Create migration for `admin_platform_config` table
- [ ] T129 Create `admin-service/src/db/models/config.py` - AdminPlatformConfig ORM model with encryption
- [ ] T130 Create `admin-service/src/api/v1/config.py` - Platform configuration endpoints

### Training & Onboarding

- [ ] T131 Create migration for `admin_training_completions` table
- [ ] T132 Create `admin-service/src/services/training_service.py` - Training gate checks (FR-102)

### Bulk Operations

- [ ] T133 Create migration for `admin_bulk_operations` table
- [ ] T134 Create `admin-service/src/services/bulk_operation_service.py` - Async bulk processing (EC-014)

### Audit Log Archival

- [ ] T135 Create `admin-service/src/workers/audit_archiver.py` - Archive old partitions (FR-105)

### Security Hardening

- [ ] T136 Add rate limiting to all endpoints (NFR-003)
- [ ] T137 Implement CORS configuration for admin dashboard origin
- [ ] T138 Add request ID propagation for distributed tracing
- [ ] T139 Run quickstart.md validation (manual test of full flow)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1-US3 (P1) should be completed first as MVP
  - US4-US7 (P2) can proceed in parallel after P1 complete
  - US8-US11 (P3) can proceed in parallel after P2 complete
  - US12-US16 can be done incrementally
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

| Story | Depends On | Can Run Parallel With |
|-------|-----------|----------------------|
| US1 (Admin Management) | Foundation | None (first) |
| US2 (Support Sessions) | US1 (auth, audit) | US3 |
| US3 (Break-Glass) | US1 (auth, audit) | US2 |
| US4 (Billing) | US1 (auth) | US5, US6, US7 |
| US5 (Health) | US1 (auth) | US4, US6, US7 |
| US6 (Moderation) | US1 (auth) | US4, US5, US7 |
| US7 (Audit Reports) | US1 (audit infra) | US4, US5, US6 |
| US8 (Feature Flags) | US1 (auth) | US9, US10, US11 |
| US9 (Security) | US7 (audit) | US8, US10, US11 |
| US10 (Observability) | US1 (auth) | US8, US9, US11 |
| US11 (Churn) | US1 (auth) | US8, US9, US10 |
| US12-16 (Enhancements) | Respective base stories | Each other |

### Within Each User Story

- Models before schemas
- Schemas before services
- Services before API endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, US1 begins (required first)
- After US1 complete: US2 and US3 can run in parallel
- After US1-3 complete: US4, US5, US6, US7 can run in parallel
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel

---

## Parallel Example: Phase 2 Foundation

```bash
# Launch all parallel foundation tasks together:
Task: "Create initial migration for admin_platform_admins table"
Task: "Create initial migration for admin_sessions table"
Task: "Create initial migration for admin_audit_logs table with monthly partitioning"
Task: "Create initial migration for admin_role_permissions table"
```

## Parallel Example: User Story 1 Models

```bash
# Launch all US1 models together:
Task: "Create admin-service/src/db/models/admin.py - AdminPlatformAdmin ORM model"
Task: "Create admin-service/src/db/models/invite.py - AdminInvite ORM model"
Task: "Create admin-service/src/db/models/permission.py - AdminPlatformPermission, AdminRolePermission ORM models"
Task: "Create admin-service/src/db/models/session.py - AdminSession ORM model"
```

---

## Implementation Strategy

### MVP First (US1-US3 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Admin Management)
4. Complete Phase 4: User Story 2 (Support Sessions) - parallel with US3
5. Complete Phase 5: User Story 3 (Break-Glass) - parallel with US2
6. **STOP and VALIDATE**: Test full admin lifecycle, support access, break-glass
7. Deploy/demo MVP

### Incremental Delivery

1. Setup + Foundational -> Foundation ready
2. Add US1 -> Test independently -> Admin management works
3. Add US2 + US3 -> Test independently -> Support and emergency access work (MVP!)
4. Add US4-US7 -> Test independently -> Full P2 features
5. Add US8-US11 -> Test independently -> All P3 features
6. Add US12-US16 -> Enhancement stories
7. Polish phase for production hardening

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (required first)
3. Once US1 is done:
   - Developer A: User Story 2
   - Developer B: User Story 3
4. Once US1-3 done:
   - Developer A: User Story 4
   - Developer B: User Story 5
   - Developer C: User Story 6
   - Developer D: User Story 7
5. Continue parallel work through remaining stories

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- All audit logging is automatic via middleware (configured in Phase 2)
- Session binding (FR-086) is enforced at middleware level
- Step-up MFA (FR-087) is implemented via dependency injection

## Task Summary

| Phase | Story | Tasks | Priority |
|-------|-------|-------|----------|
| 1 | Setup | T001-T008 | - |
| 2 | Foundation | T009-T027 | - |
| 3 | US1 - Admin Management | T028-T046 | P1 |
| 4 | US2 - Support Sessions | T047-T056 | P1 |
| 5 | US3 - Break-Glass | T057-T067 | P1 |
| 6 | US4 - Billing | T068-T072 | P2 |
| 7 | US5 - Health | T073-T076 | P2 |
| 8 | US6 - Moderation | T077-T081 | P2 |
| 9 | US7 - Audit Reports | T082-T086 | P2 |
| 10 | US8 - Feature Flags | T087-T095 | P3 |
| 11 | US9 - Security | T096-T099 | P3 |
| 12 | US10 - Observability | T100-T102 | P3 |
| 13 | US11 - Churn | T103-T104 | P3 |
| 14 | US12-16 - Enhancements | T105-T119 | P3 |
| 15 | Polish | T120-T139 | - |

**Total Tasks**: 139
**MVP Tasks (Setup + Foundation + P1)**: 67 tasks
