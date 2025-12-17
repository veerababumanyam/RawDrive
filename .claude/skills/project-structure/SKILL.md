---
name: project-structure
description: Project structure and coding conventions for RawDrive. Use when creating new files, organizing code, or understanding the codebase layout.
---

# Project Structure & Coding Conventions

## Overview

RawDrive is an enterprise SaaS professional photography management platform built as a **TurboRepo monorepo**. This structure enables shared packages, consistent tooling, and efficient builds across all applications.

## Monorepo Architecture

```
RawDrive/
├── apps/                          # Application packages
│   ├── web/                       # Main frontend (React 19 + Vite + TypeScript)
│   │   ├── src/
│   │   │   ├── components/        # React components
│   │   │   │   └── ui/            # Design system components
│   │   │   ├── pages/             # Page components
│   │   │   ├── hooks/             # Custom React hooks
│   │   │   ├── services/          # API clients and services
│   │   │   ├── stores/            # State management
│   │   │   ├── types/             # TypeScript types
│   │   │   └── utils/             # Utility functions
│   │   ├── public/                # Static assets
│   │   └── package.json
│   │
│   ├── admin/                     # Admin dashboard (React 19 + Vite)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── pages/
│   │   │   ├── hooks/
│   │   │   └── services/
│   │   └── package.json
│   │
│   ├── api/                       # Backend API (Express 5 + TypeScript)
│   │   ├── src/
│   │   │   ├── routes/            # API route handlers
│   │   │   │   └── v1/            # Versioned API routes
│   │   │   ├── controllers/       # Request handlers
│   │   │   ├── services/          # Business logic
│   │   │   ├── middleware/        # Express middleware
│   │   │   ├── db/                # Database (migrations, seeds)
│   │   │   │   ├── migrations/
│   │   │   │   └── seeds/
│   │   │   ├── workers/           # Background job workers (BullMQ)
│   │   │   └── config/            # Configuration files
│   │   └── package.json
│   │
│   └── ai-service/                # AI/ML service (Python FastAPI + MCP)
│       ├── src/
│       │   ├── api/               # REST API routes
│       │   ├── mcp/               # Model Context Protocol server
│       │   ├── services/          # AI services (face, curation, search)
│       │   ├── models/            # Pydantic models
│       │   └── db/                # Database access
│       ├── tests/
│       └── pyproject.toml
│
├── packages/                      # Shared packages
│   ├── ui/                        # Shared UI components
│   │   ├── src/
│   │   │   ├── components/        # Reusable components
│   │   │   ├── hooks/             # Shared hooks
│   │   │   └── styles/            # Shared styles/tokens
│   │   └── package.json
│   │
│   ├── config/                    # Shared configuration
│   │   ├── eslint/                # ESLint presets
│   │   ├── typescript/            # TypeScript configs
│   │   └── tailwind/              # Tailwind presets
│   │
│   ├── types/                     # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── api.ts             # API types
│   │   │   ├── models.ts          # Domain models
│   │   │   └── index.ts           # Type exports
│   │   └── package.json
│   │
│   └── utils/                     # Shared utilities
│       ├── src/
│       │   ├── validation.ts      # Zod schemas
│       │   ├── formatting.ts      # Format helpers
│       │   └── crypto.ts          # Encryption utilities
│       └── package.json
│
├── infrastructure/                # Infrastructure configs
│   ├── docker/                    # Docker configs
│   ├── nginx/                     # Nginx configs
│   └── monitoring/                # Prometheus, Grafana
│
├── docs/                          # Documentation
│   ├── api/                       # API documentation
│   ├── architecture/              # Architecture docs
│   └── TechnicalSpecs/            # Technical specifications
│
├── .claude/                       # Claude Code skills and agents
│   ├── skills/
│   └── agents/
│
├── turbo.json                     # TurboRepo configuration
├── package.json                   # Root package.json
├── pnpm-workspace.yaml            # PNPM workspace config
└── CLAUDE.md                      # AI assistant context
```

## Package Relationships

```
                    packages/types
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    packages/utils  packages/ui    packages/config
         │               │               │
         └───────┬───────┘               │
                 │                       │
    ┌────────────┼────────────┐          │
    │            │            │          │
apps/web    apps/admin    apps/api ──────┘
    │            │            │
    └────────────┴────────────┘
                 │
           apps/ai-service
```

