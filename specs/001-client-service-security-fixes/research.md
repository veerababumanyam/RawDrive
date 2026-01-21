# Research: Client Service Security Remediation

**Feature**: 001-client-service-security-fixes
**Date**: 2026-01-21
**Status**: Complete

## Research Tasks

### 1. Rate Limiting Bypass Vulnerability Analysis

**Question**: How do attackers bypass the current rate limiting implementation?

**Research Findings**:

The current implementation in `services/client-service/src/middleware/rate_limiter.py` (lines 136-144) uses a fallback chain that prioritizes spoofable HTTP headers:

```python
client_id = (
    request.headers.get("X-User-ID")           # 1st: Completely spoofable
    or request.headers.get("X-Visitor-ID")     # 2nd: Completely spoofable
    or request.headers.get("X-Forwarded-For")  # 3rd: Spoofable without trusted proxy
    or request.client.host                     # 4th: Only reliable option
)
```

**Attack Vector**: An attacker can rotate the `X-User-ID` header on each request to create unlimited unique rate limit buckets, effectively bypassing all rate limits.

**Decision**: Use JWT-validated `user_id` from `request.state` (set by auth middleware) for authenticated users, and `request.client.host` for anonymous users. Never trust client-supplied headers.

**Rationale**: The JWT token is cryptographically signed and validated by the auth middleware. The `user_id` claim cannot be spoofed. For anonymous requests, Traefik (our reverse proxy) is configured to strip client `X-Forwarded-For` headers, so `request.client.host` represents the actual client IP.

**Alternatives Considered**:
- Use session cookies: Rejected - adds state complexity, cookies can be deleted
- Use fingerprinting: Rejected - privacy concerns, easily circumvented
- API keys: Rejected - increases onboarding friction

---

### 2. Rate Limiter Fail-Open vs Fail-Closed

**Question**: What should happen when Redis is unavailable?

**Research Findings**:

Current behavior (line 189-191):
```python
except Exception:
    return await call_next(request)  # Fail-open: allows all requests
```

**Security Risk**: If an attacker can cause Redis to become unavailable (through resource exhaustion or targeted attack), all rate limiting is bypassed.

**Decision**: Fail-closed with user-friendly 503 response: "Service temporarily unavailable. Please try again shortly."

**Rationale**: Per the spec clarification (line 12), the product decision is to prioritize security over availability. A temporary service disruption is preferable to allowing unlimited requests that could exhaust other resources.

**Alternatives Considered**:
- In-memory fallback: Rejected - doesn't work across multiple instances, inconsistent behavior
- Degraded rate limits: Rejected - complex to implement correctly, still allows some bypass
- Circuit breaker: Partially adopted - add circuit breaker pattern to detect Redis failures faster

---

### 3. JWT Error Message Information Disclosure

**Question**: What information do current error messages reveal?

**Research Findings**:

Current error responses in `services/client-service/src/middleware/auth.py`:

| Error Type | Current Message | Information Disclosed |
|------------|-----------------|----------------------|
| ExpiredSignatureError | "Token has expired" | Token contains expiry, was valid before |
| InvalidTokenError | "Invalid token: {error}" | Specific validation failure reason |
| InvalidAlgorithmError | "Invalid token: algorithm mismatch" | Expected algorithm |
| DecodeError | "Invalid token: malformed payload" | Token structure expectations |

**OWASP A01:2021 Violation**: Detailed error messages help attackers craft valid tokens by revealing validation logic.

**Decision**: All JWT validation failures return identical message: "Invalid authentication token". Detailed errors are logged internally at DEBUG level for troubleshooting.

**Rationale**: Attackers should not be able to distinguish between an expired token, invalid signature, or malformed token. This follows the same pattern used in the backend auth service.

**Alternatives Considered**:
- Return error codes: Rejected - still leaks information about failure type
- Separate user-friendly vs API messages: Rejected - adds complexity, APIs also need protection

---

### 4. Request Timeout Implementation Patterns

**Question**: How should request timeouts be implemented?

**Research Findings**:

Backend implementation in `backend/src/app/middleware/timeout.py` provides a production-ready pattern:

1. Uses `asyncio.wait_for()` to enforce timeout
2. Method-based defaults: 30s read, 60s write
3. Route-specific overrides for expensive operations
4. Proper cleanup via exception handling
5. Prometheus metrics for timeout events

