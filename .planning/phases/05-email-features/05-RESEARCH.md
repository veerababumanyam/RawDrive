# Phase 5: Email Features - Research

**Researched:** 2026-03-18
**Domain:** Transactional email flows (verification, password reset, invitations, delivery tracking)
**Confidence:** HIGH

## Summary

Phase 5 wires transactional email flows into the existing EmailService and PostalProvider built in Phase 2. The codebase already has substantial infrastructure in place: `EmailService` with `send_verification_email()`, `send_password_reset_email()`, and `send_invitation_email()` convenience methods containing fully-rendered inline HTML templates; `EmailVerificationService` with token generation, hashing, cooldown, and verification logic; a `postal_webhook.py` endpoint that tracks delivery status in Redis; and the `email_verifications` database table (migration 0098) supporting verification_type values including `password_reset`.

The primary work is **integration wiring**: connecting the existing services to auth endpoints (signup triggers verification email, forgot-password triggers reset email), building a password reset token service analogous to `EmailVerificationService`, migrating the invitations-service email worker from SendGrid to the unified EmailService/Postal, and upgrading the webhook tracking from Redis-only to also persist in PostgreSQL (MAIL-09).

**Primary recommendation:** Wire existing services together rather than building new infrastructure. The EmailService templates are already complete; the `EmailVerificationService` has a TODO at line 218 to "queue email sending via background task" -- this is the primary integration point. Password reset needs a new service following the same pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion. Specific targets:
- MAIL-05: Email verification after signup with secure token link
- MAIL-06: Password reset via email with time-limited token
- MAIL-07: Bulk wedding invitation emails through invitations-service
- MAIL-08: HTML email templates for verification, password reset, invitation, gallery delivery
- MAIL-09: Email delivery status tracked in database via Postal webhook callbacks

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MAIL-05 | User receives email verification after signup with secure token link | `EmailVerificationService` exists with token generation/validation. `EmailService.send_verification_email()` has HTML template. Auth signup endpoint exists but does NOT call verification service yet (TODO at line 218 of email_verification_service.py). Wire: signup -> generate token -> build URL -> send email. |
| MAIL-06 | User can reset password via email link with time-limited token | No `PasswordResetService` exists. Auth endpoints `/forgot-password` and `/reset-password` are stubs (TODOs). `email_verifications` table supports `verification_type='password_reset'`. `EmailService.send_password_reset_email()` HTML template is complete. Need: new service following EmailVerificationService pattern, wire to auth endpoints. |
| MAIL-07 | Bulk wedding invitation emails sent to guest lists via invitations-service | `BulkInviteService` and `email_worker.py` exist but use SendGrid directly. Need to migrate to unified EmailService with PostalProvider. `EmailService.send_invitation_email()` template exists. |
| MAIL-08 | Email templates created for verification, password reset, invitation, and gallery delivery | Verification, password reset, welcome, and invitation templates already exist as inline HTML in `EmailService`. Gallery delivery template needs to be created (new convenience method). All templates use inline CSS for email client compatibility. |
| MAIL-09 | Email delivery status tracked in database with webhook callbacks from Postal | `postal_webhook.py` exists and tracks in Redis only. Need to add PostgreSQL persistence (new `email_delivery_log` table or extend existing tracking). Link Postal message IDs to email types for queryable status. |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | existing | API endpoints for auth, webhooks | Project standard |
| asyncpg | existing | PostgreSQL async driver | Project standard |
| redis (aioredis) | existing | Token caching, cooldowns, tracking | Project standard |
| httpx | existing | Postal HTTP API client | Already used in postal_client.py |
| secrets | stdlib | Secure token generation | Used in EmailVerificationService |
| hashlib | stdlib | SHA-256 token hashing | Used in EmailVerificationService |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| html (stdlib) | stdlib | HTML escaping for template data | Prevent XSS in email templates |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline HTML templates | Jinja2 file-based templates | More maintainable for complex templates, but adds dependency; inline approach already established in codebase |
| Redis-only tracking | PostgreSQL tracking table | PostgreSQL needed for MAIL-09 (queryable delivery status); Redis for fast lookups |