## Key Files by Location

### Root Level

| Purpose | Location |
|---------|----------|
| TurboRepo config | `turbo.json` |
| PNPM workspace | `pnpm-workspace.yaml` |
| Root package.json | `package.json` |
| Environment vars | `.env` (single source of truth) |
| AI context | `CLAUDE.md` |

### Apps - Web (Main Frontend)

| Purpose | Location |
|---------|----------|
| Entry point | `apps/web/src/main.tsx` |
| App router | `apps/web/src/App.tsx` |
| Types | `apps/web/src/types/` |
| API client | `apps/web/src/services/apiService.ts` |
| UI components | `apps/web/src/components/ui/` |
| CSS variables | `apps/web/src/index.css` |
| Tailwind config | `apps/web/tailwind.config.js` |

### Apps - Admin Dashboard

| Purpose | Location |
|---------|----------|
| Entry point | `apps/admin/src/main.tsx` |
| Admin routes | `apps/admin/src/pages/` |
| Admin services | `apps/admin/src/services/` |

### Apps - API (Backend)

| Purpose | Location |
|---------|----------|
| Entry point | `apps/api/src/index.ts` |
| API routes | `apps/api/src/routes/v1/` |
| Services | `apps/api/src/services/` |
| Database config | `apps/api/src/config/database.ts` |
| Redis config | `apps/api/src/config/redis.ts` |
| Storage config | `apps/api/src/config/storage.ts` |
| Migrations | `apps/api/src/db/migrations/` |
| Workers | `apps/api/src/workers/` |
| Upload service | `apps/api/src/services/UploadService.ts` |
| Storage service | `apps/api/src/services/StorageService.ts` |

### Apps - AI Service

| Purpose | Location |
|---------|----------|
| FastAPI entry | `apps/ai-service/src/main.py` |
| MCP server | `apps/ai-service/src/mcp/server.py` |
| AI services | `apps/ai-service/src/services/` |
| Face recognition | `apps/ai-service/src/services/face_recognition.py` |
| Semantic search | `apps/ai-service/src/services/semantic_search.py` |

### Shared Packages

| Purpose | Location |
|---------|----------|
| Shared UI | `packages/ui/src/components/` |
| Shared types | `packages/types/src/` |
| Shared utils | `packages/utils/src/` |
| ESLint config | `packages/config/eslint/` |
| TS config | `packages/config/typescript/` |
| Tailwind preset | `packages/config/tailwind/` |

## TurboRepo Commands

```bash
# Development
pnpm dev                    # Start all apps in dev mode
pnpm dev --filter=web       # Start only web app
pnpm dev --filter=admin     # Start only admin app
pnpm dev --filter=api       # Start only API
pnpm dev --filter=ai-service # Start AI service

# Building
pnpm build                  # Build all packages and apps
pnpm build --filter=web     # Build only web app
pnpm build --filter=api     # Build only API

# Testing
pnpm test                   # Run all tests
pnpm test --filter=web      # Run web tests only
pnpm test --filter=api      # Run API tests only

# Linting
pnpm lint                   # Lint all workspaces
pnpm lint --filter=web      # Lint web only

# Type checking
pnpm typecheck              # Check types across all packages

# Database (from apps/api)
pnpm --filter=api db:migrate
pnpm --filter=api db:seed
pnpm --filter=api db:setup-all

# Docker
pnpm docker:dev:up          # Start dev containers (Postgres, Redis)
pnpm docker:dev:down        # Stop dev containers

# Workers
pnpm --filter=api workers   # Start background job workers
```

## Package Import Conventions

### Internal Package Imports

```typescript
// Import from shared packages
import { Button, Input, Card } from '@rawdrive/ui';
import { User, Gallery, Asset } from '@rawdrive/types';
import { validateEmail, formatDate } from '@rawdrive/utils';

// Import within apps using path aliases
// apps/web
import { GalleryView } from '@/pages/GalleryView';
import { useAuth } from '@/hooks/useAuth';
import { apiService } from '@/services/apiService';

// apps/api
import { GalleryService } from '@/services/GalleryService';
import { authenticate } from '@/middleware/auth';
```

### Import Order

