# CLAUDE.md - RawDrive AI Context

RawDrive is an enterprise SaaS professional photography platform with microservices architecture.

## CRITICAL: File Structure Rules

**ALWAYS follow these strict file placement rules. NEVER create files in random locations.**

### Frontend Files
```
frontend/src/
├── components/
│   ├── ui/              # Design system components (AppButton, AppInput, etc.)
│   ├── layout/          # Layout components (Header, Sidebar, etc.)
│   └── features/        # Feature-specific components
│       ├── gallery/     # Gallery components
│       ├── upload/      # Upload components
│       └── [feature]/   # Other feature components
├── pages/               # Page components (route handlers)
│   ├── public/          # Public pages (SignIn, etc.)
│   ├── workspace/       # Authenticated workspace pages
│   └── [feature]/       # Feature-specific pages
├── hooks/               # Custom React hooks (useUpload, useGallery, etc.)
├── services/            # API client services (api.ts, auth.ts, etc.)
├── contexts/            # React contexts (AuthContext, OnboardingContext, etc.)
├── utils/               # Utility functions (fileUtils, formatting, etc.)
├── router/              # React Router configuration
├── config/              # Configuration files (featureFlags.ts, etc.)
├── constants/           # Frontend constants
└── styles/              # Global styles
```

### Backend Files
```
backend/src/app/
├── api/
│   ├── v1/              # API v1 endpoints (auth.py, galleries.py, etc.)
│   └── dependencies/    # FastAPI dependencies
├── models/              # SQLAlchemy models (ONLY database models)
├── repositories/        # Data access layer (database queries)
├── services/            # Business logic (NEVER put in models/)
├── middleware/          # FastAPI middleware
├── utils/               # Utility functions
├── workers/             # Background workers (Celery tasks)
├── shared/              # Generated Python types from TypeScript
└── config/              # Configuration modules
```

### Microservices Files
```
services/[service-name]/
├── src/
│   ├── api/v1/          # API endpoints
│   ├── services/        # Business logic
│   ├── repositories/    # Database access (if needed)
│   ├── schemas/         # Pydantic schemas
│   ├── middleware/      # Service middleware
│   ├── cache/           # Redis client
│   ├── observability/   # Metrics, health checks
│   └── config.py        # Service configuration
├── tests/
│   ├── unit/
│   ├── integration/
│   └── load/
├── Dockerfile
├── requirements.txt
└── README.md
```

### Documentation Files
```
docs/
├── Features/            # Feature documentation
├── Business_Features/   # Business feature specs (numbered)
├── project/             # Project documentation (tech stack, roadmap)
├── runbooks/            # Operational runbooks
├── troubleshooting/     # Troubleshooting guides
└── [topic].md           # Root-level topic docs
```

### Scripts Location
```
scripts/                 # Build and utility scripts
├── dev-*.sh            # Development scripts
├── test-*.sh           # Test scripts
└── *.ts                # TypeScript build scripts
```

### **NEVER Create Files In:**
- ❌ Root directory (except configuration files)
- ❌ Random nested directories
- ❌ `src/` without proper parent directory
- ❌ Temporary or test directories in production code

### **File Naming Conventions**
- **React Components**: `PascalCase.tsx` (e.g., `GalleryUpload.tsx`)
- **Python Files**: `snake_case.py` (e.g., `upload_service.py`)
- **Scripts**: `kebab-case.sh` or `kebab-case.ts`
- **Config Files**: `kebab-case.json` or `kebab-case.yaml`
- **Documentation**: `SCREAMING_SNAKE.md` or `PascalCase.md`

## Quick Reference

### Commands