**Installation:**
No new packages needed. All dependencies are already in the project.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/app/
  services/
    email_service.py              # EXISTS - EmailService with templates and providers
    email_verification_service.py # EXISTS - Token generation, verification, cooldown
    password_reset_service.py     # NEW - Follow EmailVerificationService pattern
  api/v1/
    auth.py                       # EXISTS - Wire verification + reset endpoints
    webhooks/
      postal_webhook.py           # EXISTS - Add PostgreSQL persistence
  migrations/versions/
    XXXX_email_delivery_log.py    # NEW - Delivery tracking table
    XXXX_password_reset_tokens.py # MAYBE - Or reuse email_verifications table
```

### Pattern 1: Token-Based Email Flow (Existing Pattern)
**What:** Generate secure token, hash it, store hash in DB + Redis, send token in URL via email, verify by hashing submitted token and comparing.
**When to use:** All token-based flows (verification, password reset).
**Example:**
```python
# From email_verification_service.py (line 183-216)
raw_token = secrets.token_urlsafe(TOKEN_LENGTH)  # 64 bytes
token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
# Store hash in PostgreSQL + Redis
# Send raw_token in URL via EmailService
# On verification: hash submitted token, compare with stored hash
```

### Pattern 2: EmailService Convenience Methods (Existing Pattern)
**What:** Each email type gets a convenience method on EmailService with inline HTML+text templates.
**When to use:** Adding new email types (gallery delivery).
**Example:**
```python
# From email_service.py (line 808-889)
async def send_verification_email(self, to_email, verification_url, user_name=None):
    html_content = f"""<!DOCTYPE html>..."""  # Inline HTML with inline CSS
    text_content = f"""..."""                  # Plain text fallback
    return await self.send_email(
        to_email=to_email,
        email_type=EmailType.VERIFICATION,
        html_content=html_content,
        text_content=text_content,
    )
```

### Pattern 3: Webhook Status Persistence
**What:** Postal webhook receives delivery events, maps to internal status, persists to both Redis (fast) and PostgreSQL (queryable).
**When to use:** MAIL-09 delivery tracking upgrade.

### Anti-Patterns to Avoid
- **Dual table confusion:** The codebase has BOTH `email_verifications` table (migration 0098, with verification_type including 'password_reset') AND `email_verification_tokens` table (referenced in email_verification_service.py). These appear to be separate tables -- `email_verification_service.py` uses `email_verification_tokens` while the migration creates `email_verifications`. Reconcile which to use.
- **Direct SendGrid usage in invitations-service:** The email_worker.py imports SendGrid directly. Must migrate to use the unified EmailService with PostalProvider.
- **Hardcoded URLs:** Email templates use hardcoded `https://app.rawdrive.in` -- use `settings.public_url` instead.
- **Missing HTML escaping:** Some template variables are interpolated directly into HTML without escaping. Use `html.escape()` for user-provided data (names, messages).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secure tokens | Custom random generation | `secrets.token_urlsafe(64)` | Cryptographically secure, URL-safe |
| Token storage | Plain text storage | SHA-256 hash + DB + Redis | Token never stored raw; hash comparison only |
| Email sending | Direct SMTP/API calls | `EmailService.send_email()` | Unified interface with provider fallback |
| Delivery tracking | Custom webhook parser | Extend existing `postal_webhook.py` | Already handles signature validation and event mapping |
| Rate limiting resends | Custom counter | Redis TTL key (existing cooldown pattern) | Already implemented in EmailVerificationService |

**Key insight:** Almost everything exists. This phase is integration work, not infrastructure building.

## Common Pitfalls

### Pitfall 1: Two Verification Table Confusion
**What goes wrong:** `email_verification_service.py` references `email_verification_tokens` table, but migration 0098 creates `email_verifications` table. These are different tables.
**Why it happens:** The code was written at different times with slightly different schemas.
**How to avoid:** Check which table actually exists in the running database. The `email_verifications` table (migration 0098) is more comprehensive (has verification_type, attempt tracking, lockout). Prefer using it and update `EmailVerificationService` to target it if needed, OR create a new `email_verification_tokens` migration if that table doesn't exist yet.
**Warning signs:** SQL errors about missing tables during token operations.

