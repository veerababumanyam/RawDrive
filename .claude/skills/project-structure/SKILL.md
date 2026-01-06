---
name: project-structure
aliases: [codebase, architecture, folders, conventions, layout, organization, file-placement]
description: Project structure and coding conventions for RawDrive. Use when creating new files, organizing code, or understanding the codebase layout. CRITICAL for preventing random file creation.
---

# Project Structure & Coding Conventions

## ⚠️ CRITICAL: File Placement Rules

**ALWAYS follow these rules. NEVER create files in random locations.**

### ✅ WHERE TO CREATE FILES

#### Frontend Files MUST go in:
- **Components**: `frontend/src/components/[ui|layout|features]/`
- **Pages**: `frontend/src/pages/[public|workspace|feature]/`
- **Hooks**: `frontend/src/hooks/`
- **Services**: `frontend/src/services/`
- **Contexts**: `frontend/src/contexts/`
- **Utils**: `frontend/src/utils/`
- **Types**: `frontend/src/types/` (local) or `packages/shared-types/src/` (shared)

#### Backend Files MUST go in:
- **API Routes**: `backend/src/app/api/v1/`
- **Services**: `backend/src/app/services/`
- **Repositories**: `backend/src/app/repositories/`
- **Models**: `backend/src/app/models/`
- **Middleware**: `backend/src/app/middleware/`
- **Utils**: `backend/src/app/utils/`
- **Workers**: `backend/src/app/workers/`
- **Migrations**: `backend/migrations/versions/`

#### Microservice Files MUST go in:
- **Service Code**: `services/[service-name]/src/`
- **API Routes**: `services/[service-name]/src/api/v1/`
- **Business Logic**: `services/[service-name]/src/services/`
- **Tests**: `services/[service-name]/tests/[unit|integration|load]/`

#### Documentation Files MUST go in:
- **Feature Docs**: `docs/Features/`
- **Business Specs**: `docs/Business_Features/`
- **Project Docs**: `docs/project/`
- **Runbooks**: `docs/runbooks/`
- **Troubleshooting**: `docs/troubleshooting/`

#### Scripts MUST go in:
- `scripts/` directory ONLY
- Name with `kebab-case.sh` or `kebab-case.ts`

### ❌ NEVER CREATE FILES IN

- ❌ Root directory (except config files like `.env`, `docker-compose.yml`)
- ❌ Random nested directories outside project structure
- ❌ `src/` without proper parent directory context
- ❌ Temporary or test directories in production code
- ❌ `backend/app/` (should be `backend/src/app/`)
- ❌ `frontend/components/` (should be `frontend/src/components/`)

## Architecture Overview

RawDrive is an enterprise SaaS photography platform with a **microservices architecture** and **pnpm monorepo**:

```
RawDrive/
├── packages/              # Shared npm packages (pnpm workspace)
│   ├── shared-types/      # @rawdrive/shared-types - Domain enums & types
│   ├── shared-constants/  # @rawdrive/shared-constants - Config values
│   ├── shared-validation/ # @rawdrive/shared-validation - Zod schemas
│   └── shared-utils/      # @rawdrive/shared-utils - Date/format utils
│
├── frontend/              # React 19 + Vite + TypeScript
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── ui/        # Design system (AppButton, AppInput, etc.)
│   │   │   ├── layout/    # Layout components (Header, Sidebar, etc.)
│   │   │   └── features/  # Feature-specific components (gallery/, upload/, etc.)
│   │   ├── pages/         # Page components (route handlers)
│   │   │   ├── public/    # Public pages (SignIn, SignUp, etc.)
│   │   │   ├── workspace/ # Authenticated workspace pages
│   │   │   └── onboarding/ # Onboarding flow pages
│   │   ├── hooks/         # Custom React hooks (useUpload, useGallery, etc.)
│   │   ├── services/      # API clients (api.ts, auth.ts, etc.)
│   │   ├── contexts/      # React contexts (AuthContext, etc.)
│   │   ├── router/        # React Router configuration
│   │   ├── config/        # Configuration (featureFlags.ts, etc.)
│   │   ├── utils/         # Utility functions
│   │   ├── constants/     # Frontend-specific constants
│   │   └── styles/        # Global styles
│   └── public/            # Static assets (favicon, images, etc.)
│
├── backend/               # Python 3.11 + FastAPI
│   ├── src/app/
│   │   ├── api/           # API route handlers
│   │   │   ├── v1/        # Versioned API routes (auth.py, galleries.py, etc.)
│   │   │   └── dependencies/ # FastAPI dependencies
│   │   ├── services/      # Business logic (NEVER put in models/)
│   │   ├── repositories/  # Database access layer (queries only)
│   │   ├── models/        # SQLAlchemy models (database schema ONLY)
│   │   ├── middleware/    # FastAPI middleware
│   │   ├── config/        # Configuration modules
│   │   ├── utils/         # Utility functions
│   │   ├── shared/        # Generated Python types from @rawdrive/shared-*
│   │   └── workers/       # Background job workers (Celery tasks)
│   ├── migrations/        # Alembic migrations
│   │   └── versions/      # Migration files (0001_*, 0002_*, etc.)
│   └── tests/             # pytest tests
│
├── services/              # Microservices (6 services)
│   ├── billing-service/   # Payment processing (Stripe/Razorpay)
│   │   ├── src/
│   │   │   ├── api/v1/    # API endpoints (subscription.py, webhooks.py)
│   │   │   ├── services/  # Business logic (subscription_service.py, razorpay_service.py)
│   │   │   ├── repositories/ # Database access
│   │   │   ├── schemas/   # Pydantic schemas
│   │   │   ├── middleware/ # Service middleware
│   │   │   ├── utils/     # JWT validation, etc.
│   │   │   ├── config.py  # Service configuration
│   │   │   └── main.py    # FastAPI entry point
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   │
│   ├── gallery-service/   # High-performance gallery viewing (50K concurrent)
│   │   ├── src/
│   │   │   ├── api/v1/    # galleries.py, magic_links.py, websocket.py
│   │   │   ├── services/  # gallery_service.py, proofing_service.py
│   │   │   ├── cache/     # Redis client
│   │   │   ├── observability/ # Metrics, health checks
│   │   │   └── middleware/ # Rate limiting, correlation IDs
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── load/
│   │   └── ...
│   │
│   ├── upload-service/    # TUS resumable uploads with chunking
│   │   ├── src/app/
│   │   │   ├── api/v1/    # upload.py
│   │   │   ├── services/  # upload_service.py, chunked_upload_service.py, encryption_service.py
│   │   │   ├── core/      # config.py, database.py, redis.py
│   │   │   ├── middleware/ # auth.py, rate_limit.py
│   │   │   ├── observability/ # logging.py, metrics.py
│   │   │   └── resilience/ # circuit_breaker.py
│   │   └── ...
│   │
│   ├── onboarding-service/ # User registration & workspace setup
│   │   ├── src/
│   │   │   ├── api/v1/    # onboarding.py
│   │   │   ├── services/  # onboarding_service.py
│   │   │   ├── repositories/ # onboarding_repository.py
│   │   │   └── schemas/   # onboarding.py
│   │   └── ...
│   │
│   ├── invitations-service/ # Digital wedding invitations
│   │   ├── src/
│   │   │   ├── api/v1/    # invitations.py, rsvp.py, guests.py
│   │   │   ├── services/  # invitation_service.py, email_service.py
│   │   │   └── shared/    # Generated Python types
│   │   └── ...
│   │
│   └── workspace-service/ # Workspace management (PARTIAL - under development)
│       ├── src/
│       └── tests/
│
├── infrastructure/        # Docker, Kubernetes, Traefik, monitoring
│   ├── docker/            # Docker Compose configurations
│   │   ├── docker-compose.yml        # Main production stack
│   │   ├── docker-compose.dev.yml    # Development stack
│   │   ├── docker-compose.traefik.yml # Traefik extension
│   │   ├── traefik/       # Traefik v3 configuration
│   │   │   ├── traefik.yaml  # Main config
│   │   │   └── dynamic.yaml  # Dynamic routing
│   │   └── init/          # Initialization scripts
│   │
│   ├── kubernetes/        # Kubernetes manifests
│   │   └── base/
│   │       ├── backend/
│   │       ├── billing-service/
│   │       ├── gallery-service/
│   │       ├── upload-service/
│   │       ├── traefik/   # Traefik IngressRoutes
│   │       └── keda/      # KEDA ScaledObjects
│   │
│   └── monitoring/        # Prometheus, Grafana, Loki configs
│       ├── prometheus/
│       │   ├── prometheus.yaml
│       │   ├── alerts.yaml
│       │   └── traefik-alerts.yaml
│       └── grafana/
│           └── dashboards/
│               └── traefik-keda.json
│
├── scripts/               # Build and utility scripts
│   ├── generate-python-types.ts  # TypeScript → Python generator
│   ├── dev-gallery-service.sh    # Gallery service dev mode
│   └── dev-billing-service.sh    # Billing service dev mode
│
├── docs/                  # Documentation (150+ files)
│   ├── Features/          # Feature documentation
│   ├── Business_Features/ # Business feature specs (numbered 01-24)
│   ├── project/           # Project documentation (tech stack, roadmap)
│   ├── runbooks/          # Operational runbooks
│   └── troubleshooting/   # Troubleshooting guides
│
├── specs/                 # Feature specifications (17+ specs)
│   ├── 001-admin-microservice/
│   ├── 002-user-profile-settings/
│   └── ...
│
├── tests/                 # E2E Playwright tests
│   ├── login.spec.ts
│   ├── traefik-routing.spec.ts
│   └── verification/
│
└── .claude/               # Claude Code skills
    ├── skills/            # 20 development skills
    │   ├── accessibility/
    │   ├── infrastructure/
    │   ├── project-structure/
    │   └── ...
    └── settings.json
```

