# Design Document: Authentication & Infrastructure Foundation

## Overview

This design document describes the complete authentication, authorization, and infrastructure foundation for RawDrive. The system is built on FastAPI (Python) with PostgreSQL + pgvector for data storage, Redis for caching/sessions, and FastMCP for AI tool integrations. The architecture follows multi-tenant principles with workspace-scoped data isolation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Layer                                 │
│  React Frontend (5173) │ Mobile Apps │ MCP Clients                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                      API Gateway Layer                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │
│  │ FastAPI (8000)  │  │ FastMCP (8001)  │  │ Nginx (80/443)  │     │
│  │ REST API        │  │ MCP Protocol    │  │ Reverse Proxy   │     │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘     │
└───────────┼────────────────────┼────────────────────┼───────────────┘
            │                    │                    │
┌───────────▼────────────────────▼────────────────────▼───────────────┐
│                      Middleware Layer                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │   Auth   │ │   RBAC   │ │  Rate    │ │  CORS    │ │  Audit   │  │
│  │Middleware│ │Middleware│ │ Limiter  │ │Middleware│ │  Logger  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                      Service Layer                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ AuthService  │ │WorkspaceServ │ │ RBACService  │ │TrialService│ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ UserService  │ │ AuditService │ │SessionService│ │InviteServ  │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│                      Data Layer                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐                 │
│  │ PostgreSQL (5432)    │  │ Redis (6379)         │                 │
│  │ + pgvector extension │  │ Sessions, Cache,     │                 │
│  │ Primary data store   │  │ Rate limits, Queues  │                 │
│  └──────────────────────┘  └──────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. FastAPI Application (`backend/src/main.py`)

The main FastAPI application with dependency injection and middleware configuration.

```python
# Core application structure
app/
├── main.py              # FastAPI app initialization
├── config/
│   ├── settings.py      # Pydantic Settings configuration
│   └── database.py      # Database connection pool
├── api/
│   └── v1/
│       ├── auth.py      # Authentication endpoints
│       ├── users.py     # User management
│       ├── workspaces.py # Workspace management
│       ├── roles.py     # RBAC endpoints
│       └── admin.py     # Platform admin endpoints
├── services/
│   ├── auth_service.py
│   ├── user_service.py
│   ├── workspace_service.py
│   ├── rbac_service.py
│   └── audit_service.py
├── models/
│   ├── user.py
│   ├── workspace.py
│   ├── role.py
│   └── audit.py
├── middleware/
│   ├── auth.py
│   ├── rbac.py
│   ├── rate_limit.py
│   └── audit.py
└── utils/
    ├── security.py      # Password hashing, JWT
    └── validators.py    # Input validation
```

### 2. Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as FastAPI
    participant G as Google OAuth
    participant DB as PostgreSQL
    participant R as Redis

    Note over C,R: Local Email/Password Flow
    C->>A: POST /api/v1/auth/signup
    A->>A: Validate input, hash password
    A->>DB: Create user, identity, workspace
    A->>R: Store email verification token
    A-->>C: 201 Created (verification required)

    C->>A: POST /api/v1/auth/login
    A->>DB: Verify credentials
    A->>R: Create session, store refresh token
    A-->>C: 200 OK (access_token, refresh_token)

    Note over C,R: Google OAuth Flow
    C->>A: GET /api/v1/auth/oauth/google/start
    A-->>C: Redirect to Google
    C->>G: Authorize
    G-->>C: Redirect with code
    C->>A: GET /api/v1/auth/oauth/google/callback
    A->>G: Exchange code for tokens
    A->>DB: Create/link user
    A->>R: Create session
    A-->>C: 200 OK (access_token, refresh_token)
```

### 3. RBAC Permission Model

```mermaid
graph TD
    subgraph Platform Roles
        SA[Super Admin]
        PA[Platform Admin]
        SUA[Support Admin]
        BA[Billing Admin]
        CM[Content Moderator]
        SEA[Security Admin]
        OA[Observability Admin]
        AU[Auditor]
        PRA[Product Admin]
    end

    subgraph Workspace Roles
        WO[Workspace Owner]
        WA[Workspace Admin]
        SU[Staff User]
        CV[Client Viewer]
    end

    subgraph Permissions
        P1[platform:*]
        P2[workspace:*]
        P3[members:*]
        P4[galleries:*]
        P5[assets:*]
    end

    SA --> P1
    WO --> P2
    WO --> P3
    WO --> P4
    WO --> P5
    WA --> P2
    WA --> P3
    SU --> P4
    SU --> P5
    CV --> P4
