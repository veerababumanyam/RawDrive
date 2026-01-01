# Quickstart: Digital Invitations Production Readiness

**Feature Branch**: `018-invitations-production-readiness`
**Created**: 2026-01-01

## Overview

This guide provides quick access to implementation details for the Digital Invitations Production Readiness feature. Use this as a reference during implementation.

---

## Prerequisites

1. Branch `018-invitations-production-readiness` checked out
2. Docker services running (`npm run docker:dev:up`)
3. Backend dependencies installed (`cd services/invitations-service && pip install -r requirements.txt`)

---

## Key Implementation Files

### Phase 0: Security Hardening

| Task | File | Notes |
|------|------|-------|
| XSS Prevention | `src/workers/email_worker.py` | Replace f-string interpolation with `html.escape()` |
| Token Error Handling | `src/api/v1/dependencies.py` | Return generic "Authentication failed" message |
| PII Filtering | `src/core/logging.py` (new) | Add structlog processor for log filtering |

### Phase 1: Core Functionality

| Task | File | Notes |
|------|------|-------|
| RSVP Submit | `src/api/v1/rsvp.py` | Implement actual database operations |
| RSVP Update | `src/api/v1/rsvp.py` | Add edit token verification |
| View Tracking | `src/services/view_service.py` (new) | Create service for tracking views |
| Analytics Queries | `src/api/v1/analytics.py` | Replace placeholder zeros with real queries |

### Phase 2: Compliance

| Task | File | Notes |
|------|------|-------|
| Audit Service | `src/services/audit_service.py` (new) | Append-only audit logging |
| Audit API | `src/api/v1/audit.py` (new) | Query endpoints for compliance |
| Prometheus Metrics | `src/core/metrics.py` (new) | prometheus-client integration |

### Phase 3: Maintainability

| Task | File | Notes |
|------|------|-------|
| Email Provider ABC | `src/email/providers/base.py` (new) | Abstract base class |
| SendGrid Provider | `src/email/providers/sendgrid.py` (new) | Primary provider |
| Fallback Provider | `src/email/providers/smtp.py` (new) | Fallback SMTP |
| Circuit Breaker | `src/core/circuit_breaker.py` (new) | State machine pattern |

---

## Database Migrations

Run in order:

```bash
cd services/invitations-service

# 1. Add RSVP edit tokens
alembic upgrade 0074

# 2. Create invitation_views table
alembic upgrade 0075

# 3. Create audit_events table
alembic upgrade 0076

# 4. Create email_send_log table
alembic upgrade 0077
```

Or all at once:

```bash
alembic upgrade head
```

---

## Code Patterns

### XSS Prevention (use everywhere in email templates)

```python
import html
from urllib.parse import quote

def safe_email_content(name: str, url: str) -> tuple[str, str]:
    """Escape user content for safe HTML email insertion."""
    safe_name = html.escape(name, quote=True)
    safe_url = quote(url, safe=':/?=&')
    return safe_name, safe_url

# Usage in email template
template = f"""
<p>Hello {html.escape(guest_name)}!</p>
<a href="{quote(rsvp_url, safe=':/?=&')}">RSVP Now</a>
"""
```

### Generic Error Responses

```python
# In dependencies.py
async def get_current_user(...) -> CurrentUser:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        # ... validation
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired", extra={"correlation_id": correlation_id})
        raise HTTPException(status_code=401, detail="Authentication failed")
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid token", extra={"error": str(e), "correlation_id": correlation_id})
        raise HTTPException(status_code=401, detail="Authentication failed")
    except KeyError as e:
        logger.warning("Missing claim", extra={"claim": str(e), "correlation_id": correlation_id})
        raise HTTPException(status_code=401, detail="Authentication failed")
```

### Edit Token Generation

```python
import hmac
import hashlib
from uuid import uuid4
from datetime import datetime, timedelta
from src.config import settings

def generate_edit_token(guest_id: str, invitation_id: str) -> tuple[str, datetime]:
    """Generate a secure, tamper-proof edit token."""
    token_id = str(uuid4())
    message = f"{token_id}:{guest_id}:{invitation_id}"
    signature = hmac.new(
        settings.JWT_SECRET.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()[:16]

    token = f"{token_id}:{signature}"
    expires_at = datetime.utcnow() + timedelta(days=30)

    return token, expires_at

def verify_edit_token(token: str, guest_id: str, invitation_id: str) -> bool:
    """Verify edit token authenticity."""
    try:
        token_id, provided_sig = token.split(":")
        message = f"{token_id}:{guest_id}:{invitation_id}"
        expected_sig = hmac.new(
            settings.JWT_SECRET.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()[:16]
        return hmac.compare_digest(provided_sig, expected_sig)
    except (ValueError, AttributeError):
        return False
```

### PII Filtering in Logs

```python
import re
import structlog

PII_PATTERNS = [
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', re.I), '[EMAIL REDACTED]'),
    (re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'), '[PHONE REDACTED]'),
]

SENSITIVE_KEYS = {'email', 'phone', 'name', 'guest_name', 'dietary_restrictions'}

def filter_pii(logger, method_name, event_dict):
    """Structlog processor to filter PII from log output."""
    for key, value in list(event_dict.items()):
        # Redact known sensitive fields
        if key.lower() in SENSITIVE_KEYS:
            event_dict[key] = '[REDACTED]'
            continue

        # Apply pattern matching to string values
        if isinstance(value, str):
            for pattern, replacement in PII_PATTERNS:
                value = pattern.sub(replacement, value)
            event_dict[key] = value

    return event_dict

# Configure structlog
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        filter_pii,  # Add PII filter
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
)
```

