---
name: security
aliases: [auth, authentication, authorization, rbac, encryption, soc2, gdpr, jwt]
description: Security and data protection guidelines for RawDrive. Use when implementing authentication, handling user data, validating inputs, or reviewing security-sensitive code.
---

# Security & Data Protection Guidelines

## Key Files

| Purpose | Location |
|---------|----------|
| Auth middleware | `backend/src/app/middleware/auth.py` |
| JWT utilities | `backend/src/app/core/security.py` |
| Dependencies | `backend/src/app/api/dependencies.py` |
| Encryption | `backend/src/app/services/encryption_service.py` |
| Audit logging | `backend/src/app/services/audit_service.py` |

## Security Layers

```
CloudFlare WAF/DDoS → nginx (TLS 1.3) → Rate Limiting
    → JWT Authentication → RBAC Authorization
        → Workspace Isolation → Encrypted Storage
```

## Authentication

### JWT Token Flow

```python
# backend/src/app/core/security.py

ACCESS_TOKEN_EXPIRE = timedelta(minutes=15)
REFRESH_TOKEN_EXPIRE = timedelta(days=7)

def create_tokens(user: User) -> TokenPair:
    access_token = jwt.encode(
        {
            "sub": str(user.id),
            "workspace_id": str(user.workspace_id),
            "exp": datetime.utcnow() + ACCESS_TOKEN_EXPIRE,
        },
        settings.JWT_SECRET,  # From env, NEVER hardcode
        algorithm="HS256"
    )
    # ... refresh token similar
    return TokenPair(access_token=access_token, refresh_token=refresh_token)
```

### Password Security

```python
from argon2 import PasswordHasher

ph = PasswordHasher()

# Hash password (Argon2id)
hashed = ph.hash(password)

# Verify password
try:
    ph.verify(stored_hash, password)
except VerifyMismatchError:
    raise HTTPException(401, "Invalid credentials")
```

### Two-Factor Authentication

```python
import pyotp

# Generate TOTP secret
secret = pyotp.random_base32()
totp = pyotp.TOTP(secret)

# Verify token
is_valid = totp.verify(user_token, valid_window=1)
```

## Authorization (RBAC)

```python
# backend/src/app/api/dependencies.py

def require_permission(*permissions: str):
    async def check(
        user: User = Depends(get_current_user),
        workspace: Workspace = Depends(get_current_workspace),
    ):
        user_permissions = await get_user_permissions(user.id, workspace.id)
        if not any(p in user_permissions for p in permissions):
            raise HTTPException(403, "Permission denied")
        return True
    return Depends(check)

# Usage
@router.delete("/galleries/{id}")
async def delete_gallery(
    id: UUID,
    _: bool = require_permission("gallery:delete"),
):
    ...
```

### Permission Format

```python
# Resource-based permissions
PERMISSIONS = [
    "gallery:create", "gallery:read", "gallery:update", "gallery:delete",
    "asset:upload", "asset:delete", "asset:download",
    "client:manage", "user:manage",
    "billing:view", "billing:manage",
    "workspace:*",  # Wildcard for admin
]
```

## Workspace Data Isolation (CRITICAL)

```python
# ALWAYS include workspace_id in queries
async def get_asset(db: AsyncSession, workspace_id: UUID, asset_id: UUID):
    result = await db.execute(
        select(Asset)
        .where(Asset.workspace_id == workspace_id)  # REQUIRED
        .where(Asset.id == asset_id)
    )
    return result.scalar_one_or_none()

# WRONG - Cross-tenant vulnerability
result = await db.execute(select(Asset).where(Asset.id == asset_id))

# WRONG - Never trust client-provided workspace_id
workspace_id = request.body.workspace_id  # SECURITY VULNERABILITY
```

### Storage Object Keys

```python
# All storage keys MUST include workspace_id prefix
object_key = f"workspaces/{workspace_id}/assets/{asset_id}/original/{filename}"
```

## Input Validation