## Key Files by Purpose

### Frontend

| Purpose | Location | Notes |
|---------|----------|-------|
| Entry point | `frontend/src/main.tsx` | React app initialization |
| App router | `frontend/src/App.tsx` | Root component |
| Routes config | `frontend/src/router/routes.tsx` | React Router routes |
| API client | `frontend/src/services/api.ts` | Axios instance |
| Auth service | `frontend/src/services/auth.ts` | Authentication logic |
| UI components | `frontend/src/components/ui/` | Design system |
| Feature components | `frontend/src/components/features/` | Feature-specific |
| CSS variables | `frontend/src/index.css` | Design tokens |
| Tailwind config | `frontend/tailwind.config.js` | Tailwind customization |

### Backend

| Purpose | Location | Notes |
|---------|----------|-------|
| FastAPI entry | `backend/src/app/main.py` | Application startup |
| API routes | `backend/src/app/api/v1/` | Versioned endpoints |
| Services | `backend/src/app/services/` | Business logic |
| Repositories | `backend/src/app/repositories/` | Database queries |
| Models | `backend/src/app/models/` | SQLAlchemy ORM |
| Migrations | `backend/migrations/versions/` | Alembic migrations |
| Config | `backend/src/app/config/settings.py` | Settings management |
| Database | `backend/src/app/core/database.py` | DB connection |

### Microservices

| Service | Port | Entry Point | Purpose |
|---------|------|-------------|---------|
| Backend | 8000 | `backend/src/app/main.py` | Main API |
| Billing | 8005 (prod)<br>8006 (dev) | `services/billing-service/src/main.py` | Payments |
| Gallery | 8004 | `services/gallery-service/src/main.py` | Gallery viewing |
| Upload | 8080 | `services/upload-service/src/app/main.py` | File uploads |
| Onboarding | 8005 | `services/onboarding-service/src/main.py` | User registration |
| Invitations | 8003 | `services/invitations-service/src/main.py` | Invitations |

### Shared Packages

| Purpose | Location | Generated Python |
|---------|----------|------------------|
| Types (TS) | `packages/shared-types/src/` | `backend/src/app/shared/types.py` |
| Constants (TS) | `packages/shared-constants/src/` | `backend/src/app/shared/constants.py` |
| Validation (TS) | `packages/shared-validation/src/` | `backend/src/app/shared/validation.py` |
| Utils (TS) | `packages/shared-utils/src/` | `backend/src/app/shared/utils.py` |
| Python generator | `scripts/generate-python-types.ts` | - |
| Workspace config | `pnpm-workspace.yaml` | - |

