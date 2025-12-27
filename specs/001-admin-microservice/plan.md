# Implementation Plan: Admin Microservice Architecture

**Branch**: `001-admin-microservice` | **Date**: 2025-12-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-admin-microservice/spec.md`
**Spec Version**: 1.1 (with Enhancements & Additions)

## Summary

Extract platform administration functionality from the RawDrive monolithic backend into a dedicated Admin Microservice. The service will handle admin identity management, support access sessions, break-glass emergency procedures, audit logging, feature flags, content moderation, platform configuration, DSAR automation, and admin lifecycle management. It runs as a separate FastAPI container (port 8001) sharing PostgreSQL and Redis infrastructure with the main backend, communicating via internal REST APIs and Redis pub/sub events.

**Spec v1.1 Additions Incorporated**:
- Session binding with device fingerprint/IP validation (FR-086)
- Privileged action re-confirmation (FR-087)
- Anomaly detection for admin behavior (FR-088)
- Admin self-service (sessions, MFA, notifications)
- Permission delegation with time-boxing (FR-095-097)
- DSAR automation (FR-098-101)
- Admin lifecycle management (onboarding, dormancy, offboarding)
- Enhanced notification preferences (multi-channel)
- Concurrent edit conflict resolution
- Capacity planning and i18n NFRs

## Technical Context

**Language/Version**: Python 3.11+ (matching main backend)
**Primary Dependencies**: FastAPI 0.115+, SQLAlchemy 2.0+, asyncpg 0.29+, Redis 5.0+, Pydantic 2.7+, python-jose (JWT)
**Storage**: PostgreSQL 16 with pgvector (shared with main backend, admin_* table prefix), Redis 7 (sessions, cache, pub/sub)
**Testing**: pytest 8.3+ with pytest-asyncio, hypothesis for property testing
**Target Platform**: Linux server (Docker container), same as main backend
**Project Type**: Web application (admin-service backend + admin console frontend module)
**Performance Goals**: 100 req/s steady state, <300ms p95 latency, 1000 audit events/sec peak ingestion
**Constraints**: <500ms p95 API response, 99.9% availability, zero audit log data loss, WCAG 2.1 AA admin UI, LCP < 1.5s
**Scale/Scope**: 100+ concurrent admin users, 2+ years audit log retention, 16 user workflows, 109 functional requirements

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution template is not yet populated with project-specific principles. Applying standard enterprise microservice principles:

| Principle | Status | Notes |
|-----------|--------|-------|
| Service Independence | PASS | Admin service operates independently with circuit breakers |
| Clear Domain Boundaries | PASS | Admin owns identity, audit, flags; reads user/workspace from main |
| Test-First | WILL COMPLY | Contract tests required before implementation (95% auth, 90% workflows) |
| Security by Design | PASS | MFA, step-up auth, session binding, anomaly detection, audit logging |
| Observability | PASS | Prometheus metrics, distributed tracing, structured logging |
| API Versioning | PASS | `/admin/v1/*` with 6-month deprecation policy |
| Data Ownership | PASS | admin_* table prefix with clear migration strategy |
| Compliance | PASS | SOC 2, GDPR/CCPA DSAR automation, 7-year retention |

**Gate Status**: PASSED - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/001-admin-microservice/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI specs)
│   ├── admin-identity.yaml
│   ├── admin-self-service.yaml
│   ├── support-access.yaml
│   ├── audit-logs.yaml
│   ├── feature-flags.yaml
│   ├── moderation.yaml
│   ├── delegation.yaml
│   └── dsar.yaml
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Admin Microservice (new service)
admin-service/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── identity.py          # Admin identity & auth (FR-001-005)
│   │   │       ├── roles.py             # Role management (FR-006-010)
│   │   │       ├── self_service.py      # Admin self-service (FR-091-094)
│   │   │       ├── support_access.py    # Support sessions (FR-011-015)
│   │   │       ├── break_glass.py       # Emergency access (FR-064-067)
│   │   │       ├── delegation.py        # Permission delegation (FR-095-097)
│   │   │       ├── audit.py             # Audit log queries (FR-045-049)
│   │   │       ├── feature_flags.py     # Feature flag management (FR-050-054)
│   │   │       ├── moderation.py        # Content moderation (FR-040-044)
│   │   │       ├── dsar.py              # DSAR automation (FR-098-101)
│   │   │       ├── config.py            # Platform config (FR-055-060)
│   │   │       ├── analytics.py         # Admin analytics (FR-035-039)
│   │   │       ├── lifecycle.py         # Admin lifecycle (FR-102-105)
│   │   │       ├── notifications.py     # Notification prefs (FR-106-109)
│   │   │       └── health.py            # Health endpoints
│   │   ├── core/
│   │   │   ├── auth.py                  # Admin JWT validation
│   │   │   ├── permissions.py           # Permission checking
│   │   │   ├── session_binding.py       # Device/IP binding (FR-086)
│   │   │   ├── step_up.py               # Privileged action confirmation (FR-087)
│   │   │   ├── anomaly.py               # Behavior anomaly detection (FR-088)
│   │   │   └── events.py                # Redis pub/sub
│   │   ├── services/
│   │   │   ├── admin_service.py         # Admin identity ops
│   │   │   ├── support_service.py       # Support sessions
│   │   │   ├── audit_service.py         # Audit logging (PostgreSQL + Loki)
│   │   │   ├── flag_service.py          # Feature flags
│   │   │   ├── dsar_service.py          # DSAR processing
│   │   │   ├── delegation_service.py    # Permission delegation
│   │   │   ├── lifecycle_service.py     # Onboarding/offboarding
│   │   │   ├── notification_service.py  # Multi-channel notifications
│   │   │   └── backend_client.py        # Main backend API client
│   │   ├── db/
│   │   │   ├── postgres.py              # DB connection
│   │   │   └── redis.py                 # Redis connection
│   │   └── main.py                      # FastAPI app
│   └── migrations/
│       └── versions/                    # Alembic migrations (admin_* tables)
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── security/                        # OWASP Top 10 tests
│   └── load/                            # Performance tests
├── Dockerfile
├── pyproject.toml
└── alembic.ini

# Main Backend Changes (modifications to existing)
backend/src/app/
├── api/v1/
│   └── admin.py                         # Deprecate, proxy to admin-service
├── services/
│   └── admin_event_publisher.py         # NEW: Publish events to admin service
└── middleware/
    └── audit_middleware.py              # NEW: Emit audit events

# Admin Console Frontend (new module in existing frontend)
frontend/src/admin/
├── components/
│   ├── layout/
│   │   ├── AdminLayout.tsx
│   │   └── AdminSidebar.tsx
│   ├── identity/
│   │   ├── AdminList.tsx
│   │   ├── InviteAdmin.tsx
│   │   └── SelfServicePanel.tsx         # FR-091-094
│   ├── support/
│   │   ├── SupportSessionList.tsx
│   │   └── StartSession.tsx
│   ├── delegation/
│   │   ├── DelegationManager.tsx        # FR-095-097
│   │   └── DelegationList.tsx
│   ├── audit/
│   │   └── AuditLogViewer.tsx
│   ├── flags/
│   │   ├── FeatureFlagEditor.tsx
│   │   └── ConflictResolver.tsx         # US-014
│   ├── moderation/
│   │   └── ModerationQueue.tsx
│   ├── dsar/
│   │   ├── DSARDashboard.tsx            # FR-098-101
│   │   └── DSARRequestList.tsx
│   └── notifications/
│       └── NotificationPreferences.tsx  # FR-106-109
├── pages/
│   ├── AdminDashboard.tsx
│   ├── AdminIdentityPage.tsx
│   ├── SelfServicePage.tsx
│   ├── SupportAccessPage.tsx
│   ├── DelegationPage.tsx
│   ├── AuditLogPage.tsx
│   ├── FeatureFlagsPage.tsx
│   ├── ModerationPage.tsx
│   ├── DSARPage.tsx
│   └── NotificationsPage.tsx
├── services/
│   └── adminApiService.ts
├── hooks/
│   ├── useAdminAuth.ts
│   └── usePresence.ts                   # Real-time presence (US-014)
└── routes.tsx

# Infrastructure (additions)
infrastructure/docker/
└── docker-compose.yml                   # Add admin-service container
```

**Structure Decision**: Web application pattern with dedicated admin-service backend and admin console frontend module. Admin service is a sibling to the main backend, sharing infrastructure but maintaining independent deployability.

## Complexity Tracking

> No constitution violations require justification - design follows standard microservice patterns.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Separate service | Yes | Security isolation, independent scaling, clear domain boundary |
| Shared database | Yes | Simplifies data consistency, reduces operational overhead |
| Admin console in frontend monorepo | Yes | Shared design system, simpler deployment, existing build pipeline |
| Redis pub/sub over Kafka | Yes | Existing infrastructure, sufficient for event volume, lower complexity |
| PostgreSQL for audit logs + Loki | Yes | Queryable + scalable log aggregation (existing pattern) |

---

## Phase 0: Research

**Artifacts to generate**: `research.md`

### Research Topics

1. **TOTP MFA Integration** - Verify speakeasy library usage patterns for admin MFA setup flow
2. **Session Binding** - Device fingerprinting + IP range validation patterns (FR-086)
3. **Break-Glass Dual Control** - Research patterns for two-person authorization in emergency access
4. **Audit Log Partitioning** - PostgreSQL table partitioning strategies for time-series audit data
5. **Feature Flag SDK** - Patterns for consuming flags in main backend and AI service with caching
6. **Service-to-Service Auth** - JWT service tokens vs mTLS for internal API calls
7. **Circuit Breaker Pattern** - FastAPI implementation for resilient main backend calls (existing pattern)
8. **Admin Session Management** - Redis session patterns with shorter TTL (4 hours max)
9. **Bulk Operation Safety** - Rate limiting and batch processing patterns for mass admin actions
10. **Anomaly Detection** - Admin behavior monitoring patterns (FR-088)
11. **DSAR Automation** - GDPR/CCPA request processing patterns (FR-098-101)
12. **Real-time Presence** - WebSocket patterns for concurrent edit detection (US-014)
13. **Permission Delegation** - Time-boxed delegation patterns with audit trail (FR-095-097)

---

## Phase 1: Design

**Artifacts to generate**: `data-model.md`, `contracts/`, `quickstart.md`

### Data Model Entities (from spec v1.1)

| Entity | New/Migrate | Description |
|--------|-------------|-------------|
| admin_platform_admins | New | Platform admin identity linked to user |
| admin_invites | New | Pending admin invitations |
| admin_platform_permissions | New | Canonical permission list |
| admin_role_permissions | New | Role-to-permission mapping |
| admin_sessions | New | Active admin sessions with device binding |
| admin_support_sessions | Migrate | Time-boxed workspace access |
| admin_break_glass_sessions | New | Emergency access records |
| admin_delegations | New | Permission delegation records (FR-095-097) |
| admin_audit_logs | New | Immutable action log (partitioned) |
| admin_feature_flags | New | Feature toggle configuration |
| admin_feature_flag_rules | New | Targeting rules |
| admin_platform_config | New | Encrypted platform settings |
| admin_moderation_queue | New | Flagged content queue |
| admin_moderation_actions | New | Moderation action history |
| admin_churn_risk_profiles | New | At-risk user tracking |
| admin_retention_interventions | New | Retention action log |
| admin_bulk_operations | New | Bulk operation tracking (EC-014) |
| admin_dsar_requests | New | DSAR request tracking (FR-098-101) |
| admin_notification_preferences | New | Per-admin notification settings (FR-106-109) |
| admin_training_completions | New | Training gate tracking (FR-102) |

### API Contract Groups

| Contract | Endpoints | Priority | New in v1.1 |
|----------|-----------|----------|-------------|
| Admin Identity | POST /invites, GET /admins, PUT /admins/{id}/roles | P1 | |
| Admin Self-Service | GET/PUT /me/sessions, POST /me/mfa/rotate, GET /me/audit | P1 | Yes |
| Support Access | POST /sessions, GET /sessions, DELETE /sessions/{id} | P1 | |
| Break-Glass | POST /break-glass, GET /break-glass/{id}, POST /break-glass/{id}/report | P1 | |
| Delegation | POST /delegations, GET /delegations, DELETE /delegations/{id} | P2 | Yes |
| Audit Logs | GET /audit-logs, GET /audit-logs/export | P1 | |
| Feature Flags | CRUD /flags, POST /flags/{id}/evaluate | P3 | |
| Moderation | GET /queue, PUT /queue/{id}/action | P2 | |
| DSAR | POST /dsar, GET /dsar, GET /dsar/{id}/export | P3 | Yes |
| Notifications | GET/PUT /notifications/preferences | P2 | Yes |
| Lifecycle | POST /onboarding/complete, GET /dormant-admins | P2 | Yes |
| Analytics | GET /metrics/{type} | P2 | |
| Health | GET /health, /ready, /live | P1 | |

### Event Contracts (from spec v1.1)

| Event | Channel | Payload |
|-------|---------|---------|
| `admin.login` | `admin:events` | `{ admin_id, ip, timestamp, success }` |
| `admin.permission_change` | `admin:events` | `{ admin_id, target_admin_id, permissions_added, permissions_removed }` |
| `admin.support_session_start` | `admin:events` | `{ admin_id, workspace_id, reason, expires_at }` |
| `admin.support_session_end` | `admin:events` | `{ session_id, admin_id, workspace_id, duration_seconds }` |
| `admin.feature_flag_change` | `admin:events` | `{ flag_key, old_value, new_value, changed_by, rollout_percentage }` |
| `admin.break_glass_activated` | `admin:alerts` | `{ admin_id, approver_id, reason, expires_at }` |
| `admin.anomaly_detected` | `admin:alerts` | `{ admin_id, anomaly_type, details, severity }` |
| `admin.bulk_operation_complete` | `admin:events` | `{ operation_id, type, affected_count, status, errors }` |
| `admin.delegation_created` | `admin:events` | `{ delegation_id, delegator_id, delegate_id, permissions, expires_at }` |
| `admin.dsar_submitted` | `admin:events` | `{ dsar_id, subject_email, request_type, sla_deadline }` |

### Caching Strategy (from spec v1.1)

| Data Type | Cache Layer | TTL | Invalidation |
|-----------|-------------|-----|--------------|
| Admin permissions | Redis | 5 min | On permission change event |
| Feature flags | Redis + Local | 30 sec | On flag change event |
| System configs | Redis | 5 min | On config change event |
| Workspace metadata | Redis | 1 min | On workspace update |
| Dashboard metrics | Redis | 1 min | Time-based refresh |

### Integration Points

| From | To | Method | Auth |
|------|----|----|------|
| Admin Console | Admin Service | HTTPS REST | JWT with admin claims |
| Admin Console | Admin Service | WebSocket | JWT (presence/conflict detection) |
| Admin Service | Main Backend | Internal REST | Service token (signed) |
| Main Backend | Admin Service | Redis pub/sub | Event channel auth |
| Admin Service | PostgreSQL | asyncpg | Connection pool |
| Admin Service | Redis | redis-py | Connection string |
| Admin Service | Grafana/Loki | REST | Service account |
| Admin Service | Notification Providers | HTTPS | API keys (email, SMS, Slack) |

---

## Implementation Phases (Enhanced from spec v1.1)

| Phase | Weeks | Focus | Key Deliverables |
|-------|-------|-------|------------------|
| 1 | 1-4 | Core Foundation | Admin identity, MFA, roles, audit logging, session binding, self-service sessions/MFA |
| 2 | 5-8 | Support & Lifecycle | Support sessions, break-glass, delegation, lifecycle management, notification prefs |
| 3 | 9-12 | Compliance & Intelligence | DSAR automation, anomaly detection, escalation paths, capacity alerts |
| 4 | 13-16 | Platform Features | Feature flags, moderation, billing, AI usage, impersonation logging |
| 5 | 17-20 | Polish & Compliance | WCAG 2.1 AA, i18n, SOC 2 reports, performance tuning, runbooks |

### Testing Strategy Per Phase (from spec v1.1)

| Phase | Test Focus | Coverage Target |
|-------|------------|-----------------|
| 1 | Auth flows, RBAC enforcement, session security | 95% |
| 2 | Permission delegation, lifecycle workflows, credential rotation | 90% |
| 3 | Feature flag rollouts, anomaly detection, DSAR workflows | 90% |
| 4 | Billing operations, compliance reports, analytics accuracy | 85% |
| 5 | Dashboard performance, observability integration, end-to-end | 80% |

---

## Migration Strategy Summary

### Admin Account Migration
1. Export existing admin accounts with current permissions
2. Map legacy roles to new RBAC model
3. Generate temporary passwords, force reset on first login
4. Notify admins of migration with new login procedures
5. Maintain dual-access for 2 weeks during transition

### Feature Flag State Migration
1. Export all existing feature toggles from current system
2. Map to new feature flag schema with default rules
3. Validate flag states match across systems
4. Enable new system in read-only mode for comparison
5. Cut over with rollback plan

### Rollback Data Handling
- Audit logs: Keep in new system (append-only, no rollback needed)
- Admin accounts: Restore from backup, disable accounts created post-migration
- Feature flags: Revert to source system, ignore new flags
- System configs: Restore from versioned backup

**Rollback**: Feature flag `admin_service_enabled` controls routing, 5-minute rollback capability

---

## Documentation Deliverables (from spec v1.1)

| Deliverable | Phase | Owner |
|-------------|-------|-------|
| Admin API Reference (OpenAPI 3.1) | 1 | Backend |
| RBAC Configuration Guide | 1 | Backend |
| Admin Onboarding Runbook | 2 | DevOps |
| Incident Response Playbook | 2 | Security |
| Feature Flag Best Practices | 3 | Product |
| DSAR Processing Guide | 3 | Compliance |
| Break-Glass Procedure | 2 | Security |
| Dashboard User Guide | 5 | Product |
| Audit Log Query Guide | 4 | Compliance |
| Admin Training Curriculum | 2 | HR/Security |

---

## Success Criteria (from spec v1.1)

| ID | Criteria | Measurement |
|----|----------|-------------|
| SC-001 | Admin tasks complete in < 30 seconds | P95 latency |
| SC-016 | Admin MTTR for support actions < 4 hours | Session start to resolution |
| SC-017 | Feature flag rollback < 30 seconds | Trigger to propagation |
| SC-018 | Audit log query < 2 seconds for 90-day range | P95 latency |
| SC-019 | Admin dashboard LCP < 1.5 seconds | Core Web Vitals |
| SC-020 | Zero PII exposure in admin logs | Automated CI/CD scanning |

---

## Next Steps

1. Generate `research.md` with findings for each research topic
2. Generate `data-model.md` with complete entity definitions
3. Generate `contracts/` with OpenAPI specifications
4. Generate `quickstart.md` with local development setup
5. Run `/speckit.tasks` to create implementation task list