```bash
# Development (start Docker stack)
docker compose -f infrastructure/docker/docker-compose.yml up -d
# OR for backend-only development (faster):
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

cd frontend && npm run dev         # localhost:3000

# Backend (using Docker)
docker compose -f infrastructure/docker/docker-compose.yml exec backend uvicorn app.main:app --reload --port 8000
docker compose -f infrastructure/docker/docker-compose.yml exec backend alembic upgrade head
docker compose -f infrastructure/docker/docker-compose.yml exec backend alembic revision --autogenerate -m "description"

# Microservices (dev mode)
bash scripts/dev-gallery-service.sh       # Gallery service on port 8004
bash scripts/dev-billing-service.sh       # Billing service on port 8006

# Testing
cd frontend && npm test            # Vitest
docker compose -f infrastructure/docker/docker-compose.yml exec backend pytest
docker compose -f infrastructure/docker/docker-compose.yml exec backend pytest --cov=src

# Linting
cd frontend && npm run lint
docker compose -f infrastructure/docker/docker-compose.yml exec backend ruff check src && mypy src
```

### Project Structure

```
RawDrive/
├── packages/          # Shared npm packages (pnpm workspace)
│   ├── shared-types/       # @rawdrive/shared-types
│   ├── shared-constants/   # @rawdrive/shared-constants
│   ├── shared-validation/  # @rawdrive/shared-validation
│   └── shared-utils/       # @rawdrive/shared-utils
├── frontend/          # React 19 + TypeScript + Vite + TailwindCSS
├── backend/           # Python 3.11 + FastAPI + SQLAlchemy + Alembic
├── services/          # Microservices (6 services)
│   ├── billing-service/      # Payment processing (Stripe/Razorpay)
│   ├── gallery-service/      # High-performance gallery (50K concurrent)
│   ├── upload-service/       # TUS resumable uploads
│   ├── onboarding-service/   # User registration & workspace setup
│   ├── invitations-service/  # Digital wedding invitations
│   └── workspace-service/    # Workspace management (partial)
├── infrastructure/    # Docker, Kubernetes, Traefik, monitoring
│   ├── docker/             # Docker Compose configurations
│   ├── kubernetes/         # K8s manifests
│   └── monitoring/         # Prometheus, Grafana, Loki configs
├── docs/              # Documentation (150+ files)
├── specs/             # Feature specifications (17+ specs)
├── scripts/           # Build and utility scripts
├── tests/             # E2E Playwright tests
└── .claude/           # Claude Code configuration
    ├── skills/        # 20 development skills
    └── settings.json  # Claude settings
```

### Key Files

| Purpose | Location |
|---------|----------|
| **Frontend** | |
| API client | `frontend/src/services/api.ts` |
| Auth service | `frontend/src/services/auth.ts` |
| UI Components | `frontend/src/components/ui/` |
| Feature components | `frontend/src/components/features/` |
| Hooks | `frontend/src/hooks/` |
| Pages | `frontend/src/pages/` |
| Routes | `frontend/src/router/routes.tsx` |
| **Backend** | |
| Entry point | `backend/src/app/main.py` |
| API routes | `backend/src/app/api/v1/` |
| Services | `backend/src/app/services/` |
| Repositories | `backend/src/app/repositories/` |
| Models | `backend/src/app/models/` |
| Migrations | `backend/migrations/versions/` |
| Shared Python types | `backend/src/app/shared/` |
| **Microservices** | |
| Billing API | `services/billing-service/src/api/v1/` |
| Gallery API | `services/gallery-service/src/api/v1/` |
| Upload API | `services/upload-service/src/app/api/v1/` |
| Onboarding API | `services/onboarding-service/src/api/v1/` |
| **Shared Packages** | |
| Types package | `packages/shared-types/src/` |
| Constants package | `packages/shared-constants/src/` |
| Validation package | `packages/shared-validation/src/` |
| Utils package | `packages/shared-utils/src/` |
| Python generator | `scripts/generate-python-types.ts` |
| **Infrastructure** | |
| Docker Compose | `infrastructure/docker/docker-compose.yml` |
| Traefik config | `infrastructure/docker/traefik/traefik.yaml` |
| KEDA scaling | `infrastructure/kubernetes/base/keda/scaledobjects.yaml` |
| Prometheus | `infrastructure/monitoring/prometheus/prometheus.yaml` |

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/rawdrive
REDIS_URL=redis://localhost:6379/0

# Auth
JWT_SECRET=<64-byte-hex>