```typescript
// 1. Node/external imports
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera } from 'lucide-react';

// 2. Shared package imports
import { Button, Card } from '@rawdrive/ui';
import type { Gallery } from '@rawdrive/types';

// 3. App-local type imports
import type { GalleryViewProps } from '@/types/components';

// 4. App-local services/hooks
import { useGallery } from '@/hooks/useGallery';
import { galleryService } from '@/services/galleryService';

// 5. App-local components
import { GalleryHeader } from '@/components/GalleryHeader';
```

## Naming Conventions

### Files and Directories

| Type | Convention | Example |
|------|------------|---------|
| React components | PascalCase | `GalleryGrid.tsx` |
| React pages | PascalCase | `GalleryView.tsx` |
| Hooks | camelCase with use prefix | `useGallery.ts` |
| Services | PascalCase + Service | `GalleryService.ts` |
| Utils | camelCase | `formatDate.ts` |
| Types | camelCase | `gallery.ts` |
| Constants | camelCase | `apiEndpoints.ts` |
| Tests | same as source + .test | `GalleryService.test.ts` |

### TypeScript Naming

| Type | Convention | Example |
|------|------------|---------|
| Interfaces | PascalCase | `interface Gallery {}` |
| Types | PascalCase | `type GalleryStatus = ...` |
| Props interfaces | ComponentName + Props | `GalleryGridProps` |
| Enums | PascalCase | `enum GalleryType {}` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_UPLOAD_SIZE` |
| Functions | camelCase | `getGalleryById()` |
| Classes | PascalCase | `GalleryService` |

### API and Database

| Type | Convention | Example |
|------|------------|---------|
| API routes | kebab-case | `/v1/photo-albums` |
| Database tables | snake_case | `user_roles` |
| Database columns | snake_case | `created_at` |
| Environment vars | SCREAMING_SNAKE_CASE | `JWT_SECRET` |

## Component Structure

```typescript
// apps/web/src/components/GalleryGrid.tsx

// 1. External imports
import React, { useState, useCallback, memo } from 'react';
import { Camera } from 'lucide-react';

// 2. Shared package imports
import { Card, Button } from '@rawdrive/ui';
import type { Gallery } from '@rawdrive/types';

// 3. Local imports
import { useGalleryActions } from '@/hooks/useGalleryActions';

// 4. Props interface
interface GalleryGridProps {
  galleries: Gallery[];
  onSelect: (gallery: Gallery) => void;
  isLoading?: boolean;
}

// 5. Component export (prefer named exports)
export const GalleryGrid: React.FC<GalleryGridProps> = memo(({
  galleries,
  onSelect,
  isLoading = false,
}) => {
  // Hooks first
  const { handleDelete, handleShare } = useGalleryActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Event handlers
  const handleClick = useCallback((gallery: Gallery) => {
    setSelectedId(gallery.id);
    onSelect(gallery);
  }, [onSelect]);

  // Early returns for loading/empty states
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (galleries.length === 0) {
    return <EmptyState icon={<Camera />} title="No galleries" />;
  }

  // Render
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {galleries.map(gallery => (
        <Card key={gallery.id} onClick={() => handleClick(gallery)}>
          {/* Card content */}
        </Card>
      ))}
    </div>
  );
});

GalleryGrid.displayName = 'GalleryGrid';
```

## Service Pattern

```typescript
// apps/api/src/services/GalleryService.ts

import { pool } from '@/config/database';
import { cacheGet, cacheSet, cacheInvalidate } from '@/config/redis';
import type { Gallery, CreateGalleryInput } from '@rawdrive/types';

export class GalleryService {
  private static instance: GalleryService;

  private constructor() {}

  static getInstance(): GalleryService {
    if (!GalleryService.instance) {
      GalleryService.instance = new GalleryService();
    }
    return GalleryService.instance;
  }

  async getById(workspaceId: string, galleryId: string): Promise<Gallery | null> {
    // Check cache first
    const cacheKey = `gallery:${workspaceId}:${galleryId}`;
    const cached = await cacheGet<Gallery>(cacheKey);
    if (cached) return cached;

    // Query database - ALWAYS include workspace_id
    const result = await pool.query(
      `SELECT * FROM galleries
       WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL`,
      [workspaceId, galleryId]
    );

    if (result.rows[0]) {
      await cacheSet(cacheKey, result.rows[0], 300);
    }

    return result.rows[0] || null;
  }