### Infrastructure

| Purpose | Location | Notes |
|---------|----------|-------|
| Docker Compose | `infrastructure/docker/docker-compose.yml` | Main stack |
| Traefik config | `infrastructure/docker/traefik/traefik.yaml` | API Gateway |
| KEDA scaling | `infrastructure/kubernetes/base/keda/scaledobjects.yaml` | Autoscaling |
| Prometheus | `infrastructure/monitoring/prometheus/prometheus.yaml` | Metrics |
| Grafana dashboards | `infrastructure/monitoring/grafana/dashboards/` | Visualization |

## Commands

### Development

```bash
# Frontend
cd frontend && npm run dev         # Vite dev server (localhost:3000)
cd frontend && npm run build       # Production build
cd frontend && npm test            # Vitest tests

# Backend
cd backend && uvicorn src.app.main:app --reload  # Dev server (localhost:8000)
cd backend && pytest               # pytest tests
cd backend && pytest --cov=src     # with coverage

# Microservices (dev mode)
bash scripts/dev-gallery-service.sh    # Gallery service (port 8004)
bash scripts/dev-billing-service.sh    # Billing service (port 8006)

# Full stack (Docker)
docker compose -f infrastructure/docker/docker-compose.yml up -d
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d  # Dev mode
```

### Database

```bash
cd backend

# Run migrations
alembic upgrade head

# Create new migration (auto-generate from models)
alembic revision --autogenerate -m "description"

# Rollback one migration
alembic downgrade -1
```

### Shared Packages (pnpm workspaces)

```bash
# Install dependencies for all packages
pnpm install

# Build all shared packages
pnpm build:packages

# Generate Python types from TypeScript
pnpm generate:python

# Test shared packages
pnpm test:packages

# Run cross-platform type parity tests
pnpm test:parity
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React components | `PascalCase.tsx` | `GalleryGrid.tsx` |
| React hooks | `useCamelCase.ts` | `useGallery.ts`, `useUpload.ts` |
| Python services | `snake_case.py` | `gallery_service.py` |
| Python classes | `PascalCase` | `GalleryService`, `UploadService` |
| API routes | `/api/v1/kebab-case` | `/api/v1/photo-albums` |
| Database tables | `snake_case` | `user_roles`, `gallery_items` |
| Environment variables | `SCREAMING_SNAKE` | `JWT_SECRET`, `DATABASE_URL` |
| Constants | `SCREAMING_SNAKE` | `MAX_UPLOAD_SIZE`, `API_BASE` |
| Scripts | `kebab-case.sh/.ts` | `dev-gallery-service.sh` |
| Config files | `kebab-case.json/.yaml` | `docker-compose.yml` |

## Import Patterns

### Frontend (TypeScript)

```typescript
// 1. External imports
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Shared packages (preferred for cross-platform types)
import { InvitationStatus, GalleryStatus } from '@rawdrive/shared-types';
import { API_BASE, PAGINATION, FILE_TYPES } from '@rawdrive/shared-constants';
import { isValidHexColor, sanitizeHtml } from '@rawdrive/shared-validation';
import { formatRelativeDate, formatFileSize } from '@rawdrive/shared-utils';

// 3. Type imports (local)
import type { Gallery } from '@/types/gallery';

// 4. Services/hooks
import { useGallery } from '@/hooks/useGallery';

// 5. Components
import { AppButton } from '@/components/ui/AppButton';
```

### Backend (Python)

```python
# 1. Standard library
from typing import Optional, List
from uuid import UUID
from datetime import datetime

# 2. Third-party
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

# 3. Shared types (generated from TypeScript)
from app.shared.types import InvitationStatus, GalleryStatus
from app.shared.constants import API_BASE, PAGINATION
from app.shared.validation import is_valid_hex_color

# 4. Local imports
from app.services.gallery_service import GalleryService
from app.repositories.gallery_repository import GalleryRepository
from app.models.gallery import Gallery
from app.api.dependencies import get_db, get_current_user
```

## Component Pattern (Frontend)

```typescript
// frontend/src/components/features/gallery/GalleryCard.tsx

