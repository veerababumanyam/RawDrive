# Admin Microservice - Quick Start Guide

This guide helps developers get started with the Admin Microservice implementation.

## Overview

The Admin Microservice is a separate Python/FastAPI service that handles platform administration for RawDrive. It runs on port 8001 alongside the main backend (port 8000) and shares PostgreSQL and Redis infrastructure.

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin Dashboard (React)                   │
│                      admin.rawdrive.com                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Admin Service (FastAPI)                      │
│                      Port 8001                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │Identity │ │ Audit   │ │Feature  │ │ DSAR    │   ...     │
│  │  API    │ │Logs API │ │Flags API│ │  API    │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
└─────────────────────────────────────────────────────────────┘
        │                                    │
        ▼                                    ▼
┌───────────────────┐               ┌───────────────────┐
│  PostgreSQL 16    │               │     Redis 7       │
│  (admin_* tables) │               │  (sessions,cache) │
└───────────────────┘               └───────────────────┘
```

## Prerequisites

- Python 3.11+
- PostgreSQL 16 with pgcrypto extension
- Redis 7
- Docker (for local development)
- Existing RawDrive backend running

## Project Structure

```
admin-service/
├── src/
│   ├── api/
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── identity.py          # Auth, admins, invites, roles
│   │   │   ├── support_access.py    # Support sessions, break-glass
│   │   │   ├── audit_logs.py        # Audit log querying
│   │   │   ├── feature_flags.py     # Feature flag management
│   │   │   ├── moderation.py        # Content moderation queue
│   │   │   ├── delegation.py        # Permission delegation
│   │   │   └── dsar.py              # DSAR automation
│   │   └── deps.py                  # Dependency injection
│   ├── core/
│   │   ├── config.py                # Settings (pydantic-settings)
│   │   ├── security.py              # JWT, MFA, session binding
│   │   └── exceptions.py            # Custom exceptions
│   ├── db/
│   │   ├── base.py                  # SQLAlchemy base
│   │   ├── session.py               # Database session
│   │   └── models/                  # ORM models
│   ├── services/
│   │   ├── auth_service.py          # Authentication logic
│   │   ├── admin_service.py         # Admin management
│   │   ├── audit_service.py         # Audit logging
│   │   ├── feature_flag_service.py  # Flag evaluation
│   │   ├── moderation_service.py    # Moderation workflows
│   │   ├── delegation_service.py    # Permission delegation
│   │   ├── dsar_service.py          # DSAR processing
│   │   └── anomaly_service.py       # Anomaly detection
│   ├── workers/
│   │   ├── audit_archiver.py        # Log archival worker
│   │   ├── dsar_processor.py        # DSAR workflow worker
│   │   └── anomaly_detector.py      # Anomaly detection worker
│   └── main.py                      # FastAPI app entry
├── migrations/                      # Alembic migrations
├── tests/
├── pyproject.toml
└── Dockerfile
```

## Quick Setup

### 1. Clone and Setup Environment

```bash
# Create admin-service directory alongside existing services
mkdir -p admin-service
cd admin-service

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate  # Linux/Mac
# or .venv\Scripts\activate  # Windows

# Install dependencies
pip install -e ".[dev]"
```

### 2. Configure Environment

Create `.env` file:

```bash
# Database (shared with main backend)
DATABASE_URL=postgresql://rawdrive:rawdrive@localhost:5432/rawdrive

# Redis (shared with main backend)
REDIS_URL=redis://localhost:6379/0

# JWT Configuration (separate from main backend)
ADMIN_JWT_SECRET=<generate-64-byte-hex>
ADMIN_JWT_ALGORITHM=HS256
ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES=15
ADMIN_REFRESH_TOKEN_EXPIRE_DAYS=7

# MFA
TOTP_ISSUER=RawDrive Admin
TOTP_DIGITS=6
TOTP_INTERVAL=30

# Session Binding (FR-086)
SESSION_IP_CIDR_PREFIX=24  # Allow /24 subnet
SESSION_DEVICE_BINDING=true

# Service Communication
MAIN_BACKEND_URL=http://localhost:8000
SERVICE_TOKEN_SECRET=<shared-secret-with-main-backend>