  async create(workspaceId: string, input: CreateGalleryInput): Promise<Gallery> {
    const result = await pool.query(
      `INSERT INTO galleries (workspace_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [workspaceId, input.name, input.description]
    );

    // Invalidate list cache
    await cacheInvalidate(`galleries:${workspaceId}`);

    return result.rows[0];
  }
}

export const galleryService = GalleryService.getInstance();
```

## Python Service Pattern (AI Service)

```python
# apps/ai-service/src/services/example_service.py
from typing import Optional
import structlog
from ..config import settings
from ..models.example import ExampleRequest, ExampleResponse

logger = structlog.get_logger(__name__)

class ExampleService:
    _instance: Optional["ExampleService"] = None

    def __init__(self):
        self._initialized = False

    @classmethod
    def get_instance(cls) -> "ExampleService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    async def initialize(self) -> None:
        if self._initialized:
            return
        # Load models, connect to services
        self._initialized = True
        logger.info("ExampleService initialized")

    async def process(self, request: ExampleRequest) -> ExampleResponse:
        if not self._initialized:
            await self.initialize()
        # Process request
        return ExampleResponse(...)
```

## State Management

### Frontend State
- **Local state**: `useState` for component-specific data
- **Global state**: React Context for auth, theme, toast
- **Server state**: TanStack Query for API data
- **Shared state**: Zustand (optional) for complex cross-component state

### Backend State
- **Database**: PostgreSQL for persistent data
- **Cache**: Redis for session, temporary data, rate limits
- **Queue**: BullMQ for background jobs

## Path Aliases

### Apps (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@rawdrive/ui": ["../../packages/ui/src"],
      "@rawdrive/types": ["../../packages/types/src"],
      "@rawdrive/utils": ["../../packages/utils/src"]
    }
  }
}
```

## File Size Limits

| File Type | Max Lines | Action |
|-----------|-----------|--------|
| React components | 400 | Split into smaller components |
| Service classes | 600 | Extract into multiple services |
| Utility files | 300 | Split by domain |
| Test files | 500 | Split by test category |

## Adding New Features

### Creating a New Component

1. Determine if it's app-specific or shared:
   - **Shared**: Create in `packages/ui/src/components/`
   - **App-specific**: Create in `apps/{app}/src/components/`

2. Create the component file following the naming convention

3. Add types to appropriate location:
   - **Shared types**: `packages/types/src/`
   - **Component props**: Same file or adjacent `.types.ts`

4. Export from package index if shared

### Creating a New API Endpoint

1. Create route handler in `apps/api/src/routes/v1/`
2. Create service in `apps/api/src/services/`
3. Add types to `packages/types/src/api.ts`
4. Add controller in `apps/api/src/controllers/`
5. Register route in the router index

### Creating a New Shared Package

1. Create directory in `packages/`
2. Initialize with `pnpm init`
3. Add to `pnpm-workspace.yaml`
4. Configure `package.json` with proper name (`@rawdrive/packagename`)
5. Add tsconfig extending from `packages/config/typescript/`
6. Export from package index

## Critical Architecture Rules

### Multi-Tenant Data Isolation

**CRITICAL**: Every database query MUST include `workspace_id` filtering.

```typescript
// CORRECT - Always filter by workspace_id
const assets = await pool.query(
  `SELECT * FROM assets WHERE workspace_id = $1 AND status = 'available'`,
  [workspaceId]
);

// WRONG - Cross-tenant data leak vulnerability
const assets = await pool.query(
  `SELECT * FROM assets WHERE id = $1`,
  [assetId]
);
```

### Object Storage Key Format

All storage objects MUST include workspace_id prefix:

```
workspaces/{workspace_id}/assets/{asset_id}/original/{filename}
workspaces/{workspace_id}/assets/{asset_id}/derived/{variant}/{filename}
```

### Environment Variables

Never hardcode secrets or provider names:

```typescript
// CORRECT
const apiKey = process.env.AI_API_KEY;
const provider = process.env.AI_PROVIDER;

// WRONG
const apiKey = 'sk-abc123...';
const provider = 'openai';
```