import React, { memo } from 'react';
import { Gallery } from '@rawdrive/shared-types';
import { AppCard } from '@/components/ui/AppCard';
import { formatRelativeDate } from '@rawdrive/shared-utils';

interface GalleryCardProps {
  gallery: Gallery;
  onSelect: (gallery: Gallery) => void;
  workspaceId: string;  // ALWAYS include workspace context
}

export const GalleryCard = memo<GalleryCardProps>(({
  gallery,
  onSelect,
  workspaceId
}) => {
  return (
    <AppCard
      hoverable
      onClick={() => onSelect(gallery)}
      data-workspace-id={workspaceId}
    >
      <h3>{gallery.name}</h3>
      <p>{formatRelativeDate(gallery.created_at)}</p>
    </AppCard>
  );
});

GalleryCard.displayName = 'GalleryCard';
```

## Service Pattern (Backend)

```python
# backend/src/app/services/gallery_service.py

from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.gallery_repository import GalleryRepository
from app.models.gallery import Gallery
from app.shared.types import GalleryStatus

class GalleryService:
    """
    Business logic for gallery management.

    CRITICAL: All methods MUST include workspace_id for multi-tenant isolation.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = GalleryRepository(db)

    async def get_by_id(
        self,
        workspace_id: UUID,
        gallery_id: UUID
    ) -> Optional[Gallery]:
        """
        Get gallery by ID.

        Args:
            workspace_id: Workspace UUID (REQUIRED for isolation)
            gallery_id: Gallery UUID

        Returns:
            Gallery object or None
        """
        # ALWAYS include workspace_id in queries
        return await self.repo.get_by_id(workspace_id, gallery_id)

    async def list_galleries(
        self,
        workspace_id: UUID,
        status: Optional[GalleryStatus] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Gallery]:
        """List galleries with pagination."""
        return await self.repo.list_galleries(
            workspace_id=workspace_id,
            status=status,
            limit=limit,
            offset=offset
        )
```

## Repository Pattern (Backend)

```python
# backend/src/app/repositories/gallery_repository.py

from typing import Optional, List
from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gallery import Gallery
from app.shared.types import GalleryStatus

class GalleryRepository:
    """
    Data access layer for galleries.

    ONLY database queries - NO business logic.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(
        self,
        workspace_id: UUID,
        gallery_id: UUID
    ) -> Optional[Gallery]:
        """
        Retrieve gallery by ID with workspace isolation.
        """
        result = await self.db.execute(
            select(Gallery)
            .where(
                Gallery.workspace_id == workspace_id,  # Multi-tenant isolation
                Gallery.id == gallery_id
            )
        )
        return result.scalar_one_or_none()
