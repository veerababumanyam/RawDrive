# RawDrive Codebase Conventions

This document outlines the coding conventions and patterns used throughout the RawDrive codebase.

---

## 📋 Table of Contents

- [Naming Conventions](#naming-conventions)
- [File Placement Rules](#file-placement-rules)
- [Multi-Tenant Patterns](#multi-tenant-patterns)
- [Shared Types Usage](#shared-types-usage)
- [Security Patterns](#security-patterns)
- [Git Conventions](#git-conventions)
- [Import Patterns](#import-patterns)
- [Architecture Patterns](#architecture-patterns)
- [Error Handling](#error-handling)

---

## 🏷️ Naming Conventions

### Frontend (React/TypeScript)

| Type | Convention | Example |
|------|------------|---------|
| Components | `PascalCase.tsx` | `GalleryCard.tsx` |
| Hooks | `useCamelCase.ts` | `useGalleryAssets.ts` |
| Services | `camelCase.ts` | `galleryService.ts` |
| Utilities | `camelCase.ts` | `formatFileSize.ts` |
| Constants | `SCREAMING_SNAKE` | `API_BASE.ts` |
| Files | `kebab-case` | `gallery-upload.tsx` |

### Backend (Python)

| Type | Convention | Example |
|------|------------|---------|
| Classes | `PascalCase` | `FaceRepository` |
| Methods | `snake_case` | `get_by_id` |
| Functions | `snake_case` | `create_gallery` |
| Variables | `snake_case` | `workspace_id` |
| Constants | `SCREAMING_SNAKE` | `JWT_SECRET` |
| Files | `snake_case.py` | `face_repository.py` |

### APIs

| Type | Convention | Example |
|------|------------|---------|
| Routes | `/api/v1/kebab-case` | `/api/v1/gallery-items` |
| Query Params | `snake_case` | `?page_size=20` |
| Path Params | `kebab-case` | `/galleries/{gallery_id}` |

### Database

| Type | Convention | Example |
|------|------------|---------|
| Tables | `snake_case` | `gallery_items` |
| Columns | `snake_case` | `created_at` |
| Foreign Keys | `snake_case_id` | `gallery_id` |

---

## 📁 File Placement Rules

### CRITICAL: Never Create Files in Random Locations

### Frontend Files

```
frontend/src/
├── components/
│   ├── ui/              # Design system components
│   │   ├── AppButton.tsx
│   │   ├── AppInput.tsx
│   │   └── ...
│   ├── layout/          # Layout components
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   └── ...
│   └── features/        # Feature-specific components
│       ├── gallery/     # Gallery components
│       │   ├── GalleryCard.tsx
│       │   ├── GalleryGrid.tsx
│       │   ├── __tests__/    # Unit tests
│       │   │   ├── GalleryCard.test.tsx
│       │   │   └── ...
│       ├── upload/      # Upload components
│       │   ├── UploadDropzone.tsx
│       │   └── ...
│       └── [feature]/   # Other features
├── pages/               # Page components (route handlers)
│   ├── Dashboard.tsx
│   ├── Galleries.tsx
│   └── Settings.tsx
├── hooks/               # Custom React hooks
│   ├── useGalleryAssets.ts
│   └── useAuth.ts
├── services/            # API client services
│   ├── galleryService.ts
│   └── authService.ts
├── contexts/            # React contexts
│   ├── AuthContext.tsx
│   └── ThemeContext.tsx
└── utils/               # Utility functions
    ├── formatDate.ts
    └── validateEmail.ts
```

### Backend Files

```
backend/src/app/
├── api/v1/              # API endpoints
│   ├── faces.py
│   ├── galleries.py
│   └── auth.py
├── models/              # SQLAlchemy models
│   ├── asset.py
│   ├── gallery.py
│   └── user.py
├── repositories/        # Data access layer
│   ├── face_repository.py
│   └── gallery_repository.py
├── services/            # Business logic
│   ├── face_detection_service.py
│   └── gallery_service.py
├── middleware/          # FastAPI middleware
│   ├── auth.py
│   └── rate_limit.py
└── workers/             # Background workers
    └── celery_tasks.py
```

### Microservices Files

```
services/[service-name]/
├── src/
│   ├── api/v1/          # API endpoints
│   ├── services/        # Business logic
│   ├── repositories/    # Database access
│   ├── schemas/         # Pydantic schemas
│   ├── observability/   # Health checks, metrics
│   └── config.py        # Configuration
└── tests/               # Unit, integration, load tests
    ├── unit/
    └── integration/
```

---

## 🏢 Multi-Tenant Patterns

### Workspace Isolation (MANDATORY)

ALL database queries MUST include `workspace_id` for multi-tenant isolation:

```python
# ✅ CORRECT - Always include workspace_id
async def get_gallery_by_id(
    self,
    gallery_id: UUID,
    workspace_id: UUID
) -> Gallery:
    result = await db.execute(
        select(Gallery)
        .where(
            Gallery.gallery_id == gallery_id,
            Gallery.workspace_id == workspace_id
        )
    )
    return result.scalar_one_or_none()

# ❌ WRONG - No workspace_id isolation
async def get_gallery_by_id(self, gallery_id: UUID) -> Gallery:
    result = await db.execute(
        select(Gallery).where(Gallery.gallery_id == gallery_id)
    )
    return result.scalar_one_or_none()
```

### JWT Token Extraction

Never trust client-provided `workspace_id`. Extract from JWT token:

```python
from fastapi import Depends, HTTPException
from app.api.dependencies.auth import CurrentUserDep

async def get_workspace_user(
    current_user: CurrentUserDep = Depends()
) -> tuple[UUID, UUID]:
    """Extract workspace_id and user_id from JWT token."""
    return current_user.workspace_id, current_user.user_id
```

---

## 🔄 Shared Types Usage

RawDrive uses a monorepo with pnpm workspaces for shared code:

### Available Shared Packages

| Package | Purpose | Example Usage |
|---------|---------|---------------|
| `@rawdrive/shared-types` | Domain types | `import { InvitationStatus }` |
| `@rawdrive/shared-constants` | Configuration | `import { API_BASE, PAGINATION }` |
| `@rawdrive/shared-validation` | Validation | `import { isValidHexColor }` |
| `@rawdrive/shared-utils` | Utilities | `import { formatRelativeDate }` |

### Frontend Usage

```typescript
// Import from shared packages
import { InvitationStatus, GalleryStatus } from '@rawdrive/shared-types';
import { API_BASE, PAGINATION, AI_THRESHOLDS } from '@rawdrive/shared-constants';
import { isValidHexColor, sanitizeHtml } from '@rawdrive/shared-validation';
import { formatRelativeDate, formatFileSize } from '@rawdrive/shared-utils';
```

### Backend Usage

Python types are generated from TypeScript:

```python
# Import generated Python modules
from app.shared.types import InvitationStatus, GalleryStatus
from app.shared.constants import API_BASE, PAGINATION, AI_THRESHOLDS
```

---

## 🔒 Security Patterns

### JWT Authentication

```python
# Validate JWT tokens in all microservices
from fastapi import Depends, HTTPException, status
from app.api.dependencies.auth import CurrentUserDep

@router.get("/galleries/{gallery_id}")
async def get_gallery(
    gallery_id: UUID,
    current_user: CurrentUserDep = Depends()
) -> Gallery:
    # workspace_id is extracted from JWT and validated
    return await gallery_service.get_gallery(gallery_id, current_user.workspace_id)
```

### RBAC Separation

- **Workspace RBAC ≠ Platform RBAC** - Keep permission systems separate
- Auth: Google OAuth primary; local fallback
- Client portal & share links: capability-based; respect per-link download policy
- Download policies: `view_only|web_only|watermarked_only|original_allowed`

### Input Validation

```python
from pydantic import BaseModel, Field, validator
from app.shared.validation import sanitize_html

class CreateGalleryRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: str = Field(..., max_length=1000)

    @validator('description')
    def validate_description(cls, v):
        # Sanitize HTML to prevent XSS
        return sanitize_html(v)
```

### Never Hardcode

- ❌ API keys, secrets, credentials
- ❌ LLM provider names or model identifiers
- ❌ Colors (use design tokens from `@rawdrive/shared-constants`)
- ❌ User-facing strings (use i18n)
- ❌ Magic numbers (use named constants)

---

## 📝 Git Conventions

### Conventional Commits

Use the following format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Commit Types

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(gallery): add bulk upload functionality` |
| `fix` | Bug fix | `fix(auth): resolve JWT token expiration issue` |
| `docs` | Documentation | `docs: update API documentation` |
| `style` | Code formatting | `style: fix linting issues` |
| `refactor` | Code restructuring | `refactor: extract gallery service` |
| `perf` | Performance improvement | `perf: optimize database queries` |
| `test` | Test additions/fixes | `test: add unit tests for gallery service` |
| `chore` | Maintenance tasks | `chore: update dependencies` |
| `ci` | CI/CD changes | `ci: add GitHub Actions workflow` |

### Commit Examples

```
feat(ai): implement face detection endpoint

- Add POST /api/v1/faces/detect endpoint
- Support batch processing of images
- Return face embeddings with 512 dimensions

Closes #123

fix(gallery): resolve race condition in asset uploads

- Add transaction to prevent partial uploads
- Implement retry mechanism for failed uploads
- Add proper error handling

perf: optimize gallery loading with virtual scrolling

- Implement react-window for large galleries
- Reduce initial bundle size by 40%
- Improve load time from 3s to 800ms
```

---

## 📦 Import Patterns

### External → Shared → Local

Always follow this import order:

```typescript
// 1. External dependencies
import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

// 2. Shared packages (from monorepo)
import { GalleryStatus } from '@rawdrive/shared-types';
import { API_BASE } from '@rawdrive/shared-constants';
import { sanitizeHtml } from '@rawdrive/shared-validation';

// 3. Local imports (relative)
import { useGalleryAssets } from '../../hooks/useGalleryAssets';
import { GalleryCard } from '../components/GalleryCard';
import { galleryService } from '../services/galleryService';
```

### Python Imports

```python
# 1. Standard library
import os
from typing import Optional, List
from uuid import UUID

# 2. Third-party dependencies
import fastapi
import sqlalchemy
from pydantic import BaseModel, Field

# 3. Internal imports
from app.db.postgres import get_postgres_pool
from app.models.gallery import Gallery
from app.repositories.gallery_repository import GalleryRepository
from app.services.gallery_service import GalleryService
from app.api.schemas import GalleryResponse
```

---

## 🏗️ Architecture Patterns

### Backend 3-Layer Architecture

```python
# 1. Repository (database access)
class FaceRepository:
    async def create_face(
        self,
        workspace_id: UUID,
        face_data: dict
    ) -> Face:
        # Database query with workspace isolation
        pass

# 2. Service (business logic)
class FaceService:
    async def detect_faces(
        self,
        workspace_id: UUID,
        image_data: bytes
    ) -> List[Face]:
        # Business logic + validation
        pass

# 3. API (HTTP handling)
@router.post("/faces/detect")
async def detect_faces(
    request: DetectFacesRequest,
    current_user: CurrentUserDep = Depends(),
    face_service: FaceService = Depends(get_face_service)
) -> DetectFacesResponse:
    return await face_service.detect_faces(
        current_user.workspace_id,
        request.image_data
    )
```

### Frontend Service Pattern

```typescript
// Service layer
class GalleryService {
  async getGalleries(workspaceId: string): Promise<Gallery[]> {
    const response = await axios.get<Gallery[]>(
      `${API_BASE}/api/v1/galleries`,
      { params: { workspace_id: workspaceId } }
    );
    return response.data;
  }
}

// Component usage
function useGalleries() {
  const { workspace } = useAuth();
  const { data, error, isLoading } = useQuery({
    queryKey: ['galleries', workspace?.workspace_id],
    queryFn: () => galleryService.getGalleries(workspace?.workspace_id),
  });
  return { data, error, isLoading };
}
```

---

## 🚨 Error Handling

### Frontend Error Handling

```typescript
// Custom hook for error handling
function useErrorHandler() {
  const [error, setError] = useState<Error | null>(null);

  const handleError = (err: Error) => {
    console.error('Error:', err);
    setError(err);
    // Show user-friendly error message
    toast.error(err.message || 'An error occurred');
  };

  return { error, handleError, clearError: () => setError(null) };
}

// Service error handling
class GalleryService {
  async createGallery(gallery: CreateGalleryRequest): Promise<Gallery> {
    try {
      const response = await axios.post<Gallery>(
        `${API_BASE}/api/v1/galleries`,
        gallery,
        { withCredentials: true }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to create gallery');
      }
      throw error;
    }
  }
}
```

### Backend Error Handling

```python
from fastapi import HTTPException, status
from app.services.face_exceptions import FaceNotFoundError

class FaceService:
    async def get_face(self, face_id: UUID, workspace_id: UUID) -> Face:
        face = await self.face_repository.get_by_id(face_id, workspace_id)
        if not face:
            raise FaceNotFoundError(f"Face {face_id} not found")
        return face

# Custom exception
class FaceDetectionError(Exception):
    """Raised when face detection fails."""
    pass

# API endpoint error handling
@router.get("/faces/{face_id}")
async def get_face(
    face_id: UUID,
    current_user: CurrentUserDep = Depends(),
    face_service: FaceService = Depends(get_face_service)
):
    try:
        face = await face_service.get_face(face_id, current_user.workspace_id)
        return face
    except FaceNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Face not found"
        )
```

---

## 📊 Additional Patterns

### Logging

```python
import logging

logger = logging.getLogger(__name__)

class GalleryService:
    async def create_gallery(self, gallery: CreateGalleryRequest) -> Gallery:
        logger.info("Creating gallery", extra={
            "workspace_id": workspace_id,
            "title": gallery.title
        })

        try:
            # ... business logic ...
            logger.info("Gallery created successfully", extra={
                "gallery_id": new_gallery.gallery_id
            })
        except Exception as e:
            logger.error("Failed to create gallery", extra={
                "error": str(e),
                "workspace_id": workspace_id
            })
            raise
```

### Caching

```python
import redis
from functools import wraps

# Redis client
redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    db=0
)

def cache_with_expiry(expiry: int = 300):
    """Decorator for Redis caching with expiry."""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            cached = redis_client.get(cache_key)

            if cached:
                return json.loads(cached)

            result = await func(*args, **kwargs)
            redis_client.setex(cache_key, expiry, json.dumps(result))
            return result
        return wrapper
    return decorator
```

---

## 🔍 Best Practices

1. **Always include workspace_id** in all database queries
2. **Validate input** at all layers (API, Service, Repository)
3. **Use shared packages** for common functionality
4. **Follow conventional commits** for consistent history
5. **Write tests** before implementation (TDD)
6. **Document** complex business logic
7. **Use type hints** in Python and TypeScript
8. **Handle errors gracefully** with user-friendly messages
9. **Log important operations** for debugging
10. **Cache frequently accessed data** for performance

---

**Last Updated**: 2026-02-08
**Maintained by**: RawDrive Development Team