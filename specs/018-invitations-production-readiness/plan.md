# Implementation Plan: Digital Invitations Microservice Production Readiness

**Branch**: `018-invitations-production-readiness` | **Date**: 2026-01-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-invitations-production-readiness/spec.md`

## Summary

This plan addresses all identified production readiness gaps in the Digital Invitations Microservice:

1. **P0 Security Fixes**: HTML escaping in email templates, generic error messages, PII removal from logs
2. **P1 Core Functionality**: Complete RSVP endpoint implementation, analytics database queries, bulk invite integration
3. **P2 Compliance & Observability**: Audit logging, structured JSON logging, correlation IDs, metrics endpoint
4. **P3 Maintainability**: Workspace guard extraction, email provider abstraction, circuit breaker pattern

The implementation follows the existing FastAPI/Python microservice architecture with asyncpg for PostgreSQL and Redis for caching.

## Technical Context

**Language/Version**: Python 3.11 (matching existing microservice)
**Primary Dependencies**: FastAPI 0.115+, asyncpg 0.29+, redis 5.0+, celery 5.3+, sendgrid 6.11+
**Storage**: PostgreSQL 16 (existing), Redis 7 (existing)
**Testing**: pytest + pytest-asyncio (existing)
**Target Platform**: Linux container (Docker)
**Project Type**: Microservice (part of RawDrive platform)
**Performance Goals**:
- RSVP p95 latency < 500ms
- Analytics load < 2 seconds (cached)
- Bulk invite 500 guests < 30 seconds queuing
**Constraints**:
- SOC2/GDPR compliance required
- Zero PII in logs
- Multi-tenant workspace isolation
**Scale/Scope**:
- Target: 10,000 invitations per workspace
- 1,000 guests per invitation
- 100 concurrent RSVP submissions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is a template without specific rules defined. Applying RawDrive's general coding standards from CLAUDE.md:

| Principle | Status | Notes |
|-----------|--------|-------|
| Workspace Isolation | PASS | All endpoints verify workspace_id access |
| Input Validation | PASS | Pydantic schemas enforce validation |
| Security (OWASP) | REQUIRES FIX | XSS, error leakage identified - addressed in this plan |
| Testing (85% services) | PASS | Plan includes comprehensive test updates |
| Multi-tenancy | PASS | Workspace scoping on all queries |
| No Hardcoded Secrets | PASS | All config from environment variables |

**Gate Result**: PASS with remediation (security issues addressed by this implementation)

## Project Structure

### Documentation (this feature)

```text
specs/018-invitations-production-readiness/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── openapi.yaml     # Updated API contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
services/invitations-service/
├── src/
│   ├── api/v1/
│   │   ├── dependencies.py      # MODIFY: Add workspace guard, secure error handling
│   │   ├── guests.py            # MODIFY: Use workspace guard, add audit calls
│   │   ├── rsvp.py              # MODIFY: Implement full RSVP functionality
│   │   └── analytics.py         # MODIFY: Implement database queries
│   ├── cache/
│   │   └── redis_client.py      # MODIFY: Add circuit breaker, fallback
│   ├── middleware/
│   │   ├── rate_limiter.py      # EXISTS: No changes needed
│   │   ├── correlation.py       # NEW: Correlation ID middleware
│   │   └── metrics.py           # NEW: Prometheus metrics middleware
│   ├── services/
│   │   ├── guest_service.py     # MODIFY: Add audit logging
│   │   ├── rsvp_service.py      # NEW: RSVP business logic
│   │   ├── analytics_service.py # NEW: Analytics queries
│   │   ├── audit_service.py     # NEW: Audit logging service
│   │   └── email/
│   │       ├── __init__.py      # NEW: Email provider abstraction
│   │       ├── base.py          # NEW: Abstract email provider
│   │       └── sendgrid.py      # NEW: SendGrid implementation
│   ├── workers/
│   │   ├── celery_app.py        # MODIFY: Add correlation ID propagation
│   │   └── email_worker.py      # MODIFY: Use email provider, add HTML escaping
│   ├── schemas/
│   │   ├── guest.py             # EXISTS: No changes needed
│   │   ├── rsvp.py              # NEW: RSVP schemas
│   │   ├── analytics.py         # MODIFY: Add view tracking schemas
│   │   └── audit.py             # NEW: Audit event schemas
│   ├── logging/
│   │   ├── __init__.py          # NEW: Structured logging setup
│   │   └── formatters.py        # NEW: JSON formatter with PII filtering
│   ├── config.py                # MODIFY: Add metrics, audit config
│   ├── database.py              # EXISTS: No changes needed
│   └── main.py                  # MODIFY: Add correlation, metrics middleware
├── tests/
│   ├── unit/
│   │   ├── test_html_escape.py  # NEW: XSS prevention tests
│   │   ├── test_pii_filter.py   # NEW: Log filtering tests
│   │   ├── test_rsvp_service.py # NEW: RSVP logic tests
│   │   └── test_audit_service.py # NEW: Audit logging tests
│   ├── integration/
│   │   ├── test_rsvp_flow.py    # NEW: End-to-end RSVP tests
│   │   ├── test_analytics.py    # NEW: Analytics query tests
│   │   └── test_bulk_invite.py  # NEW: Bulk operation tests
│   └── security/
│       ├── test_xss.py          # NEW: XSS vulnerability tests
│       └── test_error_leakage.py # NEW: Error message tests
└── requirements.txt             # MODIFY: Add prometheus-client, structlog
```

**Structure Decision**: Extending existing microservice structure. New capabilities added as services/modules following existing patterns. Email provider abstraction uses Strategy pattern with factory.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Email Provider Abstraction | SOC2 requires vendor flexibility; SendGrid outages need fallback | Direct SendGrid calls would require code changes to switch providers |
| Audit Service Layer | SOC2/GDPR compliance requires immutable audit trail | Inline logging would couple audit logic with business code |
| Circuit Breaker | Production resilience for email/cache failures | Try-catch alone doesn't prevent cascade failures or provide recovery |

## Implementation Phases

### Phase 0: Security Fixes (P0) - Critical Path

1. **HTML Escaping in Email Templates**
   - Add `html.escape()` wrapper in email_worker.py
   - Escape: recipient_name, invitation_url, all dynamic content
   - Test: Verify script tags render as text

2. **Secure Error Handling**
   - Modify dependencies.py to return generic auth errors
   - Remove exception details from HTTPException detail field
   - Add internal logging with full details

3. **PII Filtering in Logs**
   - Create structured logger with PII filter
   - Replace all logger calls with filtered logger
   - Test: Verify no emails/names in log output

### Phase 1: Core Functionality (P1)

1. **RSVP Service Implementation**
   - Create rsvp_service.py with business logic
   - Generate secure edit tokens (UUID4 + HMAC)
   - Implement duplicate detection by email/invitation
   - Add database queries for RSVP persistence

2. **Analytics Implementation**
   - Create analytics_service.py with aggregation queries
   - Add view tracking table and insert logic
   - Implement cached statistics with 10-minute TTL
   - Add device detection from User-Agent

3. **Bulk Invite Integration**
   - Modify bulk_invite_guests endpoint to use email worker
   - Batch-fetch guest data before queuing
   - Track individual send status in database
   - Return aggregated results

### Phase 2: Compliance & Observability (P2)

1. **Audit Logging**
   - Create audit_events table (append-only)
   - Create audit_service.py for event recording
   - Add audit calls to all CRUD operations
   - Implement workspace-scoped audit queries

2. **Structured Logging**
   - Add structlog for JSON output
   - Create PII filter processor
   - Configure log levels and output format

3. **Correlation IDs**
   - Create correlation middleware
   - Propagate ID to all log entries
   - Pass to Celery tasks via headers

4. **Metrics Endpoint**
   - Add prometheus-client dependency
   - Create metrics middleware for request counting
   - Expose /metrics endpoint

### Phase 3: Maintainability & Resilience (P3)

1. **Workspace Guard**
   - Extract validation to reusable dependency
   - Replace repeated checks in all endpoints

2. **Email Provider Abstraction**
   - Create EmailProvider base class
   - Implement SendGridProvider
   - Add factory for provider selection

3. **Circuit Breaker**
   - Add circuit breaker wrapper for Redis
   - Add circuit breaker for email service
   - Implement graceful degradation

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| RSVP data loss during migration | High | Use transactions, test with backup data |
| Performance regression from audit logging | Medium | Async audit writes, batch inserts |
| Email provider switch complexity | Low | Abstraction layer isolates changes |
| Log volume increase from structured logging | Medium | Configure log levels, sampling |
