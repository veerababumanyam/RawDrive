---
name: project-structure
aliases: [codebase, architecture, folders, conventions, layout, organization]
description: Project structure and coding conventions for RawDrive. Use when creating new files, organizing code, or understanding the codebase layout.
---

# Project Structure & Coding Conventions

## Architecture Overview

RawDrive is an enterprise SaaS photography platform with a **pnpm monorepo structure**:

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
│   │   │   ├── layout/    # Layout components
│   │   │   └── features/  # Feature-specific components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API clients
│   │   ├── contexts/      # React contexts
│   │   ├── types/         # TypeScript types (re-exports from @rawdrive/shared-types)
│   │   └── utils/         # Utility functions (re-exports from @rawdrive/shared-utils)
│   └── public/            # Static assets
│
├── backend/               # Python 3.11 + FastAPI
│   ├── src/app/
│   │   ├── api/           # API route handlers
│   │   │   └── v1/        # Versioned API routes
│   │   ├── services/      # Business logic
│   │   ├── repositories/  # Database access layer
│   │   ├── models/        # SQLAlchemy models
│   │   ├── middleware/    # FastAPI middleware
│   │   ├── config/        # Configuration
│   │   ├── utils/         # Utilities
│   │   ├── shared/        # Generated Python types from @rawdrive/shared-*
│   │   └── workers/       # Background job workers
│   ├── migrations/        # Alembic migrations
│   └── tests/             # pytest tests
│
├── ai-service/            # Python FastAPI + MCP
│   └── src/               # AI/ML services
│
├── services/              # Microservices
│   └── invitations-service/  # Wedding invitations microservice
│       └── src/shared/    # Generated Python types
│
├── scripts/               # Build and generation scripts
│   └── generate-python-types.ts  # TypeScript → Python generator
│
├── infrastructure/        # Docker, nginx, monitoring
├── docs/                  # Documentation
├── specs/                 # Feature specifications
└── .claude/               # Claude Code skills
```

## Key Files

### Frontend

| Purpose | Location |
|---------|----------|
| Entry point | `frontend/src/main.tsx` |
| App router | `frontend/src/App.tsx` |
| Types | `frontend/src/types/` |
| API client | `frontend/src/services/apiService.ts` |
| UI components | `frontend/src/components/ui/` |
| CSS variables | `frontend/src/index.css` |
| Tailwind config | `frontend/tailwind.config.js` |

### Backend

| Purpose | Location |
|---------|----------|
| FastAPI entry | `backend/src/app/main.py` |
| API routes | `backend/src/app/api/v1/` |
| Services | `backend/src/app/services/` |
| Repositories | `backend/src/app/repositories/` |
| Models | `backend/src/app/models/` |
| Migrations | `backend/migrations/versions/` |
| Config | `backend/src/app/config/` |

### AI Service

| Purpose | Location |
|---------|----------|
| FastAPI entry | `ai-service/src/main.py` |
| MCP server | `ai-service/src/mcp/` |

### Shared Packages

| Purpose | Location |
|---------|----------|
| Types (TS) | `packages/shared-types/src/` |
| Constants (TS) | `packages/shared-constants/src/` |
| Validation (TS) | `packages/shared-validation/src/` |
| Utils (TS) | `packages/shared-utils/src/` |
| Python generator | `scripts/generate-python-types.ts` |
| Backend Python types | `backend/src/app/shared/` |
| Workspace config | `pnpm-workspace.yaml` |

## Commands

```bash
# Development
npm run dev                    # Frontend (localhost:3000)
cd backend && uvicorn src.app.main:app --reload  # Backend (localhost:8000)

# Database
cd backend && alembic upgrade head   # Run migrations
cd backend && alembic revision -m "description"  # New migration

# Docker (PostgreSQL + Redis)
npm run docker:dev:up         # Start dev containers
npm run docker:dev:down       # Stop

# Testing
cd frontend && npm test       # Vitest
cd backend && pytest          # pytest

# Shared Packages (pnpm workspaces)
pnpm install                  # Install all workspace dependencies
pnpm build:packages           # Build all shared packages
pnpm generate:python          # Generate Python types from TypeScript
pnpm test:packages            # Test shared packages
pnpm test:parity              # Run cross-platform type parity tests
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| React components | PascalCase | `GalleryGrid.tsx` |
| Python services | snake_case | `gallery_service.py` |
| Hooks | camelCase + use | `useGallery.ts` |
| API routes | kebab-case | `/v1/photo-albums` |
| DB tables | snake_case | `user_roles` |
| Env vars | SCREAMING_SNAKE | `JWT_SECRET` |

## Import Patterns

### Frontend (TypeScript)

```typescript
// 1. External imports
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// 2. Shared packages (preferred for cross-platform types)
import { InvitationStatus, GalleryStatus } from '@rawdrive/shared-types';
import { API_BASE, PAGINATION } from '@rawdrive/shared-constants';
import { isValidHexColor, sanitizeHtml } from '@rawdrive/shared-validation';
import { formatRelativeDate } from '@rawdrive/shared-utils';

// 3. Type imports (local re-exports for backward compatibility)
import type { Gallery } from '@/types/gallery';

// 4. Services/hooks
import { useGallery } from '@/hooks/useGallery';

// 5. Components
import { AppButton } from '@/components/ui/AppButton';
```

### Backend (Python)

```python
# 1. Standard library
from typing import Optional
from uuid import UUID

# 2. Third-party
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

# 3. Shared types (generated from TypeScript)
from app.shared.types import InvitationStatus, GalleryStatus
from app.shared.constants import API_BASE, PAGINATION
from app.shared.validation import is_valid_hex_color

# 4. Local imports
from app.services.gallery_service import GalleryService
from app.api.dependencies import get_db, get_current_user
```

## Component Pattern

```typescript
// frontend/src/components/features/gallery/GalleryCard.tsx

import React, { memo } from 'react';
import type { Gallery } from '@/types/gallery';
import { AppCard } from '@/components/ui/AppCard';

interface GalleryCardProps {
  gallery: Gallery;
  onSelect: (gallery: Gallery) => void;
}

export const GalleryCard = memo<GalleryCardProps>(({ gallery, onSelect }) => {
  return (
    <AppCard hoverable onClick={() => onSelect(gallery)}>
      {/* content */}
    </AppCard>
  );
});

GalleryCard.displayName = 'GalleryCard';
```

## Service Pattern (Python)

```python
# backend/src/app/services/gallery_service.py

from typing import Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.gallery_repository import GalleryRepository

class GalleryService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = GalleryRepository(db)

    async def get_by_id(self, workspace_id: UUID, gallery_id: UUID) -> Optional[Gallery]:
        # ALWAYS include workspace_id for tenant isolation
        return await self.repo.get_by_id(workspace_id, gallery_id)
```

## Critical Rules

1. **Workspace Isolation**: Every DB query MUST filter by `workspace_id`
2. **Storage Keys**: Format: `workspaces/{workspace_id}/assets/{asset_id}/...`
3. **No Hardcoded Secrets**: Use environment variables
4. **Path Alias**: Frontend uses `@/*` → `./src/*`
5. **File Limits**: Components <400 lines, Services <600 lines
6. **Shared Types**: Use `@rawdrive/shared-*` for cross-platform types (TS→Python)
7. **Type Generation**: Run `pnpm generate:python` after modifying shared packages
