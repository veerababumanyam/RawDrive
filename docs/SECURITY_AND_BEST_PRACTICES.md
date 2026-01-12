# Security & Best Practices - RawDrive Platform

> **Version**: 0.3.2  
> **Last Updated**: 2026-01-09  
> **Classification**: Internal Documentation

## Overview

RawDrive is an enterprise SaaS platform for professional photographers handling sensitive customer data including photos, personal information, and payment details for 20,000+ photographers. This document outlines the comprehensive security measures and best practices implemented across the platform.

## Core Security Principles

| Principle | Description |
|-----------|-------------|
| **Defense in Depth** | Multiple layers of security controls at every level |
| **Least Privilege** | Users and services have minimum necessary permissions |
| **Zero Trust** | Verify every access request, never trust by default |
| **Secure by Default** | Security enabled by default in all configurations |
| **Fail Securely** | Errors never expose sensitive data |
| **Separation of Concerns** | Security-critical components are isolated |

---

## 1. Authentication

### 1.1 Password Security

**Password Policy:**
- Minimum 8 characters
- Require uppercase letters (A-Z)
- Require lowercase letters (a-z)
- Require numbers (0-9)
- Require special characters (!@#$%^&*)
- Cannot contain username or email
- Cannot reuse last 5 passwords
- Expire every 90 days (configurable)

**Password Hashing Algorithm - Argon2id (OWASP Recommended):**

```python
# backend/src/app/utils/security.py
PasswordHasher(
    memory_cost=65536,  # 64 MB
    time_cost=3,        # 3 iterations
    parallelism=4       # 4 parallel threads
)
```

**Implementation:**
- Unique salt per password
- Never store plaintext passwords
- Verification via constant-time comparison

### 1.2 JWT Token Security

**Algorithm:** EdDSA with Ed25519 keypairs (preferred over RSA for smaller keys and modern security)

**Key Management:**
- Private key stored only on backend
- Keys stored in `backend/secrets/` (git-ignored)
- Public key shareable for verification
- Annual key rotation with grace period

**Token Configuration:**

| Token Type | TTL | Storage | Purpose |
|------------|-----|---------|---------|
| Access Token | 15 minutes | Authorization header | API requests |
| Refresh Token | 7 days | httpOnly secure cookie | Token renewal |
| Remember Me | 30 days | httpOnly secure cookie | Extended sessions |

**JWT Claims Structure:**
```json
{
  "sub": "user-id",
  "user_id": "user-id",
  "workspace_id": "workspace-id",
  "permissions": ["galleries:read", "galleries:write"],
  "iat": 1736332200,
  "exp": 1736333100,
  "jti": "unique-token-id",
  "iss": "rawdrive-backend",
  "token_type": "access",
  "sid": "session-id"
}
```

### 1.3 Session Management

**Session Configuration:**
- Session timeout: 1 hour of inactivity
- Absolute timeout: 24 hours
- Maximum 5 concurrent sessions per user
- Terminate oldest session on new login

**Session Tracking:**
- IP address tracking
- User agent tracking
- Device ID tracking
- Suspicious activity detection

**Session Security:**
- Secure cookies (HTTPS only)
- HttpOnly flag (no JavaScript access)
- SameSite=Strict (CSRF protection)
- Redis-based storage with automatic expiration

### 1.4 Multi-Factor Authentication (MFA)

**Supported Methods:**

| Method | Configuration |
|--------|---------------|
| **TOTP** | 6-digit codes, 30-second window, QR code setup |
| **SMS** | 6-digit codes, 5-minute expiration, rate limited |
| **Email** | 6-digit codes, 10-minute expiration |
| **Backup Codes** | 10 codes, 8 characters each, one-time use |

**MFA Enforcement:**
- Optional for regular users
- Required for admin accounts
- Required for enterprise tier
- Backup codes for account recovery

### 1.5 OAuth 2.0 Integration

**Supported Providers:**
- Google OAuth 2.0 / OIDC (primary)
- GitHub (future)
- Facebook (future)
- Microsoft (future)

**OAuth Security:**
- Authorization code flow only
- Validate redirect URIs
- Store refresh tokens securely
- Revoke tokens on logout
- Email-based account linking

---

## 2. Authorization & Access Control

### 2.1 Role-Based Access Control (RBAC)

**User Roles:**

| Role | Description | Access Level |
|------|-------------|--------------|
| Photographer | Primary user | Own galleries and resources |
| Client | Limited access | Shared galleries only |
| Admin | Platform administrator | Full access with audit trail |
| Super Admin | System administrator | All operations, all workspaces |

**Permission Model:**
```python
# backend/src/app/services/rbac_service.py
WORKSPACE_PERMISSIONS = [
    "galleries:read",
    "galleries:write",
    "galleries:delete",
    "assets:read",
    "assets:write",
    "assets:delete",
    "members:read",
    "members:write",
    "roles:read",
    "roles:write",
    "settings:read",
    "settings:write",
    # ... and more
]
```

**Permission Checking:**
```python
# FastAPI dependency injection
@router.get("/galleries/{gallery_id}")
async def get_gallery(
    user: Annotated[CurrentUser, Depends(require_permissions("galleries:read"))]
):
    ...
```

### 2.2 Multi-Tenant Isolation (CRITICAL)

**Every database query MUST include workspace_id:**

```python
# ✅ CORRECT - Workspace isolated
result = await db.execute(
    select(Asset).where(
        Asset.workspace_id == workspace_id,
        Asset.id == asset_id
    )
)

# ❌ WRONG - Cross-workspace data leak possible
result = await db.execute(
    select(Asset).where(Asset.id == asset_id)
)
```

**Enforcement Mechanisms:**
- Middleware extracts `workspace_id` from JWT
- All repository methods require `workspace_id` parameter
- Database queries automatically filtered
- No cross-workspace access possible

### 2.3 Resource-Level Access Control

**Resource Ownership Model:**
```python
resource = {
    "resource_id": "uuid",
    "owner_id": "uuid",
    "shared_with": [
        {"user_id": "uuid", "permission": "view"},
        {"user_id": "uuid", "permission": "edit"},
    ],
    "is_public": False,
    "access_code": "optional-code"
}
```

**Access Rules:**
- Owner has full access
- Shared users have specified permissions
- Public resources accessible to all (if enabled)
- Access codes for additional protection

---

## 3. Data Protection & Encryption

### 3.1 Encryption in Transit

**TLS/SSL Configuration:**

| Setting | Value |
|---------|-------|
| Minimum TLS Version | 1.3 |
| Perfect Forward Secrecy | Enabled |
| HSTS Max-Age | 1 year |
| HSTS includeSubdomains | Yes |
| HSTS Preload | Yes |

**Cipher Suites (ordered by preference):**
1. `TLS_AES_256_GCM_SHA384`
2. `TLS_CHACHA20_POLY1305_SHA256`
3. `TLS_AES_128_GCM_SHA256`

### 3.2 Encryption at Rest

**Algorithm:** AES-256-GCM

**Key Management:**
- AWS KMS, Azure Key Vault, HashiCorp Vault, or self-managed
- Annual key rotation
- Separate keys per data type
- Disaster recovery keys secured

**Encrypted Data Categories:**
- User passwords (hashed + encrypted)
- Payment information
- API keys and tokens
- Sensitive metadata
- Database backups

### 3.3 File Upload Encryption

**Upload Service Encryption (AES-256-CTR):**

```
Original File → AES-256-CTR → Encrypted File
                    ↓
         [IV (16 bytes)] + [Encrypted Data] + [HMAC Tag (32 bytes)]
```

**Key Derivation (HKDF):**
```python
# Per-workspace key derivation
def derive_workspace_key(master_key: bytes, workspace_id: str) -> bytes:
    return hmac.new(
        master_key,
        workspace_id.encode(),
        hashlib.sha256
    ).digest()
```

**Key Rotation Process:**
1. Generate new master key (v2)
2. Update `ENCRYPTION_KEY` environment variable
3. New uploads use key v2
4. Old files remain encrypted with key v1
5. Background job re-encrypts files (optional)

---

## 4. API Security

### 4.1 API Authentication

**Methods:**
- JWT Bearer tokens (primary)
- OAuth 2.0
- API Keys (for external integrations)

**API Key Security:**
- Cryptographically secure generation
- Hash keys before storage
- IP whitelisting support
- Permission-based restrictions
- Expiration dates
- Usage monitoring

### 4.2 Rate Limiting

**Rate Limit Configuration:**

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Login attempts | 5 requests | 15 minutes |
| API requests | 1000 requests | 1 hour |
| File uploads | 100 requests | 1 hour |
| Email sends | 50 requests | 1 hour |

**Traefik Rate Limiting:**
```yaml
middlewares:
  rate-limit-api:
    rateLimit:
      average: 100
      burst: 200
      period: 1m
```

**Response on Rate Limit:**
- HTTP 429 (Too Many Requests)
- `Retry-After` header included
- Violations logged
- Alerts on suspicious patterns

### 4.3 Input Validation

**Backend (Pydantic):**
```python
from pydantic import BaseModel, Field

class CreateGallery(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    workspace_id: UUID = Field(...)  # REQUIRED for multi-tenancy
```

**Frontend (TypeScript):**
```typescript
export function validateEmail(email: string): ValidationResult {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // ... validation logic
}
```

**Validated Inputs:**
- Email: RFC 5322 format
- Phone: E.164 format
- URL: Valid format, http/https only
- File size: Maximum limits enforced
- File type: Whitelist only

### 4.4 Output Encoding

- JSON encoding for API responses
- HTML encoding for web content
- URL encoding for URLs
- Base64 for binary data
- Never output raw user input

---

## 5. Threat Prevention

### 5.1 SQL Injection Prevention

**Measures:**
- Parameterized queries only
- SQLAlchemy ORM usage
- Input validation
- Least privilege database users
- Prepared statements

**Example:**
```python
# ✅ GOOD: Parameterized query
result = await db.execute(
    select(User).where(User.email == email_param)
)

# ❌ BAD: String concatenation (NEVER DO THIS)
result = await db.execute(f"SELECT * FROM users WHERE email = '{email}'")
```

### 5.2 XSS Prevention

**Frontend Sanitization:**
```typescript
// frontend/src/utils/securityUtils.ts
export function sanitizeHtml(input: string, options: SanitizeOptions = {}): string {
  const allowedTags = ['b', 'i', 'em', 'strong', 'a', 'p', 'br'];
  const allowedAttributes = ['href', 'title', 'class'];
  // ... sanitization logic
}
```

**Content Security Policy:**
```
default-src 'self';
script-src 'self' cdn.example.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' api.example.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

### 5.3 CSRF Prevention

**Implementation:**
```typescript
// Generate CSRF token
export function getCsrfToken(): string {
  const token = generateSecureToken();
  sessionStorage.setItem(CSRF_STORAGE_KEY, JSON.stringify({
    token,
    expiresAt: Date.now() + 3600000  // 1 hour
  }));
  return token;
}

// Include in API requests
export function getCsrfHeader(): Record<string, string> {
  return { 'X-CSRF-Token': getCsrfToken() };
}
```

**Additional Measures:**
- SameSite=Strict cookie attribute
- Origin header verification
- Double-submit cookies

### 5.4 Brute Force Protection

**Configuration:**
- Max 5 login attempts per 15 minutes
- 30-minute lockout after 5 failures
- Progressive delays (1s, 2s, 4s, 8s, 16s)
- Cloudflare Turnstile after 3 failures
- IP block after 10 failures

### 5.5 DDoS Protection

**Measures:**
- Cloudflare edge (CDN + WAF + DDoS protection)
- Traefik rate limiting
- IP blocking
- Traffic analysis
- Automatic scaling (KEDA)
- Geographic distribution

---

## 6. Error Handling & Information Leakage

### 6.1 Error Sanitization

**Sensitive Patterns Removed:**
```python
# gallery-service/src/utils/security.py
sensitive_patterns = [
    r'postgresql://[^\s]+',      # Database URLs
    r'/[a-zA-Z0-9_\-./]+\.py',   # File paths
    r'SELECT.*FROM',             # SQL queries
    r'password["\s]*[:=]',       # Passwords
    r'secret["\s]*[:=]',         # Secrets
    r'api[_-]?key["\s]*[:=]',    # API keys
]
```

**Implementation:**
```python
def sanitize_error_message(error: Exception, default_message: str) -> str:
    error_str = str(error)
    for pattern in sensitive_patterns:
        if re.search(pattern, error_str, re.IGNORECASE):
            return default_message  # Return generic message
    return error_str
```

### 6.2 Safe Error Types

Only these error types expose messages to users:
- `ValueError`
- `KeyError`
- `TypeError`
- `NotFoundError`
- `ValidationError`
- `PermissionError`

All other errors return generic messages.

---

## 7. File Upload Security

### 7.1 File Type Whitelist

**Allowed Types:**

| Category | Formats |
|----------|---------|
| **Images** | JPEG, PNG, WebP, HEIC, TIFF, GIF, AVIF, BMP |
| **RAW** | CR2, CR3, NEF, ARW, RAF, ORF, RW2, DNG, PEF, RWL, SRW, X3F, 3FR |
| **Videos** | MP4, MOV |

### 7.2 File Size Limits

| File Type | Maximum Size |
|-----------|--------------|
| Images | 100 MB |
| RAW files | 200 MB |
| Videos | 500 MB |

### 7.3 Filename Sanitization

```python
def sanitize_filename(filename: str) -> str:
    # Remove path traversal attempts
    filename = os.path.basename(filename)
    
    # Allow only alphanumeric, dash, underscore, period
    filename = re.sub(r'[^\w\-\.]', '_', filename)
    
    # Limit length
    if len(filename) > 255:
        name, ext = os.path.splitext(filename)
        filename = name[:250] + ext
    
    return filename
```

### 7.4 Integrity Verification

**SHA256 Checksums:**
- Client calculates hash before upload
- Server verifies hash after assembly
- Stored in database for future verification

```python
hash_obj = hashlib.sha256()
async for chunk in assemble_chunks(upload_id):
    hash_obj.update(chunk)

if hash_obj.hexdigest() != provided_sha256:
    raise ChecksumMismatchError
```

---

## 8. Infrastructure Security

### 8.1 Traefik v3 API Gateway

**Security Features:**
- Automatic Let's Encrypt TLS certificates
- Priority-based routing
- Per-endpoint rate limiting
- Circuit breaker pattern
- Request/response logging
- Prometheus metrics exposure

**Routing Priority Table:**

| Priority | Route | Service |
|----------|-------|---------|
| 150 | `/webhooks/stripe` | billing-service |
| 145 | `/api/v1/subscription/*` | billing-service |
| 142 | `/api/v1/webhooks/*` | webhooks-service |
| 140 | `/api/v1/galleries/*` | gallery-service |
| 135 | `/api/v1/uploads/*` | upload-service |
| 100 | `/api/*` | backend (fallback) |

### 8.2 Container Security

- Minimal Docker images
- Non-root user execution
- Secret management via environment variables
- Kubernetes RBAC for service accounts
- Trivy container scanning

### 8.3 Database Security

**PostgreSQL Configuration:**
- Encrypted connections (SSL/TLS)
- Encrypted storage
- Automated backups with encryption
- Point-in-time recovery
- Strong passwords
- IP whitelisting

**PgBouncer Connection Pooling:**
- Max 100 connections
- Connection authentication
- TLS enforcement

### 8.4 CORS Configuration

**Production:**
```yaml
CORS_ORIGINS: "https://app.rawdrive.com,https://rawdrive.com"
```

**Development:**
```yaml
CORS_ORIGINS: "http://localhost:3000,http://localhost:5173"
```

---

## 9. Monitoring & Audit Logging

### 9.1 Logged Security Events

| Event Category | Examples |
|----------------|----------|
| Authentication | login, logout, failed attempts, password reset |
| Authorization | permission changes, access denied |
| Data Access | read, write, delete operations |
| Configuration | settings changes, key rotations |
| Security | alerts, incidents, suspicious activity |

### 9.2 Audit Log Structure

```json
{
  "timestamp": "2026-01-09T10:30:00Z",
  "event": "asset.uploaded",
  "user_id": "user-123",
  "workspace_id": "workspace-456",
  "asset_id": "asset-789",
  "filename": "photo.jpg",
  "file_size": 1048576,
  "ip_address_hash": "sha256(ip)",
  "user_agent": "Mozilla/5.0..."
}
```

### 9.3 Log Retention

| Log Type | Retention |
|----------|-----------|
| Security logs | 1 year |
| Audit logs | 3 years |
| Access logs | 90 days |
| Error logs | 30 days |

### 9.4 Monitoring Stack

| Service | Port | Purpose |
|---------|------|---------|
| Prometheus | 9090 | Metrics collection |
| Grafana | 3001 | Dashboards |
| Loki | 3100 | Log aggregation |
| Alertmanager | 9093 | Alert routing |
| Tempo | 3200 | Distributed tracing |

### 9.5 Alert Thresholds

- 5 failed logins in 15 minutes
- 10 API errors in 1 minute
- 100 rate limit violations in 1 hour
- Unauthorized access attempts
- Configuration changes

---

## 10. Compliance

### 10.1 Standards & Frameworks

| Standard | Status | Coverage |
|----------|--------|----------|
| **OWASP Top 10** | ✅ Implemented | Full coverage across all categories |
| **SOC 2 Type II** | ✅ Compliant | Security, availability, confidentiality |
| **GDPR** | ✅ Compliant | EU data protection |
| **CCPA** | ✅ Compliant | California privacy rights |
| **PCI DSS** | ✅ Compliant | Payment card security (via Stripe/Razorpay) |
| **NIST CSF** | ✅ Aligned | Cybersecurity framework |
| **ISO 27001** | 🔄 In Progress | Information security management |

### 10.2 GDPR Implementation

**Data Subject Rights:**
- Right to be forgotten (data deletion API)
- Data portability (export functionality)
- Consent management
- Privacy by design
- 72-hour breach notification

### 10.3 CCPA Implementation

**Consumer Rights:**
- Right to know (data access API)
- Right to delete
- Right to opt-out
- Non-discrimination
- Privacy notice

---

## 11. Vulnerability Management

### 11.1 Security Scanning

| Tool | Purpose | Frequency |
|------|---------|-----------|
| OWASP ZAP | Web application scanning | Weekly |
| Snyk | Dependency vulnerabilities | Continuous |
| SonarQube | Code quality & security | Every commit |
| npm audit | NPM packages | Every build |
| Trivy | Container images | Every build |

### 11.2 Patch Management

| Severity | SLA |
|----------|-----|
| Critical | Within 24 hours |
| High | Within 1 week |
| Medium | Within 2 weeks |
| Low | Within 1 month |

### 11.3 Penetration Testing

- Quarterly external penetration tests
- After major changes
- Before major releases
- On-demand for critical issues

---

## 12. Incident Response

### 12.1 Response Plan

1. **Detection**: Identify security incident
2. **Assessment**: Determine severity and scope
3. **Containment**: Isolate affected systems
4. **Eradication**: Remove threat
5. **Recovery**: Restore systems
6. **Lessons Learned**: Post-mortem analysis

### 12.2 Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| Critical | Immediate threat to data/service | 15 minutes |
| High | Significant security issue | 1 hour |
| Medium | Moderate security concern | 4 hours |
| Low | Minor security issue | 24 hours |

### 12.3 Breach Notification Timeline

| Regulation | Timeline |
|------------|----------|
| GDPR | 72 hours |
| CCPA | Without unreasonable delay |
| State Laws | Varies by state |

---

## 13. Security Checklist

### Pre-Deployment

- [ ] Security code review completed
- [ ] Vulnerability scan passed
- [ ] Penetration test completed
- [ ] Dependency audit passed
- [ ] Security tests passed
- [ ] Compliance check passed
- [ ] Security team approval

### Post-Deployment

- [ ] Monitoring enabled
- [ ] Alerting configured
- [ ] Logging verified
- [ ] Backup verified
- [ ] Disaster recovery tested

### Ongoing

- [ ] Security patches applied
- [ ] Vulnerability scans run
- [ ] Logs reviewed
- [ ] Access reviewed
- [ ] Compliance verified
- [ ] Training completed
- [ ] Incidents documented

---

## 14. Key Security Files Reference

| File | Purpose |
|------|---------|
| `docs/project/02-SECURITY_REQUIREMENTS.md` | Comprehensive security requirements |
| `docs/Features/AUTHENTICATION_AND_SECURITY.md` | Auth implementation details |
| `backend/src/app/utils/security.py` | Password hashing & JWT utilities |
| `backend/src/app/api/dependencies/auth.py` | FastAPI auth dependencies |
| `backend/src/app/services/rbac_service.py` | RBAC permission management |
| `frontend/src/utils/securityUtils.ts` | Client-side security utilities |
| `services/upload-service/docs/SECURITY.md` | Upload service security guide |
| `services/gallery-service/src/utils/security.py` | Gallery service security |
| `infrastructure/docker/traefik/traefik.yaml` | API Gateway configuration |

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-09 | Initial document creation |

---

## Related Documentation

- [AUTHENTICATION_AND_SECURITY.md](Features/AUTHENTICATION_AND_SECURITY.md)
- [02-SECURITY_REQUIREMENTS.md](project/02-SECURITY_REQUIREMENTS.md)
- [RBAC_AND_USER_MANAGEMENT.md](RBAC_AND_USER_MANAGEMENT.md)
- [Upload Service SECURITY.md](../services/upload-service/docs/SECURITY.md)
