# Security Best Practices Reference

A guide for securing the RawDrive Enterprise Platform.

---

## 1. Authentication & Identity

### Tokens (JWT)
*   **Algorithm:** HS256 (Symmetric) or RS256 (Asymmetric).
*   **Expiration:** Short-lived Access Tokens (15-60 min). Long-lived Refresh Tokens (secure HttpOnly cookie).
*   **Payload:** Minimal info (`sub`, `workspace_id`, `role`). Never PII.

### Passwords
*   **Hashing:** Use **Argon2id** (preferred) or Bcrypt.
*   **Policy:** Enforce complexity (min 12 chars) if not using SSO.
*   **Rate Limiting:** Protect `/login` with strict limits (e.g., 5 retry attempts).

### Enterprise SSO
For Business/Enterprise plans, enforce SAML 2.0 or OIDC.
*   **Just-in-Time (JIT) Provisioning:** Create user account on first successful SSO login.

---

## 2. Authorization (RBAC & Multi-Tenancy)

**The Golden Rule:** Every data access query MUST include `workspace_id`.

```python
# BAD
db.query(Gallery).filter(Gallery.id == id).first()

# GOOD
db.query(Gallery).filter(
    Gallery.id == id, 
    Gallery.workspace_id == current_user.workspace_id
).first()
```

### Roles
*   `OWNER`: Full billing/workspace deletion access.
*   `ADMIN`: Manage users, settings.
*   `EDITOR`: Manage galleries, upload.
*   `VIEWER`: Read-only (internal).

Ensure API endpoints validate these roles using dependencies.

```python
@router.delete("/users/{id}")
async def delete_user(
    current_user: User = Depends(deps.get_current_active_superuser)
): ...
```

---

## 3. Data Protection

### Storage Access (S3/R2)
*   **Private Buckets:** Buckets should NOT be public-read.
*   **Presigned URLs:** Generate temporary URLs (Signed URLs) for client viewing.
    *   `TTL`: 1 hour (balance security vs ux).
*   **Uploads:** Use Presigned POST URLs to let browser upload directly to R2 (bypass backend bottleneck).

### Encryption
*   **At Rest:** DB volumes encrypted, S3 default encryption enabled.
*   **In Transit:** TLS 1.2+ for all traffic. HSTS enabled on Traefik/Nginx.

---

## 4. Input Validation & API Security

### OWASP Top 10 Mitigation
*   **SQL Injection:** Use SQLAlchemy ORM (parameterized queries).
*   **XSS:** React escapes content by default. Sanitize HTML in any rich-text inputs (`dompurify`).
*   **CSRF:** Use `SameSite=Strict` cookies.

### Public Links (Galleries)
*   **Enumeration:** Use UUIDs or HashIDs, NEVER sequential Integers (`/gallery/1` -> `/gallery/8f7a...`).
*   **Passwords:** Public galleries can be password protected. Hash the gallery password in DB!

---

## 5. Audit Logging

Enterprise requires knowing "Who did What and When".

*   **Events:** Login, Download, Delete, Share, Permission Change.
*   **Format:** JSON structure.
*   **Attributes:** `actor_id`, `action`, `resource_id`, `workspace_id`, `ip_address`, `user_agent`, `timestamp`.

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "action": "GALLERY_DOWNLOAD_ORIGINAL",
  "actor_id": "user_123",
  "resource_id": "gallery_456",
  "workspace_id": "ws_789",
  "status": "success"
}
```

---

## 6. Webhooks Security

If RawDrive sends webhooks to external systems:
*   **Signing:** Sign payloads with HMAC-SHA256 using a shared secret.
*   **Verification:** Receivers verify the signature header.
*   **SSRF:** If RawDrive calls user-provided URLs, validate they don't point to internal IPs (metadata services, localhost).
