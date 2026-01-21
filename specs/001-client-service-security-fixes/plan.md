# Implementation Plan: Client Service Security Remediation

**Branch**: `001-client-service-security-fixes` | **Date**: 2026-01-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-client-service-security-fixes/spec.md`
**Audit Reference**: `docs/audits/CLIENT_SERVICE_AUDIT_2026-01-21.md`

## Summary

This implementation addresses 5 security and compliance findings (CRITICAL to MEDIUM severity) in the client-service microservice. The fixes include:

1. **Secure Rate Limiting** (CRITICAL): Replace spoofable header-based identification with JWT user_id and trusted IP extraction
2. **Generic Auth Errors** (HIGH): Remove information disclosure from JWT validation error responses
3. **Request Timeouts** (HIGH): Port backend's TimeoutMiddleware pattern with 30s/60s limits
4. **Role-Based Access Control** (HIGH): Implement fixed permission matrix (viewer/editor/admin) using backend's RBAC patterns
5. **Audit Logging Enhancement** (MEDIUM): Add field-level PII access logging for SOC2 CC6.3 compliance

## Technical Context

**Language/Version**: Python 3.11
**Primary Dependencies**: FastAPI 0.115+, Starlette, PyJWT, redis-py, asyncpg
**Storage**: PostgreSQL 16 (via shared database), Redis 7.x (rate limiting)
**Testing**: pytest, pytest-asyncio, httpx (async test client)
**Target Platform**: Linux containers (Docker/Kubernetes)
**Project Type**: Microservice (part of RawDrive platform)
**Performance Goals**: p95 latency < 200ms for typical operations, maintain current throughput
**Constraints**: Zero downtime deployment, backward-compatible API responses
**Scale/Scope**: Part of 13-service microservices architecture, ~80 Python files affected

## Constitution Check

*GATE: Passed - No constitution violations. This is a security remediation with no new complexity.*

**Verification**:
- ✅ No new services or databases introduced
- ✅ Using existing patterns from backend (TimeoutMiddleware, RBACService)
- ✅ No new external dependencies
- ✅ Test-first approach with security test cases
- ✅ Follows existing coding conventions

## Project Structure

### Documentation (this feature)

```text
specs/001-client-service-security-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output - research findings
├── data-model.md        # Phase 1 output - entity definitions
├── quickstart.md        # Phase 1 output - developer guide
├── contracts/           # Phase 1 output - API specifications
│   └── security-responses.yaml  # Error response contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
services/client-service/
├── src/
│   ├── api/v1/                    # API endpoints (RBAC decorators added)
│   │   ├── clients.py             # Add permission checks
│   │   ├── bulk_ops.py            # Add admin-only checks
│   │   ├── gdpr.py                # Add admin-only checks
│   │   └── analytics.py           # Add viewer checks
│   ├── middleware/
│   │   ├── auth.py                # FIX: Generic error messages
│   │   ├── rate_limiter.py        # FIX: Secure identification, fail-closed
│   │   ├── timeout.py             # NEW: Port from backend
│   │   └── rbac.py                # NEW: Permission checking
│   ├── services/
│   │   ├── audit_service.py       # ENHANCE: Field-level PII logging
│   │   └── rbac_service.py        # NEW: Permission service (simplified)
│   └── schemas/
│       └── common.py              # Add error response schemas
└── tests/
    ├── unit/
    │   ├── test_rate_limiter_security.py  # NEW: Rate limit bypass tests
    │   ├── test_auth_error_messages.py    # NEW: Error disclosure tests
    │   └── test_rbac.py                   # NEW: Permission matrix tests
    └── integration/
        └── test_security_integration.py   # NEW: End-to-end security tests
```

**Structure Decision**: Microservice architecture - all changes contained within `services/client-service/` following existing patterns.

## Implementation Summary

### SEC-001: Rate Limiting Security (CRITICAL)

**Current Issue**: Lines 136-144 of `rate_limiter.py` use spoofable `X-User-ID` headers.

**Fix**:
```python
# BEFORE (vulnerable)
client_id = (
    request.headers.get("X-User-ID")  # Spoofable!
    or request.headers.get("X-Visitor-ID")  # Spoofable!
    or request.headers.get("X-Forwarded-For", "").split(",")[0].strip()  # Spoofable!
    or request.client.host
)

# AFTER (secure)
client_id = (
    getattr(request.state, 'user_id', None)  # From validated JWT
    or request.client.host  # Actual connection IP (Traefik strips X-Forwarded-For)
    or "anonymous"
)
```

**Fail-Closed Fix**:
```python
# BEFORE (fail-open - vulnerable)
except Exception:
    return await call_next(request)  # Security bypass!