# Storage
R2_ACCESS_KEY_ID=<cloudflare-r2-key>
R2_SECRET_ACCESS_KEY=<cloudflare-r2-secret>
R2_BUCKET_NAME=rawdrive-assets
R2_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com

# AI (NEVER hardcode!)
AI_PROVIDER=<provider>
AI_API_KEY=<api-key>
AI_MODEL=<model-name>

# Payment (Microservices)
STRIPE_SECRET_KEY=<stripe-key>
RAZORPAY_KEY_ID=<razorpay-id>
RAZORPAY_KEY_SECRET=<razorpay-secret>
```

## Shared Packages (pnpm Workspaces)

RawDrive uses a **monorepo with pnpm workspaces** for shared code:

| Package | Purpose | Exports |
|---------|---------|---------|
| `@rawdrive/shared-types` | Domain types | `InvitationStatus`, `GalleryStatus`, `GradientConfiguration`, etc. |
| `@rawdrive/shared-constants` | Configuration | `API_BASE`, `STORAGE`, `AI_THRESHOLDS`, `PAGINATION`, `FILE_TYPES` |
| `@rawdrive/shared-validation` | Validation | `isValidHexColor`, `hexColorSchema`, `sanitizeHtml` |
| `@rawdrive/shared-utils` | Utilities | `formatRelativeDate`, `formatFileSize`, `truncate` |

### Usage

```typescript
// Frontend: Import from shared packages
import { InvitationStatus, GalleryStatus } from '@rawdrive/shared-types';
import { API_BASE, PAGINATION, FILE_TYPES } from '@rawdrive/shared-constants';
import { isValidHexColor, sanitizeHtml } from '@rawdrive/shared-validation';
import { formatRelativeDate, formatFileSize } from '@rawdrive/shared-utils';
```

```python
# Backend: Import from generated Python modules
from app.shared.types import InvitationStatus, GalleryStatus
from app.shared.constants import API_BASE, PAGINATION
from app.shared.validation import is_valid_hex_color
```

### Commands

```bash
# Build all shared packages
pnpm build:packages

# Generate Python types from TypeScript
pnpm generate:python

# Test shared packages
pnpm test:packages

# Run cross-platform parity tests
pnpm test:parity
```

### Adding New Types

1. Add TypeScript types in `packages/shared-types/src/`
2. Run `pnpm generate:python` to generate Pydantic models
3. Import from `@rawdrive/shared-types` (TS) or `app.shared.types` (Python)

## Skills Reference

Claude Code loads skills automatically based on context. Use `/skill <name>` to invoke directly.

**All 20 Available Skills:**

| Skill | Use When |
|-------|----------|
| `accessibility` | WCAG 2.1 AA compliance, ARIA, keyboard navigation, screen readers |
| `ai-mcp-integration` | AI features, Model Context Protocol (MCP) integration, LLM tooling |
| `api-standards` | API conventions, response formats, pagination, HTTP methods |
| `design-system` | Design tokens, AppButton/AppInput, color system, theming |
| `doc-coauthoring` | Three-stage documentation workflow for specs, proposals, ADRs |
| `error-handling` | Error boundaries, API errors, form validation, user feedback |
| `frontend-design` | Premium UI, effects, animations, avoiding generic AI aesthetics |
| `git-workflow` | Git conventions, commits, branches, pull requests, code review |
| `ide` | VS Code and JetBrains IDE integration, extensions |
| `infrastructure` | Traefik v3, KEDA, Prometheus, Kafka, Kubernetes, Docker |
| `performance` | Optimization, caching, scaling, web vitals, latency reduction |
| `project-structure` | Codebase conventions, folder layout, naming patterns |
| `saas-practices` | Multi-tenancy, billing, onboarding, usage metering |
| `security` | Authentication, RBAC, encryption, SOC 2 compliance, OWASP |
| `skill-creator` | Create and maintain Claude Code skills |
| `storage` | R2/BYOS storage, file uploads, asset management |
| `testing` | Vitest, pytest patterns, test coverage, fixtures |
| `web-artifacts-builder` | Build standalone UI component demos, HTML previews |
| `webapp-testing` | Playwright E2E testing, browser automation, screenshots |
| `speckit.*` | SpecKit workflow skills (analyze, clarify, plan, implement, tasks) |

**Note:** Skills are located in `.claude/skills/[skill-name]/SKILL.md`

## Critical Rules

### Multi-Tenant Isolation (ALWAYS)

```python
# EVERY query MUST include workspace_id
result = await db.execute(
    select(Asset).where(Asset.workspace_id == workspace_id)
)
# NEVER trust client-provided workspace_id - extract from JWT token
```

### Storage Key Format

```
workspaces/{workspace_id}/assets/{asset_id}/original/{filename}
workspaces/{workspace_id}/assets/{asset_id}/thumbnails/{size}/{filename}
```

### Never Hardcode

- ❌ API keys, secrets, credentials
- ❌ LLM provider names or model identifiers
- ❌ Colors (use design tokens from `@rawdrive/shared-constants`)
- ❌ User-facing strings (use i18n)
- ❌ Magic numbers (use named constants)

### Input Validation

```python
from pydantic import BaseModel, Field

