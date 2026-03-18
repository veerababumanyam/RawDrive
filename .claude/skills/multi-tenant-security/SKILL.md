---
name: multi-tenant-security
description: "Enforce workspace_id isolation, RBAC, JWT validation, and security patterns in RawDrive. Use this skill whenever writing database queries, API endpoints, repository methods, service logic, or any code that accesses user/workspace data. Also use when reviewing code for security issues, implementing authentication, authorization, share links, download policies, or audit logging. Even simple CRUD operations need this skill because every query MUST include workspace_id filtering."
---

# Multi-Tenant Security Patterns

RawDrive is a multi-tenant SaaS platform. The #1 security rule: **every data access MUST filter by workspace_id extracted from the JWT token, never from client input.**

## The Golden Rule

```python
# CORRECT - workspace_id from authenticated context
result = await db.execute(
    select(Gallery).where(
        Gallery.id == gallery_id,
        Gallery.workspace_id == current_user.workspace_id  # FROM JWT
    )
)

# WRONG - missing workspace isolation (data leak across tenants!)
result = await db.execute(
    select(Gallery).where(Gallery.id == gallery_id)
)

# WRONG - trusting client-provided workspace_id
result = await db.execute(
    select(Gallery).where(Gallery.workspace_id == request.workspace_id)  # NEVER
)
```

## Repository Pattern with Isolation

Every repository method must accept and enforce workspace_id:

```python
class GalleryRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, gallery_id: UUID, workspace_id: UUID) -> Gallery | None:
        result = await self.db.execute(
            select(Gallery).where(
                Gallery.id == gallery_id,
                Gallery.workspace_id == workspace_id
            )
        )
        return result.scalars().first()

    async def list_all(self, workspace_id: UUID, skip: int = 0, limit: int = 20) -> list[Gallery]:
        result = await self.db.execute(
            select(Gallery)
            .where(Gallery.workspace_id == workspace_id)
            .offset(skip).limit(limit)
        )
        return list(result.scalars().all())
```

## RBAC Roles

| Role | Capabilities |
|------|-------------|
| `OWNER` | Full access + billing + workspace deletion |
| `ADMIN` | Manage users, settings, all content |
| `EDITOR` | Manage galleries, upload assets |
| `VIEWER` | Read-only internal access |

**Workspace RBAC != Platform RBAC** - keep these permission systems separate.

## Authentication Flow

- **Primary:** Google OAuth
- **Fallback:** Email/password with Argon2id hashing
- **Tokens:** Short-lived access (15-60 min) + HttpOnly refresh cookie
- **JWT payload:** Minimal - `sub`, `workspace_id`, `role` only. No PII.
- **Magic links:** For client portal access, cached in Redis

## Public/Share Link Security

- Share links use capability-based auth (UUID tokens, never sequential IDs)
- Download policies per link: `view_only | web_only | watermarked_only | original_allowed`
- Gallery passwords: hash in database, never store plaintext
- Presigned URLs for R2/S3: TTL 1 hour max

## Audit Logging

Log security-sensitive actions in structured JSON:
```python
await audit_service.log(
    action="GALLERY_DOWNLOAD_ORIGINAL",
    actor_id=current_user.id,
    resource_id=gallery_id,
    workspace_id=current_user.workspace_id,
    ip_address=request.client.host,
    status="success"
)
```

## Checklist for Code Review

- [ ] Every query filters by `workspace_id`
- [ ] `workspace_id` extracted from JWT, never from request body/params
- [ ] Public endpoints use capability tokens (UUIDs), not sequential IDs
- [ ] Passwords hashed with Argon2id
- [ ] Sensitive data encrypted at rest (AES-256)
- [ ] Rate limiting on auth endpoints
- [ ] Input sanitized (SQLAlchemy parameterized queries, DOMPurify for HTML)

**Deep dive:** Read `.claude/reference/security-best-practices.md` and `.claude/reference/authentication-architecture.md`
