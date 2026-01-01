# Research: Digital Invitations Microservice Production Readiness

**Feature Branch**: `018-invitations-production-readiness`
**Created**: 2026-01-01

## Summary

Research findings for all technical decisions in the production readiness implementation. All NEEDS CLARIFICATION items have been resolved based on existing codebase analysis and industry best practices.

---

## 1. XSS Prevention in Python Email Templates

### Decision
Use Python's built-in `html.escape()` for all user-provided content inserted into HTML email templates.

### Rationale
- `html.escape()` is part of Python's standard library (no additional dependencies)
- Handles all common HTML special characters: `<`, `>`, `&`, `"`, `'`
- Already used elsewhere in RawDrive codebase for similar purposes
- Recommended by OWASP for HTML context escaping

### Alternatives Considered
| Alternative | Why Rejected |
|-------------|--------------|
| Jinja2 autoescape | Adds templating dependency; overkill for simple email templates |
| bleach library | Designed for sanitizing HTML, not escaping plain text |
| MarkupSafe | Useful but `html.escape()` is sufficient for our needs |

### Implementation Pattern
```python
import html
from urllib.parse import quote

def safe_email_content(name: str, url: str) -> tuple[str, str]:
    """Escape user content for safe HTML email insertion."""
    safe_name = html.escape(name, quote=True)
    safe_url = quote(url, safe=':/?=&')
    return safe_name, safe_url
```

---

## 2. Secure Error Handling Pattern

### Decision
Return generic error messages to clients while logging detailed information internally with correlation IDs.

### Rationale
- OWASP recommends not exposing implementation details in error responses
- SOC2 CC6.1 requires protection of confidential information
- Correlation IDs allow operators to trace errors without exposing details to attackers

### Error Message Mapping
| Internal Error | External Response |
|----------------|-------------------|
| `jwt.ExpiredSignatureError` | "Authentication failed" |
| `jwt.InvalidTokenError` | "Authentication failed" |
| `KeyError` in token payload | "Authentication failed" |
| Database connection error | "Service temporarily unavailable" |
| Redis timeout | "Please try again" |

### Implementation Pattern
```python
async def get_current_user(...) -> CurrentUser:
    try:
        # Token validation logic
        ...
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired", extra={"correlation_id": correlation_id})
        raise HTTPException(status_code=401, detail="Authentication failed")
    except jwt.InvalidTokenError as e:
        logger.warning("Invalid token", extra={"error": str(e), "correlation_id": correlation_id})
        raise HTTPException(status_code=401, detail="Authentication failed")
```

---

## 3. PII Filtering in Logs

### Decision
Use structlog with a custom processor that filters known PII patterns before log output.

### Rationale
- GDPR Article 5(1)(f) requires appropriate security of personal data
- SOC2 CC6.1 prohibits unauthorized access to confidential information
- Structured logging enables programmatic filtering
- Filter at log processor level ensures no PII can leak regardless of developer mistake

### PII Detection Patterns
| Data Type | Detection Pattern | Replacement |
|-----------|-------------------|-------------|
| Email | `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b` | `[EMAIL REDACTED]` |
| Phone | `\b\d{3}[-.]?\d{3}[-.]?\d{4}\b` | `[PHONE REDACTED]` |
| Name fields | Keys containing "name", "email", "phone" | Value replaced with `[REDACTED]` |

### Implementation Pattern
```python
import re
import structlog

PII_PATTERNS = [
    (re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', re.I), '[EMAIL REDACTED]'),
    (re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'), '[PHONE REDACTED]'),
]

def filter_pii(logger, method_name, event_dict):
    """Structlog processor to filter PII from log output."""
    for key, value in list(event_dict.items()):
        if isinstance(value, str):
            for pattern, replacement in PII_PATTERNS:
                value = pattern.sub(replacement, value)
            event_dict[key] = value
    return event_dict
```

---

## 4. RSVP Edit Token Generation

### Decision
Generate edit tokens using UUID4 combined with HMAC-SHA256 signature for tamper resistance.

### Rationale
- UUID4 provides 122 bits of randomness (sufficient for unguessability)
- HMAC signature prevents token forging
- Combined approach allows token validation without database lookup
- Pattern used elsewhere in RawDrive for similar purposes

### Token Format
```
{uuid4}:{hmac_signature}
```

### Implementation Pattern
```python
import hmac
import hashlib
from uuid import uuid4
from src.config import settings

def generate_edit_token(guest_id: str, invitation_id: str) -> str:
    """Generate a secure, tamper-proof edit token."""
    token_id = str(uuid4())
    message = f"{token_id}:{guest_id}:{invitation_id}"
    signature = hmac.new(
        settings.JWT_SECRET.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()[:16]
    return f"{token_id}:{signature}"

def verify_edit_token(token: str, guest_id: str, invitation_id: str) -> bool:
    """Verify edit token authenticity."""
    try:
        token_id, signature = token.split(":")
        expected = generate_edit_token_signature(token_id, guest_id, invitation_id)
        return hmac.compare_digest(signature, expected)
    except (ValueError, AttributeError):
        return False
```

---

## 5. Analytics View Tracking

### Decision
Store invitation views in a dedicated `invitation_views` table with hashed visitor fingerprints.

### Rationale
- Separate table prevents bloating the main invitation_guests table
- Hashed fingerprint provides unique visitor counting without storing PII
- Supports time-series analytics queries
- Can be partitioned by date for archival