# Audit Log Retention
AUDIT_ONLINE_RETENTION_DAYS=730  # 2 years
AUDIT_ARCHIVE_ENABLED=true

# Feature Flag Cache
FLAG_CACHE_TTL_SECONDS=30

# Environment
ENVIRONMENT=development
DEBUG=true
```

### 3. Run Database Migrations

```bash
# Ensure PostgreSQL is running
npm run docker:dev:up  # From RawDrive root

# Run admin service migrations
cd admin-service
alembic upgrade head
```

### 4. Start the Service

```bash
# Development mode with auto-reload
uvicorn src.main:app --reload --port 8001

# Or use the provided script
./scripts/run-dev.sh
```

### 5. Verify Installation

```bash
# Health check
curl http://localhost:8001/health

# API docs
open http://localhost:8001/docs
```

## First Steps

### 1. Create Initial Super Admin

```python
# scripts/create_super_admin.py
import asyncio
from src.services.admin_service import AdminService
from src.db.session import get_db

async def create_super_admin():
    async with get_db() as db:
        admin_service = AdminService(db)
        admin = await admin_service.create_admin(
            email="admin@rawdrive.com",
            role="super_admin",
            skip_invite=True  # First admin doesn't need invite
        )
        print(f"Created admin: {admin.admin_id}")
        print(f"MFA setup URL: {admin.mfa_provisioning_uri}")

asyncio.run(create_super_admin())
```

### 2. Test Authentication Flow

```bash
# 1. Login (returns MFA challenge)
curl -X POST http://localhost:8001/admin/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@rawdrive.com",
    "password": "your-password",
    "device_fingerprint": "test-device-123"
  }'

# Response: { "challenge_token": "...", "expires_at": "..." }

# 2. Verify MFA
curl -X POST http://localhost:8001/admin/v1/auth/mfa/verify \
  -H "Content-Type: application/json" \
  -d '{
    "challenge_token": "<from-step-1>",
    "code": "123456"
  }'

# Response: { "access_token": "...", "refresh_token": "...", "admin": {...} }
```

### 3. Create a Feature Flag

```bash
curl -X POST http://localhost:8001/admin/v1/feature-flags \
  -H "Authorization: Bearer <access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "new_upload_ui",
    "name": "New Upload UI",
    "type": "boolean",
    "default_value": false,
    "enabled": false
  }'
```

## Key Implementation Patterns

### Authentication with Session Binding (FR-086)

```python
# src/core/security.py
from dataclasses import dataclass
from ipaddress import ip_network, ip_address

@dataclass
class SessionBinding:
    device_fingerprint_hash: str
    ip_network: str

    def validate(self, fingerprint: str, client_ip: str) -> tuple[bool, str]:
        # Validate device fingerprint
        if hash_fingerprint(fingerprint) != self.device_fingerprint_hash:
            return False, "device_mismatch"

        # Validate IP is in same /24 subnet
        session_network = ip_network(self.ip_network, strict=False)
        if ip_address(client_ip) not in session_network:
            return False, "ip_range_mismatch"

        return True, "valid"
```

### MFA with pyotp

```python
# src/services/auth_service.py
import pyotp

class AuthService:
    def generate_mfa_secret(self) -> tuple[str, str, list[str]]:
        """Generate MFA secret, provisioning URI, and backup codes."""
        secret = pyotp.random_base32()
        totp = pyotp.TOTP(secret)
        uri = totp.provisioning_uri(
            name=email,
            issuer_name=settings.TOTP_ISSUER
        )
        backup_codes = [secrets.token_hex(4).upper() for _ in range(10)]
        return secret, uri, backup_codes

    def verify_mfa(self, secret: str, code: str) -> bool:
        """Verify TOTP code with 1-step window."""
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=1)
```

### Audit Logging with Partitioning

```python
# src/services/audit_service.py
class AuditService:
    async def log(
        self,
        actor_id: UUID,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        success: bool = True,
        details: dict | None = None,
    ) -> None:
        """Log action to partitioned audit table."""
        entry = AuditLogEntry(
            actor_id=actor_id,
            actor_type="admin",
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            success=success,
            severity=self._get_severity(action),
            ip_address=self.request.client.host,
            user_agent=self.request.headers.get("user-agent"),
            details=details or {},
        )
        self.db.add(entry)
        await self.db.commit()

        # Emit event for real-time monitoring
        await self.event_bus.publish("audit.logged", entry.to_dict())