### Pitfall 2: Password Reset Token Enumeration
**What goes wrong:** The `/forgot-password` endpoint reveals whether an email exists by returning different responses.
**Why it happens:** Returning "email not found" vs "reset email sent" leaks user existence.
**How to avoid:** Always return the same response: "If the email exists, a reset link has been sent." The existing stub already does this correctly (line 408 of auth.py). Maintain this pattern.
**Warning signs:** Different HTTP status codes or messages for existing vs non-existing emails.

### Pitfall 3: Invitations-Service Cross-Service Email
**What goes wrong:** The invitations-service tries to import EmailService from the backend, but they run in separate containers.
**Why it happens:** Microservices can't share Python imports.
**How to avoid:** Either: (a) invitations-service calls backend's email API via HTTP, or (b) invitations-service gets its own PostalClient instance using shared config. Option (b) is simpler since PostalClient is a standalone HTTP client.
**Warning signs:** ImportError at runtime in the invitations container.

### Pitfall 4: Inline CSS Stripping by Email Clients
**What goes wrong:** Outlook and Gmail strip `<style>` tags from emails.
**Why it happens:** Email clients have aggressive CSS sanitization.
**How to avoid:** Use only inline `style` attributes (already done in existing templates). Never use `<style>` blocks or external CSS. The existing templates correctly use inline styles.
**Warning signs:** Broken layouts in Outlook/Gmail preview testing.

### Pitfall 5: Token URL Encoding
**What goes wrong:** Verification URLs with special characters break or get truncated by email clients.
**Why it happens:** URL-unsafe characters in tokens, or link wrapping by email clients.
**How to avoid:** Use `secrets.token_urlsafe()` (already done -- generates only URL-safe chars). Keep URLs under 2000 characters.
**Warning signs:** 404 errors when users click verification links.

## Code Examples

### Wiring Verification Email to Signup (MAIL-05)
```python
# In auth.py signup endpoint, after successful user creation:
from app.services.email_verification_service import EmailVerificationService
from app.services.email_service import get_email_service

verification_service = EmailVerificationService()
raw_token = await verification_service.send_verification_email(
    user_id=user.user_id,
    email=user.email,
    force=True,  # First send, skip cooldown
)

# Build verification URL
settings = get_settings()
verification_url = f"{settings.public_url}/verify-email?token={raw_token}"

# Send the actual email (this is the missing TODO in email_verification_service.py)
email_service = get_email_service()
await email_service.send_verification_email(
    to_email=user.email,
    verification_url=verification_url,
    user_name=user.display_name,
)
```

### Password Reset Service Pattern (MAIL-06)
```python
# New: backend/src/app/services/password_reset_service.py
# Follow EmailVerificationService pattern but use email_verifications table
# with verification_type='password_reset' and shorter TTL (1 hour)

TOKEN_TTL_HOURS = 1  # Password reset tokens expire in 1 hour

async def request_password_reset(self, email: str) -> str | None:
    """Generate reset token. Returns None if email not found (no leak)."""
    pool = await get_postgres_pool()
    row = await pool.fetchrow("SELECT user_id, display_name FROM users WHERE email = $1", email.lower())
    if not row:
        return None  # Silent fail -- don't reveal email existence

    # Generate token, hash, store in email_verifications with type='password_reset'
    raw_token = secrets.token_urlsafe(64)
    # ... store and send email ...
    return raw_token
```