### Fingerprint Components
| Component | Purpose |
|-----------|---------|
| IP address (hashed) | Primary identifier |
| User-Agent | Browser/device detection |
| Accept-Language | Locale detection |

### Table Design
```sql
CREATE TABLE invitation_views (
    view_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id),
    visitor_hash VARCHAR(64) NOT NULL,  -- SHA256 of fingerprint
    device_type VARCHAR(20),  -- desktop, mobile, tablet
    browser VARCHAR(50),
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

CREATE INDEX idx_invitation_views_analytics
ON invitation_views(invitation_id, viewed_at);
```

---

## 6. Structured Logging Format

### Decision
Use structlog with JSON output format for ELK/CloudWatch compatibility.

### Rationale
- JSON format enables log aggregation and querying
- structlog is lightweight and integrates well with Python logging
- Already used in ai-service component of RawDrive
- Supports custom processors for PII filtering

### Log Entry Schema
```json
{
    "timestamp": "2026-01-01T12:00:00.000Z",
    "level": "info",
    "event": "rsvp_submitted",
    "correlation_id": "abc123",
    "workspace_id": "uuid",
    "invitation_id": "uuid",
    "guest_id": "uuid",
    "response_time_ms": 45
}
```

### Dependencies
```
structlog>=23.3.0
```

---

## 7. Prometheus Metrics

### Decision
Expose metrics via prometheus-client library on /metrics endpoint.

### Rationale
- Prometheus is the de facto standard for Kubernetes monitoring
- prometheus-client is the official Python client
- Minimal overhead for metric collection
- Integrates with existing RawDrive monitoring infrastructure

### Metrics to Expose
| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | Total HTTP requests by endpoint, method, status |
| `http_request_duration_seconds` | Histogram | Request latency distribution |
| `rsvp_submissions_total` | Counter | RSVP submissions by status (yes/no/maybe) |
| `email_sends_total` | Counter | Emails sent by status (success/failure) |
| `active_connections` | Gauge | Current active HTTP connections |

### Dependencies
```
prometheus-client>=0.19.0
```

---

## 8. Circuit Breaker Pattern

### Decision
Implement circuit breaker using a simple state machine (no external library).

### Rationale
- Libraries like pybreaker add unnecessary complexity for our use case
- Simple state machine with Redis state storage is sufficient
- Allows fine-grained control over failure thresholds and recovery
- Follows RawDrive's "keep it simple" principle

### Circuit States
| State | Behavior | Transition Condition |
|-------|----------|---------------------|
| CLOSED | Normal operation | 5 consecutive failures → OPEN |
| OPEN | Fail fast, no calls | 60 seconds elapsed → HALF_OPEN |
| HALF_OPEN | Allow 1 test call | Success → CLOSED, Failure → OPEN |

### Implementation Pattern
```python
class CircuitBreaker:
    def __init__(self, name: str, failure_threshold: int = 5, recovery_timeout: int = 60):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._state = "closed"
        self._failures = 0
        self._last_failure_time = None

    async def call(self, func, *args, **kwargs):
        if self._state == "open":
            if self._should_attempt_recovery():
                self._state = "half_open"
            else:
                raise CircuitOpenError(f"Circuit {self.name} is open")

        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            raise
```

---

## 9. Email Provider Abstraction

### Decision
Use abstract base class (ABC) pattern with factory for provider selection.

### Rationale
- Allows switching providers without code changes (config only)
- Supports A/B testing of email providers
- Enables graceful fallback if primary provider fails
- Standard Python pattern (Strategy + Factory)

### Interface Design
```python
from abc import ABC, abstractmethod
from typing import Protocol

class EmailProvider(ABC):
    @abstractmethod
    async def send_email(
        self,
        to_email: str,
        to_name: str,
        subject: str,
        html_content: str,
        template_id: str | None = None,
        template_data: dict | None = None,
    ) -> EmailResult:
        """Send an email. Returns result with status and message_id."""
        pass

    @abstractmethod
    async def send_bulk(
        self,
        recipients: list[EmailRecipient],
        subject: str,
        html_content: str,
    ) -> list[EmailResult]:
        """Send bulk emails. Returns list of results."""
        pass
```

---

## 10. Audit Log Design

### Decision
Use append-only table with no UPDATE/DELETE permissions for the application user.

### Rationale
- SOC2 requires tamper-proof audit trails
- GDPR Article 30 requires records of processing activities
- Append-only ensures immutability at database level
- Separate audit user can read but not modify

### Table Design
```sql
CREATE TABLE audit_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    actor_id UUID NOT NULL,  -- user who performed action
    action VARCHAR(50) NOT NULL,  -- create, update, delete, bulk_import, bulk_invite
    resource_type VARCHAR(50) NOT NULL,  -- guest, invitation, rsvp
    resource_id UUID NOT NULL,
    changes JSONB,  -- before/after for updates
    metadata JSONB,  -- additional context (batch_id, count, etc.)
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent modifications
REVOKE UPDATE, DELETE ON audit_events FROM rawdrive_app;

-- Index for workspace queries
CREATE INDEX idx_audit_events_workspace ON audit_events(workspace_id, created_at DESC);
```

### Retention Policy
- Keep audit logs for minimum 1 year (SOC2 requirement)
- Archive to cold storage after 1 year
- Delete after 7 years (or per customer contract)

---

## Unresolved Items

None. All technical decisions have been made based on existing codebase patterns and industry best practices.