```

### Feature Flag Evaluation with Caching

```python
# src/services/feature_flag_service.py
class FeatureFlagService:
    async def evaluate(
        self,
        flag_key: str,
        context: EvaluationContext,
    ) -> FlagEvaluation:
        """Evaluate flag with Redis caching."""
        # Check cache first
        cache_key = f"flag:{flag_key}:{context.hash()}"
        cached = await self.redis.get(cache_key)
        if cached:
            return FlagEvaluation.from_json(cached)

        # Load flag and evaluate rules
        flag = await self.get_flag(flag_key)
        if not flag or not flag.enabled:
            return FlagEvaluation(
                value=flag.default_value if flag else None,
                reason="disabled" if flag else "not_found",
            )

        # Evaluate targeting rules in order
        for rule in sorted(flag.rules, key=lambda r: r.priority):
            if self._matches_rule(rule, context):
                result = FlagEvaluation(
                    value=self._get_variation_value(flag, rule.variation),
                    reason="rule_match",
                    rule_id=rule.rule_id,
                )
                await self.redis.setex(
                    cache_key,
                    settings.FLAG_CACHE_TTL_SECONDS,
                    result.to_json(),
                )
                return result

        # Default fallback
        return FlagEvaluation(
            value=flag.default_value,
            reason="default",
        )
```

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test file
pytest tests/test_auth_service.py -v

# Run integration tests (requires database)
pytest tests/integration/ -v
```

## Deployment Checklist

### Pre-Production

- [ ] Generate strong secrets for JWT and service tokens
- [ ] Configure proper CORS origins
- [ ] Set up SSL/TLS certificates
- [ ] Configure audit log archival to cold storage
- [ ] Set up monitoring and alerting
- [ ] Create initial super admin account
- [ ] Test MFA flow end-to-end
- [ ] Verify session binding works correctly
- [ ] Test break-glass dual control flow
- [ ] Run load tests on audit log queries

### Production Hardening

- [ ] Enable rate limiting on all endpoints
- [ ] Configure WAF rules
- [ ] Set up log aggregation (CloudWatch/Datadog)
- [ ] Enable audit log encryption at rest
- [ ] Configure backup and disaster recovery
- [ ] Set up anomaly detection thresholds
- [ ] Document runbooks for common operations

## Common Tasks

### Adding a New Admin Role

```python
# Via API
curl -X POST http://localhost:8001/admin/v1/roles \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "content_moderator",
    "description": "Content moderation team",
    "permissions": [
      "moderation:read",
      "moderation:action",
      "audit:read_own"
    ]
  }'
```

### Extending Session Timeout

```python
# In config.py
class Settings(BaseSettings):
    ADMIN_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # Adjust as needed
    ADMIN_REFRESH_TOKEN_EXPIRE_DAYS: int = 7
```

### Querying Audit Logs

```bash
# Search by actor
curl "http://localhost:8001/admin/v1/audit/logs?actor_id=<uuid>&from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer <token>"

# Search by action category
curl "http://localhost:8001/admin/v1/audit/logs?action_category=auth&from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer <token>"
```

## Troubleshooting

### MFA Not Working

1. Check system time is synchronized (NTP)
2. Verify TOTP_INTERVAL matches authenticator app
3. Try with valid_window=2 for clock drift

### Session Binding Failures

1. Check client is sending device fingerprint consistently
2. Verify IP hasn't changed significantly (different /24)
3. Review SESSION_IP_CIDR_PREFIX setting

### Audit Log Performance

1. Ensure partitions are created for current month
2. Check indexes exist on workspace_id, created_at
3. Use date range filters to limit partition scans

### Feature Flag Not Updating

1. Check Redis connection
2. Verify cache TTL (default 30s)
3. Force cache invalidation via event bus

## Resources

- [Spec Document](./spec.md) - Full specification
- [Data Model](./data-model.md) - Database schema
- [Research](./research.md) - Technical decisions
- [API Contracts](./contracts/) - OpenAPI specifications
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [pyotp Docs](https://pyauth.github.io/pyotp/)
