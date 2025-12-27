# Admin Microservice Architecture

**Version**: 1.0 Draft
**Last Updated**: 2025-12-27
**Status**: Proposed

## Overview

The Admin Microservice is a dedicated service for platform administration functionality, extracted from the RawDrive monolithic backend. It provides secure, auditable platform management capabilities while maintaining integration with the existing system.

## Architecture Diagram

```
                                    ┌─────────────────────────────────┐
                                    │        Admin Console UI         │
                                    │      (React/TypeScript)         │
                                    └─────────────┬───────────────────┘
                                                  │
                                                  │ HTTPS
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Nginx Ingress / API Gateway                         │
│                         (Route by path: /admin/* → Admin Service)                │
└────────────┬────────────────────────────────────────────────────┬───────────────┘
             │                                                    │
             │ /api/v1/admin/*                                   │ /api/v1/*
             ▼                                                    ▼
┌────────────────────────────┐                    ┌────────────────────────────┐
│   Admin Microservice       │                    │      Main Backend          │
│   (Python/FastAPI)         │◄───────────────────│     (Python/FastAPI)       │
│   Port: 8001               │    Internal API    │      Port: 8000            │
│                            │                    │                            │
│ ┌────────────────────────┐ │                    │ ┌────────────────────────┐ │
│ │ Admin Identity & Auth  │ │                    │ │ User Management        │ │
│ │ Role Management        │ │                    │ │ Workspace Management   │ │
│ │ Support Access         │ │                    │ │ Gallery/Asset Service  │ │
│ │ Audit Logging          │ │                    │ │ Upload Service         │ │
│ │ Feature Flags          │ │                    │ │ Storage Service        │ │
│ │ Platform Config        │ │                    │ │ AI Integration         │ │
│ │ Moderation Queue       │ │                    │ └────────────────────────┘ │
│ │ Analytics Service      │ │                    │                            │
│ └────────────────────────┘ │                    └────────────┬───────────────┘
│                            │                                 │
└────────────┬───────────────┘                                 │
             │                                                 │
             └──────────────────────┬──────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │        Shared Infrastructure   │
                    │                               │
                    │  ┌─────────────────────────┐  │
                    │  │  PostgreSQL 16          │  │
                    │  │  (Shared DB, separate   │  │
                    │  │   admin_* tables)       │  │
                    │  └─────────────────────────┘  │
                    │                               │
                    │  ┌─────────────────────────┐  │
                    │  │  Redis 7                │  │
                    │  │  (Sessions, cache,      │  │
                    │  │   pub/sub events)       │  │
                    │  └─────────────────────────┘  │
                    │                               │
                    └───────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │     Observability Stack       │
                    │  ┌────────┐ ┌────────┐        │
                    │  │ Loki   │ │Grafana │        │
                    │  └────────┘ └────────┘        │
                    └───────────────────────────────┘
```

## Service Boundaries

### Admin Microservice Owns

| Domain | Description | Data Tables |
|--------|-------------|-------------|
| Admin Identity | Platform admin accounts and authentication | `platform_admins`, `admin_invites` |
| Role Management | Platform roles and permission assignments | `platform_roles`, `platform_permissions`, `role_permissions`, `user_platform_roles` |
| Support Access | Time-boxed workspace access sessions | `support_access_sessions`, `support_access_logs` |
| Audit Logging | Immutable admin action logs | `admin_audit_logs` |
| Feature Flags | Feature rollout configuration | `feature_flags`, `feature_flag_overrides` |
| Platform Config | System-wide configuration | `platform_config` |
| Content Moderation | Moderation queue and actions | `moderation_queue`, `moderation_actions` |
| Admin Analytics | Aggregated analytics for admin dashboards | (computed from other sources) |

### Admin Microservice Queries (Read-Only)

| Domain | Source | Purpose |
|--------|--------|---------|
| Users | Main Backend API | User lookup, profile viewing |
| Workspaces | Main Backend API | Workspace listing, metadata |
| Subscriptions | Main Backend API | Billing info, tier details |
| Storage Metrics | Main Backend API | Usage statistics |
| System Metrics | Prometheus/Grafana APIs | Health dashboards |
| Logs | Loki API | Log search and viewing |

## Communication Patterns

### Synchronous (REST APIs)

```
┌────────────────────┐         ┌────────────────────┐
│  Admin Console     │ ──────► │  Admin Microservice│
│  (Frontend)        │  HTTPS  │  (External API)    │
└────────────────────┘         └─────────┬──────────┘
                                         │
                                         │ Internal API
                                         │ (Service Token)
                                         ▼
                               ┌────────────────────┐
                               │   Main Backend     │
                               │   (Internal API)   │
                               └────────────────────┘
```

**Authentication Flow**:
1. Admin Console authenticates with Admin Microservice using JWT
2. JWT contains platform admin claims (roles, permissions)
3. Admin Microservice validates JWT and checks permissions
4. For cross-service calls, Admin Microservice uses service-to-service token

### Asynchronous (Events)

```
┌────────────────────┐         ┌────────────────────┐
│   Main Backend     │ ──────► │       Redis        │
│                    │ publish │     Pub/Sub        │
└────────────────────┘         └─────────┬──────────┘
                                         │
                                         │ subscribe
                                         ▼
                               ┌────────────────────┐
                               │ Admin Microservice │
                               │   (Event Handler)  │
                               └────────────────────┘
```

**Events Published by Main Backend**:
- `user.created` - New user registration
- `workspace.created` - New workspace created
- `subscription.changed` - Subscription tier changed
- `content.flagged` - Content flagged for moderation
- `security.alert` - Security-relevant event

**Admin Microservice Subscribes** to update:
- Analytics aggregations
- Moderation queue
- Audit logs (for high-volume events)