```

## Microservice Structure

All microservices follow this structure:

```
services/[service-name]/
├── src/
│   ├── api/v1/            # API endpoints
│   ├── services/          # Business logic
│   ├── repositories/      # Database access (if needed)
│   ├── schemas/           # Pydantic request/response models
│   ├── middleware/        # Service-specific middleware
│   ├── cache/             # Redis client
│   ├── observability/     # Metrics, health checks, logging
│   ├── utils/             # JWT validation, etc.
│   ├── config.py          # Service configuration
│   └── main.py            # FastAPI entry point
├── tests/
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── load/              # Load tests (optional)
├── Dockerfile
├── requirements.txt
└── README.md
```

## Critical Rules

1. **Multi-Tenant Isolation**: Every DB query MUST filter by `workspace_id`
2. **File Placement**: Follow the file structure rules - NO random file creation
3. **Shared Types**: Use `@rawdrive/shared-*` packages for cross-platform types
4. **Type Generation**: Run `pnpm generate:python` after modifying shared packages
5. **Storage Keys**: Format: `workspaces/{workspace_id}/assets/{asset_id}/...`
6. **No Hardcoded Secrets**: ALWAYS use environment variables
7. **Path Alias**: Frontend uses `@/*` → `./src/*`
8. **Service Pattern**: Repository → Service → API (3-layer architecture)
9. **Component Limits**: Components <400 lines, Services <600 lines (refactor if larger)
10. **Import Order**: External → Shared packages → Types → Local

## Architecture Patterns

### Repository → Service → API (3-Layer)

```python
# 1. Repository (database queries ONLY)
class GalleryRepository:
    async def get_by_id(self, workspace_id: UUID, gallery_id: UUID) -> Gallery:
        # SQL query

# 2. Service (business logic)
class GalleryService:
    def __init__(self, db: AsyncSession):
        self.repo = GalleryRepository(db)

    async def get_gallery(self, workspace_id: UUID, gallery_id: UUID) -> Gallery:
        # Business logic, validation, caching
        gallery = await self.repo.get_by_id(workspace_id, gallery_id)
        if not gallery:
            raise NotFoundException()
        return gallery

# 3. API (HTTP handling)
@router.get("/galleries/{gallery_id}")
async def get_gallery(
    gallery_id: UUID,
    service: GalleryService = Depends(),
    workspace_id: UUID = Depends(get_workspace_id)
):
    return await service.get_gallery(workspace_id, gallery_id)
```

### Shared Database Pattern (Microservices)

All microservices connect to the same PostgreSQL database with multi-tenant isolation:

```python
# Each service validates JWT and extracts workspace_id
from app.utils.jwt import decode_jwt_token

async def get_workspace_id(token: str = Depends(get_jwt_token)) -> UUID:
    payload = decode_jwt_token(token, settings.JWT_SECRET)
    return UUID(payload["workspace_id"])

# Every query includes workspace_id
result = await db.execute(
    select(Gallery).where(Gallery.workspace_id == workspace_id)
)
```

## Common Mistakes to Avoid

❌ **Creating files in wrong locations:**
```
# WRONG
backend/services/gallery_service.py  # Missing src/app/
frontend/GalleryCard.tsx             # Missing src/components/

# CORRECT
backend/src/app/services/gallery_service.py
frontend/src/components/features/gallery/GalleryCard.tsx
```

❌ **Putting business logic in models:**
```python
# WRONG (models should be pure SQLAlchemy)
class Gallery(Base):
    def calculate_total_size(self):
        # Business logic

# CORRECT (business logic in services)
class GalleryService:
    async def calculate_total_size(self, gallery_id: UUID):
        # Business logic
```

❌ **Not including workspace_id:**
```python
# WRONG (no multi-tenant isolation)
result = await db.execute(select(Gallery).where(Gallery.id == gallery_id))

# CORRECT
result = await db.execute(
    select(Gallery).where(
        Gallery.workspace_id == workspace_id,
        Gallery.id == gallery_id
    )
)
```

❌ **Hardcoding values:**
```typescript
// WRONG
const API_URL = "http://localhost:8000";

// CORRECT
import { API_BASE } from '@rawdrive/shared-constants';
```

## Quick Reference

### When creating a new...

- **React component** → `frontend/src/components/[ui|layout|features]/ComponentName.tsx`
- **React page** → `frontend/src/pages/[public|workspace|feature]/PageName.tsx`
- **React hook** → `frontend/src/hooks/useHookName.ts`
- **API endpoint** → `backend/src/app/api/v1/endpoint_name.py`
- **Service** → `backend/src/app/services/service_name.py`
- **Repository** → `backend/src/app/repositories/repository_name.py`
- **Model** → `backend/src/app/models/model_name.py`
- **Migration** → `cd backend && alembic revision --autogenerate -m "description"`
- **Microservice** → `services/service-name/` (follow microservice template)
- **Shared type** → `packages/shared-types/src/` then `pnpm generate:python`
- **Documentation** → `docs/Features/` or `docs/Business_Features/`
- **Script** → `scripts/script-name.sh` or `scripts/script-name.ts`

### When working with...

- **Microservices** → Check `services/gallery-service/` as reference implementation
- **Traefik routing** → See `infrastructure/docker/traefik/dynamic.yaml`
- **KEDA scaling** → See `infrastructure/kubernetes/base/keda/scaledobjects.yaml`
- **Shared packages** → Run `pnpm generate:python` after TypeScript changes
- **Database** → Always include `workspace_id` in queries
- **File uploads** → Use Upload Service (TUS protocol, chunking, encryption)
- **Payments** → Use Billing Service (Stripe/Razorpay integration)