# AFTER (fail-closed - secure)
except Exception as e:
    logger.error("Redis unavailable for rate limiting", extra={"error": str(e)})
    return JSONResponse(
        status_code=503,
        content={"error": "SERVICE_UNAVAILABLE", "message": "Service temporarily unavailable. Please try again shortly."}
    )
```

### SEC-002: Generic Auth Errors (HIGH)

**Current Issue**: Lines 87-96 of `auth.py` expose validation details.

**Fix**:
```python
# BEFORE (information disclosure)
except jwt.ExpiredSignatureError:
    raise HTTPException(detail="Token has expired")  # Reveals expiry!
except jwt.InvalidTokenError as e:
    raise HTTPException(detail=f"Invalid token: {str(e)}")  # Reveals validation logic!

# AFTER (generic messages)
except jwt.ExpiredSignatureError:
    logger.debug("JWT expired", extra={"token_prefix": token[:10]})
    raise HTTPException(detail="Invalid authentication token")
except jwt.InvalidTokenError as e:
    logger.debug("JWT validation failed", extra={"error": str(e)})
    raise HTTPException(detail="Invalid authentication token")
```

### SEC-003: Role-Based Access Control (HIGH)

**Permission Matrix** (Fixed, consistent with workspace roles):

| Operation | Viewer | Editor | Admin |
|-----------|--------|--------|-------|
| Read clients | ✅ | ✅ | ✅ |
| Create/Update clients | ❌ | ✅ | ✅ |
| Delete client | ❌ | ✅ | ✅ |
| Bulk delete | ❌ | ❌ | ✅ |
| GDPR export | ❌ | ❌ | ✅ |
| Import clients | ❌ | ❌ | ✅ |
| Analytics access | ✅ | ✅ | ✅ |

**Implementation Pattern** (from backend):
```python
from src.middleware.rbac import require_permission

@router.delete("/clients/{client_id}")
async def delete_client(
    client_id: UUID,
    _: None = Depends(require_permission("clients:delete")),
    user: JWTPayload = Depends(get_current_user),
):
    # Permission already verified by dependency
    ...

@router.post("/clients/bulk/delete")
async def bulk_delete_clients(
    _: None = Depends(require_permission("clients:bulk_delete")),  # Admin only
    ...
):
    ...
```

### SEC-004: Request Timeouts (HIGH)

**Port from Backend**: Copy `backend/src/app/middleware/timeout.py` pattern:
- 30s for read operations (GET, HEAD, OPTIONS)
- 60s for write operations (POST, PUT, PATCH, DELETE)
- 504 Gateway Timeout response with proper cleanup

### COM-001: Audit Logging Enhancement (MEDIUM)

**Enhance for Field-Level PII Logging**:
```python
async def log_pii_access(
    workspace_id: str,
    user_id: str,
    entity_type: str,
    entity_id: str,
    fields_accessed: list[str],  # NEW: Track which PII fields
    ip_address: str,
):
    """Log field-level access for SOC2 CC6.3 compliance."""
    # Filter to only PII fields
    pii_fields = [f for f in fields_accessed if f in PII_FIELD_NAMES]
    if pii_fields:
        await audit_service.log_change(
            workspace_id=workspace_id,
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action="access",
            after={"fields_accessed": pii_fields},
            ip_address=ip_address,
        )
```

## Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| Backend TimeoutMiddleware | Reference implementation | ✅ Available |
| Backend RBACService | Reference implementation | ✅ Available |
| JWT validation middleware | Secure user_id extraction | ✅ Exists (needs fix) |
| Redis | Rate limiting state | ✅ Configured |
| audit_logs table | Audit logging | ✅ Exists |

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing clients | Generic error messages are backward-compatible |
| Performance impact from RBAC | Use cached permissions (from JWT claims) |
| Rate limit Redis failures | Fail-closed with user-friendly 503 |
| Timeout cleanup | Use asyncio.wait_for with proper exception handling |

## Success Metrics

- [ ] 100% rate limit bypass attempts blocked (security testing)
- [ ] All JWT errors return identical generic messages (response analysis)
- [ ] 100% requests exceeding timeout are terminated within 5s of limit
- [ ] All protected operations enforce RBAC (integration tests)
- [ ] 100% GDPR operations generate complete audit records
- [ ] p95 latency remains under 200ms