### View Tracking with Fingerprint Hash

```python
import hashlib
from fastapi import Request

def generate_visitor_hash(request: Request) -> str:
    """Generate privacy-preserving visitor fingerprint."""
    # Get client IP (handle proxies)
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else request.client.host

    # Combine with user agent for fingerprint
    user_agent = request.headers.get("User-Agent", "")
    accept_lang = request.headers.get("Accept-Language", "")

    fingerprint = f"{ip}:{user_agent}:{accept_lang}"
    return hashlib.sha256(fingerprint.encode()).hexdigest()

def parse_device_type(user_agent: str) -> str:
    """Detect device type from user agent."""
    ua_lower = user_agent.lower()
    if "mobile" in ua_lower or "android" in ua_lower or "iphone" in ua_lower:
        return "mobile"
    elif "tablet" in ua_lower or "ipad" in ua_lower:
        return "tablet"
    elif user_agent:
        return "desktop"
    return "unknown"
```

### Audit Logging

```python
from uuid import UUID
from datetime import datetime
from typing import Optional
from asyncpg import Connection

class AuditService:
    """Append-only audit logging for compliance."""

    async def log_event(
        self,
        conn: Connection,
        workspace_id: UUID,
        actor_id: UUID,
        action: str,
        resource_type: str,
        resource_id: UUID,
        changes: Optional[dict] = None,
        metadata: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> UUID:
        """Log an audit event. Returns event_id."""
        result = await conn.fetchrow(
            """
            INSERT INTO audit_events
                (workspace_id, actor_id, action, resource_type, resource_id,
                 changes, metadata, ip_address, user_agent)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING event_id
            """,
            workspace_id, actor_id, action, resource_type, resource_id,
            changes, metadata, ip_address, user_agent
        )
        return result["event_id"]

# Usage
await audit_service.log_event(
    conn=conn,
    workspace_id=workspace_id,
    actor_id=user_id,
    action="rsvp.submit",
    resource_type="rsvp",
    resource_id=guest_id,
    metadata={"status": "rsvp_yes", "plus_ones": 2},
    ip_address=request.client.host,
    user_agent=request.headers.get("User-Agent"),
)
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/invitations/{slug}/rsvp` | Public | Submit RSVP (rate limited) |
| GET | `/invitations/{slug}/rsvp/{rsvpId}` | Token | Get RSVP status |
| PATCH | `/invitations/{slug}/rsvp/{rsvpId}` | Token | Update RSVP |
| GET | `/workspaces/{id}/invitations/{id}/analytics` | JWT | Analytics summary |
| GET | `/workspaces/{id}/invitations/{id}/analytics/views` | JWT | View statistics |
| GET | `/workspaces/{id}/invitations/{id}/analytics/rsvp` | JWT | RSVP statistics |
| POST | `/workspaces/{id}/invitations/{id}/guests/bulk-invite` | JWT | Queue bulk invites |
| GET | `/workspaces/{id}/bulk-invite/{batchId}/status` | JWT | Batch status |
| GET | `/workspaces/{id}/audit-log` | JWT | Audit events |
| GET | `/health` | None | Health check |
| GET | `/ready` | None | Readiness check |
| GET | `/metrics` | None | Prometheus metrics |

---

## Testing

### Unit Tests

```bash
cd services/invitations-service
pytest tests/unit/ -v
```

### Integration Tests

```bash
pytest tests/integration/ -v
```

### Security Tests

```bash
# XSS prevention
pytest tests/security/test_xss.py -v

# Token validation
pytest tests/security/test_tokens.py -v

# PII filtering
pytest tests/security/test_pii_filter.py -v
```

---

## Configuration

### New Environment Variables

```bash
# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Metrics
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090

# Email Provider
EMAIL_PROVIDER=sendgrid  # or smtp
SENDGRID_API_KEY=SG.xxx

# Circuit Breaker
CIRCUIT_FAILURE_THRESHOLD=5
CIRCUIT_RECOVERY_TIMEOUT=60
```

### Rate Limits (configured in Redis)

| Endpoint | Limit | Window |
|----------|-------|--------|
| RSVP Submit | 10 requests | 1 minute (per IP) |
| CSV Import | 5 requests | 1 hour |
| Bulk Invite | 10 requests | 1 hour |

---

## Success Criteria Checklist

- [ ] XSS: No user input rendered unescaped in email templates
- [ ] Errors: No stack traces or internal details in 4xx/5xx responses
- [ ] Logs: No email/phone/name in production logs
- [ ] RSVP: Can submit, retrieve, and update RSVP via public API
- [ ] Analytics: Real view counts and RSVP stats returned
- [ ] Bulk: 100 invites process within 5 minutes
- [ ] Audit: All guest/RSVP actions logged with actor/timestamp
- [ ] Metrics: Prometheus endpoint returns http_requests_total, rsvp_submissions_total
- [ ] Circuit: Email failures trigger open circuit, auto-recover after timeout

---

## Related Documents

- [Specification](./spec.md) - Feature requirements and user stories
- [Implementation Plan](./plan.md) - Technical architecture and phases
- [Research](./research.md) - Technical decisions and rationale
- [Data Model](./data-model.md) - Entity definitions and migrations
- [API Contract](./contracts/openapi.yaml) - OpenAPI specification