## Database Schema (Admin Tables)

### New Tables

```sql
-- Platform admin identity (separate from regular users)
CREATE TABLE admin_platform_admins (
    admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id),
    mfa_enabled BOOLEAN NOT NULL DEFAULT false,
    mfa_secret_encrypted TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id),
    disabled_at TIMESTAMPTZ,
    disabled_by UUID REFERENCES users(user_id),
    last_login_at TIMESTAMPTZ
);

-- Admin invite tokens
CREATE TABLE admin_invites (
    invite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    role_template VARCHAR(50) NOT NULL,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES users(user_id)
);

-- Platform permissions (canonical list)
CREATE TABLE admin_platform_permissions (
    permission_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50) NOT NULL
);

-- Role to permission mapping
CREATE TABLE admin_role_permissions (
    role_id UUID NOT NULL REFERENCES platform_roles(role_id),
    permission_id INTEGER NOT NULL REFERENCES admin_platform_permissions(permission_id),
    PRIMARY KEY (role_id, permission_id)
);

-- Immutable audit log
CREATE TABLE admin_audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_id UUID NOT NULL,
    actor_email VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    before_state JSONB,
    after_state JSONB,
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT
);

-- Indexes for audit log queries
CREATE INDEX idx_audit_logs_actor ON admin_audit_logs(actor_id, timestamp);
CREATE INDEX idx_audit_logs_action ON admin_audit_logs(action, timestamp);
CREATE INDEX idx_audit_logs_resource ON admin_audit_logs(resource_type, resource_id, timestamp);
CREATE INDEX idx_audit_logs_timestamp ON admin_audit_logs(timestamp);

-- Feature flags
CREATE TABLE admin_feature_flags (
    flag_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
    target_user_ids UUID[],
    target_workspace_ids UUID[],
    target_plan_codes VARCHAR(50)[],
    scheduled_enable_at TIMESTAMPTZ,
    scheduled_disable_at TIMESTAMPTZ,
    error_threshold_percent INTEGER,
    auto_rollback BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(user_id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(user_id)
);

-- Platform configuration
CREATE TABLE admin_platform_config (
    config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value_encrypted TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    is_sensitive BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(user_id)
);

-- Content moderation queue
CREATE TABLE admin_moderation_queue (
    queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(50) NOT NULL,
    content_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    flagged_reason VARCHAR(100) NOT NULL,
    flagged_by VARCHAR(50) NOT NULL, -- 'ai', 'user_report', 'system'
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(user_id),
    action_taken VARCHAR(50),
    notes TEXT
);

CREATE INDEX idx_moderation_queue_status ON admin_moderation_queue(status, severity, submitted_at);
```

## Security Model

### Authentication

1. **Admin JWT Token**: Contains platform admin claims
   - `platform_roles`: Array of assigned role names
   - `platform_permissions`: Cached permission set (for performance)
   - `mfa_verified`: Boolean indicating MFA status
   - `mfa_verified_at`: Timestamp of last MFA verification

2. **Session Management**:
   - Access tokens: 15 minutes (same as main app)
   - Admin sessions require fresh MFA for sensitive operations (within last 5 minutes)
   - Sessions stored in Redis with admin prefix

### Authorization

```
Request → JWT Validation → Permission Check → Action
                              ↓
                    ┌─────────────────────┐
                    │ Permission Matrix   │
                    │                     │
                    │ Action → Required   │
                    │ list_admins →       │
                    │   platform:admins:  │
                    │   read              │
                    │                     │
                    │ grant_role →        │
                    │   platform:admins:  │
                    │   write + step-up   │
                    │                     │
                    └─────────────────────┘
```

### Audit Trail

Every admin action is logged with:
- WHO: Actor ID and email
- WHAT: Action type and resource
- WHEN: Timestamp
- WHERE: IP address and user agent
- HOW: Request ID for tracing
- RESULT: Success/failure and any error message

## Deployment Configuration

### Docker Compose Addition

```yaml
admin-service:
  build:
    context: ../../admin-service
    dockerfile: Dockerfile
  container_name: rawdrive-admin-service
  restart: unless-stopped
  env_file:
    - ../../.env
  environment:
    DATABASE_URL: postgresql+asyncpg://rawdrive:rawdrive@postgres:5432/rawdrive
    REDIS_URL: redis://redis:6379/0
    MAIN_BACKEND_URL: http://backend:8000
    SERVICE_SECRET: ${ADMIN_SERVICE_SECRET}
    API_HOST: 0.0.0.0
    API_PORT: 8001
    JWT_PUBLIC_KEY_PATH: /run/secrets/jwt_public_key
  ports:
    - "127.0.0.1:8001:8001"
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  volumes:
    - ../../backend/secrets/jwtEd25519.key.pub:/run/secrets/jwt_public_key:ro
```

### Health Checks

```
GET /health           → 200 OK if service is running
GET /health/ready     → 200 OK if database and Redis are connected
GET /health/live      → 200 OK for liveness probe
```

## API Versioning

- All endpoints prefixed with `/api/v1/admin/`
- Version in URL path (not headers)
- Breaking changes require new version (`/api/v2/admin/`)
- Deprecation notice 6 months before removal

## Performance Targets

| Metric | Target |
|--------|--------|
| API response time (p95) | < 300ms |
| Audit log write latency | < 50ms |
| Feature flag evaluation | < 10ms (cached) |
| Concurrent admin users | 100+ |
| Audit log query (30 days) | < 5 seconds |

---

**Next Steps**:
1. Review and approve architecture
2. Create detailed API specification
3. Set up project structure and CI/CD
4. Implement Phase 1 (Core Admin Identity & Support Access)