### Webhook PostgreSQL Persistence (MAIL-09)
```python
# In postal_webhook.py, after Redis update:
pool = await get_postgres_pool()
await pool.execute(
    """
    INSERT INTO email_delivery_log (postal_message_id, status, event_type, occurred_at, payload)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (postal_message_id, event_type) DO UPDATE SET
        status = EXCLUDED.status,
        occurred_at = EXCLUDED.occurred_at
    """,
    postal_message_id, status, event_type, datetime.now(timezone.utc), json.dumps(payload),
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SendGrid direct (invitations email_worker) | Unified EmailService with Postal priority | Phase 2 | Must migrate email_worker.py |
| Redis-only delivery tracking | Redis + PostgreSQL tracking | This phase (MAIL-09) | Persistent, queryable delivery status |
| Stub auth endpoints (verify, reset) | Full token-based flows | This phase (MAIL-05, 06) | Users can verify email and reset password |

**Deprecated/outdated:**
- `email_worker.py` SendGrid direct usage: Replace with EmailService/PostalClient
- `email_verification_service.py` TODO at line 218: Will be resolved by wiring to EmailService

## Open Questions

1. **Which verification table to use?**
   - What we know: Migration 0098 creates `email_verifications` (comprehensive, supports verification_type). `email_verification_service.py` references `email_verification_tokens` (simpler).
   - What's unclear: Does `email_verification_tokens` table exist from an earlier migration, or only `email_verifications`?
   - Recommendation: Check the running database. If only `email_verifications` exists, update `EmailVerificationService` to use it. If both exist, consolidate onto `email_verifications` (more featureful). If neither exists, create the simpler `email_verification_tokens` via new migration (matching existing service code).

2. **Invitations email: HTTP call vs local PostalClient?**
   - What we know: Invitations-service is a separate container; cannot import backend's EmailService.
   - What's unclear: Whether invitations-service already has Postal config in its environment.
   - Recommendation: Give invitations-service its own PostalClient instance (copy the lightweight postal_client.py) rather than adding HTTP-to-backend dependency. This is simpler and has fewer failure modes.

3. **Gallery delivery email template**
   - What we know: MAIL-08 requires a gallery delivery template. No `GALLERY_DELIVERY` EmailType exists yet.
   - What's unclear: Exact content needed (Phase 7 implements gallery delivery; this phase just creates the template).
   - Recommendation: Add `GALLERY_DELIVERY = "gallery_delivery"` to EmailType, create `send_gallery_delivery_email()` method with a template containing gallery name, photographer name, magic link URL, and preview thumbnail. This template will be used by Phase 7.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (via Docker) |
| Config file | backend/pytest.ini or pyproject.toml |
| Quick run command | `docker exec rawdrive-backend pytest tests/ -x -q --timeout=30` |
| Full suite command | `docker exec rawdrive-backend pytest` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAIL-05 | Signup triggers verification email with valid token URL | integration | `docker exec rawdrive-backend pytest tests/test_email_verification.py -x` | No - Wave 0 |
| MAIL-06 | Forgot-password generates reset token, reset-password validates and updates | integration | `docker exec rawdrive-backend pytest tests/test_password_reset.py -x` | No - Wave 0 |
| MAIL-07 | Bulk invite queues emails via PostalClient (not SendGrid) | unit | `docker exec rawdrive-backend pytest tests/test_invitation_emails.py -x` | No - Wave 0 |
| MAIL-08 | All 4 email templates render valid HTML with required variables | unit | `docker exec rawdrive-backend pytest tests/test_email_templates.py -x` | No - Wave 0 |
| MAIL-09 | Webhook persists delivery status to PostgreSQL and Redis | integration | `docker exec rawdrive-backend pytest tests/test_postal_webhook.py -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `docker exec rawdrive-backend pytest tests/test_email*.py tests/test_password_reset.py tests/test_postal_webhook.py -x -q`
- **Per wave merge:** `docker exec rawdrive-backend pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_email_verification.py` -- covers MAIL-05
- [ ] `tests/test_password_reset.py` -- covers MAIL-06
- [ ] `tests/test_invitation_emails.py` -- covers MAIL-07
- [ ] `tests/test_email_templates.py` -- covers MAIL-08
- [ ] `tests/test_postal_webhook.py` -- covers MAIL-09
- [ ] `tests/conftest.py` updates -- mock EmailService, mock PostalClient, test database fixtures

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of `email_service.py`, `email_verification_service.py`, `postal_client.py`, `postal_webhook.py`, `auth.py`, `auth_service.py`, `email_worker.py`, `bulk_invite_service.py`
- Migration 0098 (`email_verifications` table schema)
- `settings.py` for Postal configuration fields

### Secondary (MEDIUM confidence)
- Email client CSS support (inline styles requirement) -- well-established industry knowledge

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new dependencies
- Architecture: HIGH - existing patterns clearly established, just need wiring
- Pitfalls: HIGH - identified from direct code inspection of dual-table confusion and cross-service boundaries

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- internal codebase patterns unlikely to change)