**Key Implementation Details**:
- Use `asyncio.TimeoutError` not `asyncio.wait_for` return value
- Store timeout in `request.state.timeout_seconds` for downstream use
- Add `X-Timeout-Limit` and `X-Timeout-Remaining` response headers
- Record metrics for monitoring and alerting

**Decision**: Port the backend `TimeoutMiddleware` to client-service with minimal modifications.

**Rationale**: The backend implementation is battle-tested and includes all necessary features. Copying the pattern ensures consistency across services.

**Alternatives Considered**:
- Traefik-level timeouts only: Rejected - doesn't provide per-method or per-route control
- Per-request timeout header: Partially adopted - allow clients to request lower timeouts (capped)

---

### 5. RBAC Implementation Strategy

**Question**: How should role-based access control be implemented?

**Research Findings**:

Backend provides two reference implementations:

1. **RBACService** (`backend/src/app/services/rbac_service.py`):
   - Computes effective permissions from all assigned roles
   - Supports wildcard permissions (e.g., `clients:*`)
   - Uses Redis caching for performance

2. **Permission Dependencies** (`backend/src/app/api/dependencies/auth.py`):
   - `require_permissions(*perms)` factory function
   - Extracts workspace_id from path or header
   - Returns 403 with "Insufficient permissions" on denial

**Client-Service Permission Matrix** (from spec):

| Permission | Viewer | Editor | Admin |
|------------|--------|--------|-------|
| clients:read | ✅ | ✅ | ✅ |
| clients:write | ❌ | ✅ | ✅ |
| clients:delete | ❌ | ✅ | ✅ |
| clients:bulk_delete | ❌ | ❌ | ✅ |
| clients:export | ❌ | ❌ | ✅ |
| clients:import | ❌ | ❌ | ✅ |

**Decision**: Create a simplified `rbac.py` module in client-service middleware that:
1. Extracts role and permissions from JWT claims (already present)
2. Provides `require_permission(perm)` dependency factory
3. Logs all permission denials with user identity and requested action

**Rationale**: JWT tokens already contain `role` and `permissions` claims. We can check permissions directly without database queries, keeping p95 latency under 200ms.

**Alternatives Considered**:
- Full RBAC service copy: Rejected - overkill for fixed permission matrix
- Decorator-based: Rejected - dependencies work better with FastAPI's DI system
- Attribute-based access control: Rejected - adds complexity for fixed requirements

---

### 6. Audit Logging Enhancement for SOC2 CC6.3

**Question**: What additional audit logging is needed for compliance?

**Research Findings**:

SOC2 CC6.3 requires:
- Who accessed the data (user identity)
- What data was accessed (entity and fields)
- When access occurred (timestamp)
- From where (IP address, user agent)

Current audit service logs CRUD operations but lacks:
- Field-level access tracking for reads
- PII field identification
- Middleware-level capture for all data access

**PII Fields in Client Entity**:
- `email`, `phone`, `address`, `date_of_birth`
- Contact names and personal details
- Communication preferences

**Decision**: Add `log_pii_access()` method to audit service that:
1. Identifies PII fields in response data
2. Logs field-level access for compliance
3. Uses best-effort logging (never fails operations)

**Rationale**: Field-level logging enables compliance officers to track exactly which PII was accessed during an investigation.

**Alternatives Considered**:
- Log all field access: Rejected - too verbose, performance impact
- Middleware-only logging: Rejected - doesn't capture field-level detail
- Separate compliance database: Rejected - adds infrastructure complexity

---

## Technology Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rate limit identity | JWT user_id + request.client.host | Cryptographically secure, not spoofable |
| Redis failure mode | Fail-closed (503) | Security over availability per product decision |
| Auth error messages | Generic "Invalid authentication token" | Prevents information disclosure |
| Timeout implementation | Port backend TimeoutMiddleware | Battle-tested, consistent patterns |
| RBAC approach | JWT claim-based permissions | Zero database queries, fast response |
| Audit field tracking | PII-only field logging | Compliance without performance impact |

---

## External References

1. OWASP A01:2021 - Broken Access Control: https://owasp.org/Top10/A01_2021-Broken_Access_Control/
2. OWASP A07:2021 - Identification and Authentication Failures: https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/
3. SOC2 CC6.3 - System Operations: Audit Trails
4. RFC 6749 - OAuth 2.0 (JWT Bearer Token usage)
5. Backend reference implementations:
   - `backend/src/app/middleware/timeout.py`
   - `backend/src/app/services/rbac_service.py`
   - `backend/src/app/api/dependencies/auth.py`