class CreateGallery(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    workspace_id: UUID = Field(...)  # REQUIRED for multi-tenancy
```

### Security Requirements

- ✅ Always validate JWT tokens in microservices
- ✅ Use shared `JWT_SECRET` across all services
- ✅ Implement rate limiting on all public endpoints
- ✅ Sanitize user inputs (use `@rawdrive/shared-validation`)
- ✅ Use parameterized queries (SQLAlchemy prevents SQL injection)
- ✅ Encrypt sensitive data at rest (AES-256)

## Code Style

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React components | `PascalCase.tsx` | `GalleryUpload.tsx` |
| React hooks | `useCamelCase.ts` | `useUpload.ts` |
| Python services | `snake_case.py` | `upload_service.py` |
| Python classes | `PascalCase` | `UploadService` |
| API routes | `/api/v1/kebab-case` | `/api/v1/gallery-items` |
| Database tables | `snake_case` | `gallery_items` |
| Environment variables | `SCREAMING_SNAKE` | `JWT_SECRET` |
| Constants | `SCREAMING_SNAKE` | `MAX_UPLOAD_SIZE` |

### Component Structure (Frontend)

```typescript
// 1. External imports
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Types (from shared packages)
import type { Gallery } from '@rawdrive/shared-types';

// 3. Internal imports
import { AppButton } from '@/components/ui';
import { useUpload } from '@/hooks/useUpload';

// 4. Constants
import { MAX_FILE_SIZE } from '@rawdrive/shared-constants';

interface Props {
  galleryId: string;
  workspaceId: string;
}

export const GalleryUpload: React.FC<Props> = ({ galleryId, workspaceId }) => {
  // Component implementation
};
```

### Service Structure (Backend)

```python
# Repository → Service → API (3-layer architecture)

# 1. Repository (database access)
class GalleryRepository:
    async def get_by_id(self, gallery_id: UUID, workspace_id: UUID) -> Gallery:
        # Database query

# 2. Service (business logic)
class GalleryService:
    def __init__(self, repo: GalleryRepository):
        self.repo = repo

    async def get_gallery(self, gallery_id: UUID, workspace_id: UUID) -> Gallery:
        # Business logic + validation

# 3. API (HTTP handling)
@router.get("/galleries/{gallery_id}")
async def get_gallery(gallery_id: UUID, service: GalleryService = Depends()):
    return await service.get_gallery(gallery_id)
```

## Common Patterns

### API Response Format

```typescript
// Success response
{
  data: T,
  pagination?: { total: number, page: number, limit: number }
}

// Error response
{
  error: string,
  message: string,
  details?: Array<{ field: string, message: string }>
}
```

### Background Jobs (Celery)

```python
from app.tasks import process_asset

# Enqueue background task
process_asset.delay(
    asset_id=asset_id,
    workspace_id=workspace_id,
    operation="thumbnail_generation"
)
```

### Caching (Redis)

```python
import json

# Check cache first
cached = await redis.get(f"gallery:{gallery_id}")
if cached:
    return json.loads(cached)

# Fetch from database
result = await db.get(gallery_id)

# Cache for 1 hour
await redis.setex(
    f"gallery:{gallery_id}",
    3600,
    json.dumps(result)
)
```

### File Upload Pattern

```python
from app.services.upload_service import UploadService

# Chunked upload with TUS protocol
upload = await upload_service.create_upload(
    filename="photo.jpg",
    file_size=5_000_000,  # 5MB
    workspace_id=workspace_id,
    chunk_size=1_048_576  # 1MB chunks
)
```

## Architecture Notes

### Microservices Architecture

**All 6 Microservices:**

| Service | Port | Purpose | Scaling | Status |
|---------|------|---------|---------|--------|
| **Backend** | 8000 | Main API, core features | 2-100 replicas | ✅ Production |
| **Billing Service** | 8005 (prod)<br>8006 (dev) | Payment processing (Stripe/Razorpay), subscriptions, invoices | 2-20 replicas | ✅ Production |
| **Gallery Service** | 8004 | High-performance gallery viewing, Magic Links, WebSocket proofing, face search | 5-20 replicas | ✅ Production |
| **Upload Service** | 8080 | TUS protocol resumable uploads, chunking, AES-256 encryption, Kafka events | 2-50 replicas | ✅ Production |
| **Onboarding Service** | 8005 | User registration, email verification, workspace creation, Stripe payment | 2-20 replicas | ✅ Production |
| **Invitations Service** | 8003 | Digital wedding invitations, guest management, RSVP, bulk email | Standard | ✅ Production |
| **Workspace Service** | TBD | Workspace management, team collaboration | - | 🚧 Partial |

**Service Communication:**
- **Shared Database**: PostgreSQL 16 (multi-tenant with `workspace_id` isolation)
- **Shared JWT Secret**: Same `JWT_SECRET` environment variable across all services
- **Shared Redis**: Redis 7 for caching and session management
- **API Gateway**: Traefik v3 with priority-based routing
- **Event Bus**: Kafka for asynchronous events (upload completion, etc.)

### Traefik v3 API Gateway

**Replaced**: Nginx Ingress Controller in version 0.26

**Routing Priority Table:**

| Priority | Route | Service | Rate Limit |
|----------|-------|---------|------------|
| 150 | `/webhooks/stripe` | billing-service | None (webhooks) |
| 148 | `/webhooks/razorpay` | billing-service | None (webhooks) |
| 145 | `/api/v1/subscription/*` | billing-service | 100 req/min |
| 140 | `/api/v1/galleries/*` | gallery-service | 200 req/min |
| 135 | `/api/v1/upload/*` | upload-service | 50 req/min |
| 100 | `/api/*` | backend (fallback) | 100 req/min |

**Features:**
- Automatic Let's Encrypt TLS certificates
- Rate limiting per endpoint
- Prometheus metrics exposure for KEDA
- Dynamic configuration via labels/annotations
- Circuit breaker pattern
- Request/response logging

**Configuration Files:**
- Docker: `infrastructure/docker/traefik/traefik.yaml`, `dynamic.yaml`
- Kubernetes: `infrastructure/kubernetes/base/traefik/deployment.yaml`, `ingressroutes.yaml`

### KEDA Autoscaling

**Triggers:**
- HTTP request rate (Traefik metrics)
- P95 latency threshold (Traefik metrics)
- Kafka queue lag (Upload Service)
- Redis queue depth (Celery workers)
- WebSocket connections (Gallery Service)

**Scaling Configurations:**

```yaml
# Backend: 2-100 replicas
- type: prometheus
  threshold: "100"  # 100 RPS per replica
  query: rate(traefik_service_requests_total{service="backend"}[1m])

# Gallery: 5-20 replicas
- type: prometheus
  threshold: "100"  # 100 RPS
- type: prometheus
  threshold: "500"  # 500 WebSocket connections

# Upload: 2-50 replicas
- type: kafka
  threshold: "100"  # Kafka lag > 100 messages
```

**Files:**
- `infrastructure/kubernetes/base/keda/scaledobjects.yaml`
- `infrastructure/kubernetes/base/keda/billing-scaledobject.yaml`
- `infrastructure/kubernetes/base/keda/gallery-scaledobject.yaml`

### Auth Flow

- **Access Token**: 15 minutes (JWT in Authorization header)
- **Refresh Token**: 7 days (httpOnly cookie, secure)
- **Remember Me**: 30 days extended refresh token
- **2FA**: TOTP via speakeasy library
- **Password Hashing**: Argon2id (OWASP recommended)
- **Session Storage**: Redis with automatic expiration

### Database

- **PostgreSQL 16** with extensions:
  - `pgvector` - Vector similarity search (HNSW, IVFFlat indexes)
  - `pgvectorscale` - Enhanced vector indexing (StreamingDiskANN for >10M vectors)
  - `uuid-ossp` - UUID generation
  - `pg_trgm` - Fuzzy text search
- **Redis 7** - Caching, sessions, Celery broker
- **PgBouncer** - Connection pooling (max 100 connections)
- **Alembic** - Database migrations

**Docker Image:** `timescale/timescaledb-ha:pg16` (includes pgvector + pgvectorscale)

#### Vector Search Index Selection

| Dataset Size | Index Type | Use Case |
|--------------|------------|----------|
| < 100K vectors | HNSW (pgvector) | Face detection, small galleries |
| 100K - 10M | IVFFlat or HNSW | Medium galleries, AI search |
| > 10M vectors | StreamingDiskANN (pgvectorscale) | Large-scale similarity search |

```python
# Check pgvectorscale availability
from app.core.database import verify_vector_extensions, check_pgvectorscale_ready

status = await verify_vector_extensions()
if status.can_use_diskann:
    # Use StreamingDiskANN for large datasets (millions+ vectors)
    await db.execute("CREATE INDEX ON embeddings USING diskann(vector)")
else:
    # Fallback to HNSW
    await db.execute("CREATE INDEX ON embeddings USING hnsw(vector)")
```

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, TypeScript 5.2+, Vite 5, TailwindCSS 3, React Query, React Router 6 |
| **Backend** | Python 3.11, FastAPI 0.115+, SQLAlchemy 2.0, Pydantic 2.7+, Alembic |
| **Database** | PostgreSQL 16 (timescaledb-ha), pgvector, pgvectorscale, Redis 7, PgBouncer 1.21+ |
| **Storage** | Cloudflare R2, BYOS (S3-compatible APIs) |
| **AI/ML** | Google Cloud Vision, Gemini Vision API, DeepFace, CLIP embeddings |
| **Infrastructure** | Traefik v3, KEDA, Docker, Kubernetes, Kafka |
| **Monitoring** | Prometheus, Grafana, Loki, Promtail, Alertmanager, Tempo (tracing) |
| **Payments** | Stripe (global), Razorpay (India) |
| **Validation** | Zod 4.2+ (TypeScript), Pydantic 2.7+ (Python) |
| **Async** | Celery 5.3+, Redis (broker), Kafka (events) |

## Monitoring Stack

**Observability Services:**

| Service | Port | Purpose |
|---------|------|---------|
| Prometheus | 9090 | Metrics collection and querying |
| Grafana | 3001 | Dashboards and visualization |
| Loki | 3100 | Log aggregation |
| Promtail | - | Log collection agent |
| Alertmanager | 9093 | Alert routing and grouping |
| Tempo | 3200 | Distributed tracing |
| Traefik Dashboard | 8080 | API Gateway metrics |

**Key Dashboards:**
- `infrastructure/monitoring/grafana/dashboards/traefik-keda.json` - Traefik + KEDA metrics
- Request rates, error rates, latency percentiles (P50, P95, P99)
- KEDA autoscaling metrics (current replicas, target metrics)

**Alerts:**
- `infrastructure/monitoring/prometheus/traefik-alerts.yaml` - Traefik-specific alerts
- `infrastructure/monitoring/prometheus/alerts.yaml` - General service alerts

## Useful Links

- **Skills**: `.claude/skills/*/SKILL.md` (20 skills)
- **Documentation**: `docs/` (150+ files)
- **Specs**: `specs/` (17+ feature specifications)
- **Test Users**: `docs/TEST_USERS_CREATED.md`
- **Architecture**: `docs/ARCHITECTURE_QUICK_REFERENCE.md`
- **Troubleshooting**: `docs/troubleshooting/`
- **Runbooks**: `docs/runbooks/`

## Version History

### Current: v0.3.0 (2025-01-27)

Gallery Preview feature and platform stability:

**New Features:**
- Gallery Preview: "View as Client" mode for workspace users
- Security: UUID validation for public URLs
- Infrastructure: Traefik v3 and KEDA autoscaling maturity
- Unified Type System: Generated Python types from TypeScript shared packages

### Previous: v0.2.9 (2025-01-06)

Major platform enhancements and microservices expansion:

**New Microservices:**
- billing-service: Payment processing with Stripe/Razorpay
- gallery-service: 50K concurrent users support
- upload-service: TUS resumable uploads with chunking
- onboarding-service: User registration and workspace creation

**Infrastructure:**
- Traefik v3 API Gateway with priority routing
- KEDA autoscaling with Prometheus metrics
- pgvectorscale extension for vector search
- Comprehensive monitoring (Prometheus, Grafana, Loki)

**Backend:**
- 8 new Alembic migrations (0093-0100)
- Enhanced subscription and payment models
- Session security improvements
- Onboarding flow with email verification

**Frontend:**
- Onboarding pages and context
- Enhanced upload with chunking
- Device fingerprinting
- Remember me functionality

### Previous Versions

- **v0.28** - 5000 concurrent users autoscaling infrastructure
- **v0.26** - Traefik v3 + KEDA autoscaling
- **v0.25** - pgvectorscale extension enabled
- **v0.23** - Enhanced Smart Curate with CLIP embeddings
- **v0.22** - Shared packages infrastructure (pnpm workspaces)

## Recent Changes

- **026-traefik-keda**: Traefik v3 API Gateway replaces Nginx Ingress, KEDA autoscaling with Prometheus metrics, Grafana dashboards for traffic monitoring
- **025-pgvectorscale**: Enabled pgvectorscale extension for enhanced vector search (StreamingDiskANN indexes), switched to timescale/timescaledb-ha Docker image
- **022-shared-packages**: Implemented shared packages infrastructure with 4 npm packages (`@rawdrive/shared-types`, `@rawdrive/shared-constants`, `@rawdrive/shared-validation`, `@rawdrive/shared-utils`), TypeScript-to-Python type generation, pnpm workspaces
- **023-enhanced-smart-curate**: Added CLIP embeddings for semantic image search, Gemini Vision API integration for AI-powered photo analysis

## Development Tips

### Working with Microservices

1. **Always use shared database** - All services connect to same PostgreSQL instance
2. **Validate JWT tokens** - Use shared `JWT_SECRET` and validate in middleware
3. **Include workspace_id** - Every query must filter by `workspace_id`
4. **Use service templates** - Follow existing service structure (gallery-service is reference)
5. **Add health checks** - `/health` and `/ready` endpoints required
6. **Expose metrics** - Prometheus `/metrics` endpoint for monitoring

### Adding New Features

1. **Check shared packages** - Reuse types, constants, validation from shared packages
2. **Follow file structure** - Place files in correct directories (see File Structure Rules)
3. **Write tests** - Unit tests (80%+ coverage), integration tests, E2E tests
4. **Update documentation** - Add to `docs/Features/` and update this file
5. **Create migration** - Database changes require Alembic migration
6. **Add to skills** - Document patterns in `.claude/skills/` if reusable

### Debugging

```bash
# View service logs
docker compose -f infrastructure/docker/docker-compose.yml logs -f [service]

# Check Traefik routing
curl http://localhost:8080/api/rawhttp  # Traefik dashboard

# View Prometheus metrics
curl http://localhost:9090/metrics

# Access Grafana
open http://localhost:3001  # admin / admin
```

## Contact & Support

- **GitHub Issues**: Report bugs and request features
- **Documentation**: Check `docs/` directory first
- **Skills**: Use Claude Code skills for guided development
- **Runbooks**: Operational guides in `docs/runbooks/`