```python
from pydantic import BaseModel, Field, validator

class CreateGalleryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)

    @validator("name")
    def sanitize_name(cls, v):
        # Remove HTML tags and dangerous characters
        return re.sub(r'[<>]', '', v).strip()

# In route handler
@router.post("/galleries")
async def create_gallery(
    request: CreateGalleryRequest,  # Auto-validated
    workspace: Workspace = Depends(get_current_workspace),
):
    # workspace_id from auth, NOT from request
    return await gallery_service.create(request, workspace.id)
```

### File Upload Security

```python
ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"]
MAX_SIZE = 100 * 1024 * 1024  # 100MB

async def validate_upload(file: UploadFile):
    # Check MIME type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Invalid file type: {file.content_type}")

    # Check size
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large (max 100MB)")

    # Verify magic bytes match declared type
    if not verify_magic_bytes(content[:12], file.content_type):
        raise HTTPException(400, "File content doesn't match type")

    await file.seek(0)
    return True
```

## Rate Limiting

```python
# backend/src/app/middleware/rate_limit.py
from slowapi import Limiter

limiter = Limiter(key_func=get_remote_address)

# General API: 100/minute
@router.get("/galleries")
@limiter.limit("100/minute")
async def list_galleries():
    ...

# Auth endpoints: 5/15min
@router.post("/auth/login")
@limiter.limit("5/15minutes")
async def login():
    ...

# AI operations: 30/minute per workspace
@router.post("/ai/analyze")
@limiter.limit("30/minute", key_func=lambda r: r.user.workspace_id)
async def analyze():
    ...
```

## Encryption

```python
# backend/src/app/services/encryption_service.py
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Load key from env - NEVER hardcode
ENCRYPTION_KEY = base64.urlsafe_b64decode(os.environ["ENCRYPTION_KEY"])

def encrypt(plaintext: str) -> str:
    nonce = os.urandom(12)
    aesgcm = AESGCM(ENCRYPTION_KEY)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()

def decrypt(ciphertext: str) -> str:
    data = base64.b64decode(ciphertext)
    nonce, encrypted = data[:12], data[12:]
    aesgcm = AESGCM(ENCRYPTION_KEY)
    return aesgcm.decrypt(nonce, encrypted, None).decode()
```

## PII Protection

```python
# NEVER log PII
logger.info("User registered", extra={"user_id": user.id})  # CORRECT
logger.info("User registered", extra={"email": user.email})  # WRONG

# Mask sensitive data in responses
def mask_email(email: str) -> str:
    local, domain = email.split("@")
    return f"{local[:2]}***@{domain}"
```

## Audit Logging

```python
# backend/src/app/services/audit_service.py

async def audit_log(
    workspace_id: UUID,
    user_id: UUID,
    action: str,
    resource_type: str,
    resource_id: UUID,
    ip_address: str,
    metadata: dict = None,
):
    await db.execute(
        insert(AuditLog).values(
            workspace_id=workspace_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            ip_address=ip_address,
            metadata=metadata or {},
        )
    )

# Usage
await audit_log(
    workspace_id=workspace.id,
    user_id=user.id,
    action="asset.delete",
    resource_type="asset",
    resource_id=asset_id,
    ip_address=request.client.host,
)
```

## Security Checklist

### Pre-Deployment
- [ ] All endpoints require authentication
- [ ] All queries include workspace_id filter
- [ ] Storage keys include workspace_id prefix
- [ ] Input validation on all user inputs
- [ ] File uploads validated (type, size, content)
- [ ] Rate limiting configured
- [ ] No hardcoded secrets or API keys
- [ ] Secrets loaded from environment
- [ ] SQL injection prevented (parameterized queries)
- [ ] XSS prevented (sanitization + CSP)
- [ ] HTTPS enforced
- [ ] Audit logging enabled

### Code Review
- [ ] No PII in logs
- [ ] No secrets in code
- [ ] Proper error handling
- [ ] Authorization before data access
- [ ] Workspace isolation enforced