```

### 4. Multi-Tenant Data Isolation

Every database query MUST include workspace_id filtering:

```python
# Repository pattern with workspace scoping
class GalleryRepository:
    async def get_all(self, workspace_id: UUID) -> list[Gallery]:
        query = """
            SELECT * FROM galleries 
            WHERE workspace_id = $1 
            AND deleted_at IS NULL
        """
        return await self.db.fetch_all(query, workspace_id)
    
    async def get_by_id(self, workspace_id: UUID, gallery_id: UUID) -> Gallery:
        query = """
            SELECT * FROM galleries 
            WHERE workspace_id = $1 AND gallery_id = $2
            AND deleted_at IS NULL
        """
        return await self.db.fetch_one(query, workspace_id, gallery_id)
```

## Data Models

### Core Entities

```sql
-- Users (global, not workspace-scoped)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    preferred_language VARCHAR(10) DEFAULT 'en-IN',
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    disabled_at TIMESTAMPTZ
);

-- User Identities (supports multiple auth providers)
CREATE TABLE user_identities (
    identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'local', 'google'
    provider_user_id VARCHAR(255), -- Google sub claim
    email VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255), -- Only for provider='local'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    UNIQUE(provider, provider_user_id),
    UNIQUE(provider, email)
);

-- Workspaces (tenants)
CREATE TABLE workspaces (
    workspace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(50) DEFAULT 'active', -- active, disabled, deleted
    default_language VARCHAR(10) DEFAULT 'en-IN',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspace Memberships
CREATE TABLE workspace_memberships (
    membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active', -- active, invited, suspended
    invited_by_user_id UUID REFERENCES users(user_id),
    invited_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- Roles (workspace-scoped)
CREATE TABLE roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

-- Member Role Assignments
CREATE TABLE member_roles (
    member_role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id UUID NOT NULL REFERENCES workspace_memberships(membership_id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by_user_id UUID REFERENCES users(user_id),
    UNIQUE(membership_id, role_id)
);

-- Platform Roles (global admin roles)
CREATE TABLE platform_roles (
    role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    is_system BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Platform Role Assignments
CREATE TABLE user_platform_roles (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES platform_roles(role_id) ON DELETE CASCADE,
    granted_by_user_id UUID REFERENCES users(user_id),
    granted_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    UNIQUE(user_id, role_id)
);

-- Subscriptions
CREATE TABLE plans (
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE, -- free, starter, professional, business, enterprise
    name VARCHAR(100) NOT NULL,
    price_monthly DECIMAL(10,2) NOT NULL,
    price_annual DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'INR',
    storage_bytes BIGINT NOT NULL,
    max_galleries INT NOT NULL,
    max_clients INT NOT NULL,
    max_team_members INT NOT NULL,
    ai_credits_monthly INT NOT NULL,
    features JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workspace_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE UNIQUE,
    plan_id UUID NOT NULL REFERENCES plans(plan_id),
    status VARCHAR(50) DEFAULT 'trialing', -- trialing, active, past_due, canceled, paused
    trial_started_at TIMESTAMPTZ,
    trial_expires_at TIMESTAMPTZ,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    billing_provider VARCHAR(50), -- razorpay, stripe, manual
    billing_customer_id VARCHAR(255),
    billing_subscription_id VARCHAR(255),
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(workspace_id),
    actor_user_id UUID REFERENCES users(user_id),
    actor_type VARCHAR(50) NOT NULL, -- user, share_link, api_key, system
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(100),
    target_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions
CREATE TABLE sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(workspace_id),
    refresh_token_hash VARCHAR(255) NOT NULL,
    device_info JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

-- Invitations
CREATE TABLE invitations (
    invitation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role_ids UUID[] NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    invited_by_user_id UUID NOT NULL REFERENCES users(user_id),
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, expired, revoked
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ
);

-- Enable pgvector for AI embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Vector embeddings table for future AI features
CREATE TABLE embeddings (
    embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL, -- photo, gallery, user
    entity_id UUID NOT NULL,
    model VARCHAR(100) NOT NULL,
    embedding vector(1536), -- OpenAI ada-002 dimension
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, entity_type, entity_id, model)
);

CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_identities_user ON user_identities(user_id);
CREATE INDEX idx_user_identities_provider ON user_identities(provider, email);
CREATE INDEX idx_workspaces_slug ON workspaces(slug);
CREATE INDEX idx_workspace_memberships_workspace ON workspace_memberships(workspace_id);
CREATE INDEX idx_workspace_memberships_user ON workspace_memberships(user_id);
CREATE INDEX idx_roles_workspace ON roles(workspace_id);
CREATE INDEX idx_audit_logs_workspace_time ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token_hash);
CREATE INDEX idx_invitations_workspace ON invitations(workspace_id);
CREATE INDEX idx_invitations_token ON invitations(token_hash);
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Workspace Data Isolation
*For any* database query on customer data tables, the query MUST include a workspace_id filter matching the authenticated user's workspace, ensuring no cross-tenant data leakage.
**Validates: Requirements 1.2, 6.2, 14.1, 14.2, 14.5**

### Property 2: Password Hashing Consistency
*For any* user signup with local authentication, the stored password_hash MUST be a valid Argon2id hash that verifies against the original password.
**Validates: Requirements 3.1, 3.5**

### Property 3: JWT Token Claims Completeness
*For any* issued JWT access token, the payload MUST contain user_id, workspace_id, and permissions claims with valid values.
**Validates: Requirements 5.1**

### Property 4: Token Refresh Rotation
*For any* successful token refresh operation, the old refresh token MUST be invalidated and a new refresh token MUST be issued.
**Validates: Requirements 5.3**

### Property 5: Authentication Error Opacity
*For any* failed authentication attempt (invalid email or password), the error response MUST NOT reveal which field was incorrect.
**Validates: Requirements 3.3**

### Property 6: Rate Limit Enforcement
*For any* sequence of requests exceeding the configured rate limit, subsequent requests MUST receive 429 status with Retry-After header.
**Validates: Requirements 2.2, 12.2**

### Property 7: Permission Union Computation
*For any* user with multiple roles, the effective permissions MUST be the union of all permissions from all assigned roles.
**Validates: Requirements 7.3**

### Property 8: Cache Invalidation on Role Update
*For any* role permission update, the cached permissions for all members with that role MUST be invalidated within the configured TTL.
**Validates: Requirements 2.3, 7.4**

### Property 9: Session Termination Token Invalidation
*For any* session termination (logout or remote termination), all associated tokens MUST be immediately invalidated in Redis.
**Validates: Requirements 2.4, 23.3**

### Property 10: Workspace Creation Trial Assignment
*For any* newly created workspace, a subscription record MUST be created with status='trialing' and trial_expires_at set to 30 days from creation.
**Validates: Requirements 6.3, 21.1**

### Property 11: Tier Limit Enforcement
*For any* workspace at or exceeding its tier storage/gallery limit, new uploads/galleries MUST be rejected with appropriate error.
**Validates: Requirements 9.1, 9.2, 9.3**

### Property 12: Audit Log Creation
*For any* authentication event or permission-sensitive action, an audit log entry MUST be created with actor, action, and metadata.
**Validates: Requirements 11.1, 11.2**

### Property 13: Deterministic Test User Seeding
*For any* execution of the seed script, the same test users with the same UUIDs MUST be created (idempotent seeding).
**Validates: Requirements 10.1, 10.2**

### Property 14: OAuth Account Linking
*For any* Google OAuth callback with an email matching an existing user, the Google identity MUST be linked to the existing user account.
**Validates: Requirements 4.4**

### Property 15: Invitation Token Expiry
*For any* invitation older than 7 days, the status MUST be 'expired' and acceptance MUST be rejected.
**Validates: Requirements 28.4**

### Property 16: Maximum Session Enforcement
*For any* user with more than 5 active sessions, the oldest session MUST be terminated when a new session is created.
**Validates: Requirements 23.4**

### Property 17: Email Verification State
*For any* user who clicks a valid verification link, the email_verified flag MUST be set to true and email_verified_at MUST be set.
**Validates: Requirements 22.2**

### Property 18: Password Change Token Revocation
*For any* password change operation, all existing refresh tokens for that user MUST be invalidated.
**Validates: Requirements 5.4**

### Property 19: API Route Versioning
*For any* API endpoint, the path MUST be prefixed with /api/v1/.
**Validates: Requirements 24.1**

### Property 20: Error Response Consistency
*For any* API error, the response MUST follow the standard error schema with status code, error code, and message.
**Validates: Requirements 17.5, 27.1, 27.2, 27.3, 27.4, 27.5**

### Property 21: MCP Tool Authentication
*For any* MCP tool invocation, the caller's authentication and workspace permissions MUST be validated before execution.
**Validates: Requirements 18.2, 18.3**

### Property 22: Background Task Retry
*For any* failed background task, retry MUST occur with exponential backoff up to the configured maximum retries.
**Validates: Requirements 20.3**

### Property 23: Configuration Fail-Fast
*For any* missing required configuration value, application startup MUST fail with a clear error message.
**Validates: Requirements 25.2**

### Property 24: Sensitive Data Masking
*For any* log entry containing passwords, tokens, or PII, the sensitive values MUST be masked.
**Validates: Requirements 12.5, 25.5**

## Error Handling

### Error Response Schema

```python
class ErrorResponse(BaseModel):
    status: int
    code: str
    message: str
    details: Optional[dict] = None
    correlation_id: str

# Example error codes
AUTH_INVALID_CREDENTIALS = "AUTH_INVALID_CREDENTIALS"
AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED"
AUTH_TOKEN_INVALID = "AUTH_TOKEN_INVALID"
AUTH_MFA_REQUIRED = "AUTH_MFA_REQUIRED"
FORBIDDEN = "FORBIDDEN"
NOT_FOUND = "NOT_FOUND"
VALIDATION_ERROR = "VALIDATION_ERROR"
RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
WORKSPACE_DISABLED = "WORKSPACE_DISABLED"
TRIAL_EXPIRED = "TRIAL_EXPIRED"
STORAGE_LIMIT_EXCEEDED = "STORAGE_LIMIT_EXCEEDED"
```

### HTTP Status Code Mapping

| Scenario | Status Code | Error Code |
|----------|-------------|------------|
| Invalid credentials | 401 | AUTH_INVALID_CREDENTIALS |
| Token expired | 401 | AUTH_TOKEN_EXPIRED |
| Missing/invalid token | 401 | AUTH_TOKEN_INVALID |
| Insufficient permissions | 403 | FORBIDDEN |
| Resource not found | 404 | NOT_FOUND |
| Validation failed | 422 | VALIDATION_ERROR |
| Rate limit exceeded | 429 | RATE_LIMIT_EXCEEDED |
| Internal error | 500 | INTERNAL_ERROR |

## Testing Strategy

### Property-Based Testing

We will use **Hypothesis** for property-based testing in Python. Each correctness property will be implemented as a property-based test.

```python
from hypothesis import given, strategies as st
from hypothesis.stateful import RuleBasedStateMachine, rule

# Example: Property 1 - Workspace Data Isolation
@given(
    workspace_id=st.uuids(),
    other_workspace_id=st.uuids(),
    gallery_data=st.builds(GalleryCreate, name=st.text(min_size=1, max_size=100))
)
def test_workspace_isolation(workspace_id, other_workspace_id, gallery_data):
    """
    Feature: auth-infrastructure, Property 1: Workspace Data Isolation
    For any database query, results must only include data from the user's workspace.
    """
    assume(workspace_id != other_workspace_id)
    
    # Create gallery in workspace_id
    gallery = create_gallery(workspace_id, gallery_data)
    
    # Query from other_workspace_id should not return the gallery
    results = list_galleries(other_workspace_id)
    assert gallery.gallery_id not in [g.gallery_id for g in results]
```

### Unit Testing

Unit tests will cover:
- Individual service methods
- Utility functions (password hashing, JWT generation)
- Input validation
- Error handling

### Integration Testing

Integration tests will cover:
- Full authentication flows (signup, login, OAuth)
- RBAC permission enforcement
- Multi-tenant data isolation
- API endpoint behavior

### Test Configuration

```python
# pytest.ini
[pytest]
minversion = 7.0
addopts = -ra -q --hypothesis-show-statistics
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*

# Hypothesis settings
hypothesis_profile = ci
```

## Static Test Users

All test users use password: `Test@123`

### Tier Test Users

| Email | UUID | Tier | Workspace |
|-------|------|------|-----------|
| free@test.rawdrive.in | 11111111-1111-1111-1111-111111111001 | Free | test-free-workspace |
| starter@test.rawdrive.in | 11111111-1111-1111-1111-111111111002 | Starter | test-starter-workspace |
| professional@test.rawdrive.in | 11111111-1111-1111-1111-111111111003 | Professional | test-professional-workspace |
| business@test.rawdrive.in | 11111111-1111-1111-1111-111111111004 | Business | test-business-workspace |
| enterprise@test.rawdrive.in | 11111111-1111-1111-1111-111111111005 | Enterprise | test-enterprise-workspace |

### Platform Admin Test Users

| Email | UUID | Role |
|-------|------|------|
| superadmin@test.rawdrive.in | 22222222-2222-2222-2222-222222222001 | Super Admin |
| platformadmin@test.rawdrive.in | 22222222-2222-2222-2222-222222222002 | Platform Admin |
| supportadmin@test.rawdrive.in | 22222222-2222-2222-2222-222222222003 | Support Admin |
| billingadmin@test.rawdrive.in | 22222222-2222-2222-2222-222222222004 | Billing Admin |
| contentmod@test.rawdrive.in | 22222222-2222-2222-2222-222222222005 | Content Moderator |
| securityadmin@test.rawdrive.in | 22222222-2222-2222-2222-222222222006 | Security Admin |
| observabilityadmin@test.rawdrive.in | 22222222-2222-2222-2222-222222222007 | Observability Admin |
| auditor@test.rawdrive.in | 22222222-2222-2222-2222-222222222008 | Auditor (Read-only) |
| productadmin@test.rawdrive.in | 22222222-2222-2222-2222-222222222009 | Product Admin |

### Workspace Role Test Users

| Email | UUID | Role | Workspace |
|-------|------|------|-----------|
| workspaceowner@test.rawdrive.in | 33333333-3333-3333-3333-333333333001 | Workspace Owner | test-roles-workspace |
| workspaceadmin@test.rawdrive.in | 33333333-3333-3333-3333-333333333002 | Workspace Admin | test-roles-workspace |
| staffuser@test.rawdrive.in | 33333333-3333-3333-3333-333333333003 | Staff User | test-roles-workspace |
| clientviewer@test.rawdrive.in | 33333333-3333-3333-3333-333333333004 | Client Viewer | test-roles-workspace |

## Port Assignments

| Service | Port | Description |
|---------|------|-------------|
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Cache, sessions, queues |
| FastAPI Backend | 8000 | REST API |
| FastMCP Server | 8001 | MCP Protocol |
| Frontend Dev | 5173 | Vite dev server |
| Frontend Preview | 4173 | Vite preview |
| Nginx | 80/443 | Reverse proxy (production) |

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql+asyncpg://rawdrive:rawdrive@localhost:5432/rawdrive
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=rawdrive
POSTGRES_USER=rawdrive
POSTGRES_PASSWORD=rawdrive

# Redis
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT (Ed25519 / EdDSA)
JWT_SECRET=<64-byte-hex>
JWT_REFRESH_SECRET=<64-byte-hex>
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
JWT_ALGORITHM=EdDSA
JWT_PRIVATE_KEY_PATH=/secrets/jwtEd25519.key
JWT_PUBLIC_KEY_PATH=/secrets/jwtEd25519.key.pub

# Google OAuth
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/oauth/google/callback

# Application
APP_ENV=development
APP_DEBUG=true
CORS_ORIGINS=http://localhost:5173,http://localhost:4173

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE=10
```

### Pydantic Settings

```python
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Database
    database_url: str
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "rawdrive"
    postgres_user: str = "rawdrive"
    postgres_password: str
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # JWT
    jwt_secret: str
    jwt_refresh_secret: str
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 7
    jwt_algorithm: str = "EdDSA"
    
    # Google OAuth
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str
    
    # Application
    app_env: str = "development"
    app_debug: bool = False
    cors_origins: list[str] = ["http://localhost:5173"]
    
    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_requests_per_minute: int = 60
    
    class Config:
        env_file = ".env"
        case_sensitive = False

@lru_cache
def get_settings() -> Settings:
    return Settings()
```
