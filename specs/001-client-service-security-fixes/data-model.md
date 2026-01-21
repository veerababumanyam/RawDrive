# Data Model: Client Service Security Remediation

**Feature**: 001-client-service-security-fixes
**Date**: 2026-01-21
**Status**: Complete

## Overview

This document defines the data entities involved in the security remediation. Most entities already exist; this documents the security-relevant fields and new structures needed.

## Entities

### 1. Rate Limit Bucket (Redis)

Rate limiting state stored in Redis for distributed tracking across service instances.

**Key Pattern**: `ratelimit:{identifier_type}:{identifier}:{path}:{window}`

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| identifier_type | string | Either "user" (authenticated) or "ip" (anonymous) |
| identifier | string | User ID (UUID) or IP address |
| path | string | Normalized API path |
| window | int | Unix timestamp divided by window_seconds |
| count | int | Current request count in window |
| ttl | int | Time-to-live in seconds (equals window_seconds) |

**Example Keys**:
```
ratelimit:user:550e8400-e29b-41d4-a716-446655440000:/api/v1/clients:1705845600
ratelimit:ip:192.168.1.100:/api/v1/clients:1705845600
```

**Validation Rules**:
- `identifier` must be valid UUID for user type, valid IP for ip type
- `count` must be non-negative integer
- `ttl` must match the rate limit window for the path

---

### 2. JWT Claims (Existing, Security-Critical)

The JWT token payload contains user identity and permissions used for rate limiting and RBAC.

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sub | string (UUID) | Yes | User ID - primary identity |
| workspace_id | string (UUID) | Yes | Current workspace context |
| email | string | No | User email (may be omitted in access tokens) |
| role | string | Yes | Current role: "viewer", "editor", "admin", "owner" |
| permissions | string[] | Yes | Explicit permission list |
| exp | int | Yes | Token expiration (Unix timestamp) |
| iat | int | Yes | Token issued at (Unix timestamp) |
| jti | string (UUID) | No | JWT ID for revocation tracking |

**Security Notes**:
- `sub` (user_id) is the ONLY trusted source for rate limiting identity
- `role` determines permission set but explicit `permissions` array takes precedence
- Token signature MUST be validated before trusting any claims

---

### 3. Permission (Conceptual)

Permissions are not stored in client-service database but are defined as constants for RBAC enforcement.

**Permission Format**: `{resource}:{action}`

**Client-Service Permissions**:
| Permission | Description | Roles |
|------------|-------------|-------|
| clients:read | View client list and details | viewer, editor, admin |
| clients:write | Create and update clients | editor, admin |
| clients:delete | Delete individual clients | editor, admin |
| clients:bulk_delete | Bulk delete multiple clients | admin |
| clients:export | GDPR data export | admin |
| clients:import | Import clients from CSV/Excel | admin |

**Permission Matrix Constant**:
```python
PERMISSION_MATRIX = {
    "viewer": ["clients:read"],
    "editor": ["clients:read", "clients:write", "clients:delete"],
    "admin": ["clients:read", "clients:write", "clients:delete",
              "clients:bulk_delete", "clients:export", "clients:import"],
}
```

---

### 4. Audit Record (Existing, Enhanced)

Audit records in the `audit_logs` table. Enhanced with field-level PII tracking.

**Table**: `audit_logs` (shared database)

**Fields**:
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| audit_id | UUID | No | Primary key |
| workspace_id | UUID | No | Workspace isolation |
| actor_user_id | UUID | Yes | User who performed action (null for system) |
| actor_type | string | No | "user" or "system" |
| action | string | No | "create", "update", "delete", "export", "restore", **"access"** (NEW) |
| target_type | string | No | Entity type: "client", "contact", "address" |
| target_id | string | No | Entity ID |
| ip_address | string | Yes | Client IP address |
| user_agent | string | Yes | Browser/client user agent |
| metadata | jsonb | Yes | Additional context (see below) |
| created_at | timestamp | No | When action occurred |

**Enhanced Metadata Schema for PII Access**:
```json
{
  "action": "access",
  "fields_accessed": ["email", "phone", "date_of_birth"],
  "record_count": 1,
  "query_type": "single"
}
```

**Validation Rules**:
- `workspace_id` is required and must exist
- `action` must be one of: create, update, delete, export, restore, access
- `metadata` must be valid JSON
- `fields_accessed` in metadata should only contain PII field names

---

### 5. Rate Limit Configuration (Constant)

Rate limits are defined as constants, not stored in database.

**Structure**:
```python
@dataclass
class RateLimitConfig:
    pattern: str           # URL pattern with wildcards
    requests: int          # Max requests
    window_seconds: int    # Time window
    applies_to: str        # "authenticated", "anonymous", "both"
```

**Client-Service Configurations**:
| Pattern | Limit | Window | Applies To |
|---------|-------|--------|------------|
| /api/v1/workspaces/*/clients | 100 | 60s | both |
| /api/v1/workspaces/*/clients/search | 100 | 60s | both |
| /api/v1/workspaces/*/clients/* | 200 | 60s | both |
| /api/v1/workspaces/*/clients/import | 10 | 3600s | authenticated |
| /api/v1/workspaces/*/clients/export | 20 | 3600s | authenticated |
| /api/v1/workspaces/*/clients/bulk/* | 30 | 60s | authenticated |
| /api/v1/workspaces/*/clients/*/avatar | 20 | 60s | authenticated |
| default | 100 | 60s | both |

---

### 6. Timeout Configuration (Constant)

Request timeout settings defined as constants.

**Structure**:
```python
@dataclass
class TimeoutConfig:
    read_timeout: float = 30.0        # GET, HEAD, OPTIONS
    write_timeout: float = 60.0       # POST, PUT, PATCH, DELETE
    route_overrides: dict[str, float] # Path prefix -> timeout
```

**Route Overrides**:
| Path Prefix | Timeout | Reason |
|-------------|---------|--------|
| /api/v1/workspaces/*/clients/import | 120s | Large file processing |
| /api/v1/workspaces/*/clients/export | 120s | Large data export |
| /api/v1/workspaces/*/clients/bulk/* | 90s | Bulk operations |

---

### 7. PII Field Registry (Constant)

List of fields considered Personally Identifiable Information for audit logging.

**Fields by Entity**:

| Entity | PII Fields |
|--------|------------|
| Client | email, phone, mobile_phone, date_of_birth, tax_id |
| Contact | name, email, phone, relationship |
| Address | street_address, city, postal_code, country |
| Communication | recipient_email, recipient_phone, message_content |

**Implementation**:
```python
PII_FIELDS = {
    "client": {"email", "phone", "mobile_phone", "date_of_birth", "tax_id"},
    "contact": {"name", "email", "phone", "relationship"},
    "address": {"street_address", "city", "postal_code", "country"},
    "communication": {"recipient_email", "recipient_phone", "message_content"},
}
```

---

## Entity Relationships

```
┌─────────────────┐     validates      ┌─────────────────┐
│   JWT Token     │─────────────────▶ │   Permission    │
│   (user_id,     │                    │   Matrix        │
│    role)        │                    │                 │
└────────┬────────┘                    └─────────────────┘
         │
         │ identifies
         ▼
┌─────────────────┐     tracks         ┌─────────────────┐
│  Rate Limit     │◀───────────────── │   Request       │
│  Bucket         │                    │                 │
│  (Redis)        │                    └─────────────────┘
└─────────────────┘
         │
         │ if blocked/timeout
         ▼
┌─────────────────┐     logs           ┌─────────────────┐
│  Audit Record   │◀───────────────── │  Security Event │
│  (PostgreSQL)   │                    │                 │
└─────────────────┘                    └─────────────────┘
```

---

## State Transitions

### Rate Limit State

```
[Within Limit] ─── request ──▶ [Counting]
       ▲                            │
       │                            │ exceeds limit
       │                            ▼
       │◀─── window expires ─── [Blocked]
```

### Permission Check State

```
[Request] ──▶ [Extract JWT] ──▶ [Validate Role] ──▶ [Check Permission]
                   │                                       │
                   │ invalid                               │ denied
                   ▼                                       ▼
              [401 Unauthorized]                    [403 Forbidden]
```

---

## Database Changes

**No schema migrations required.** All entities either:
1. Already exist (`audit_logs` table)
2. Are stored in Redis (rate limit buckets)
3. Are defined as code constants (permissions, timeouts, PII fields)

The audit logging enhancement uses the existing `metadata` JSONB column for field-level tracking.
