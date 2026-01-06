---
name: api-standards
aliases: [api, rest, endpoints, http, responses, pagination]
description: API conventions for RawDrive. Use when building API endpoints, designing response formats, implementing pagination, or handling HTTP methods.
---

# API Standards

## URL Structure

```
/api/v1/{resource}
/api/v1/workspaces/{workspace_id}/{resource}
/api/v1/workspaces/{workspace_id}/{resource}/{id}
/api/v1/workspaces/{workspace_id}/{resource}/{id}/{sub-resource}
```

### Examples

```
GET    /api/v1/workspaces/{id}/galleries
POST   /api/v1/workspaces/{id}/galleries
GET    /api/v1/workspaces/{id}/galleries/{id}
PATCH  /api/v1/workspaces/{id}/galleries/{id}
DELETE /api/v1/workspaces/{id}/galleries/{id}
GET    /api/v1/workspaces/{id}/galleries/{id}/assets
```

### Naming Conventions

| Pattern | Example |
|---------|---------|
| Resources | `galleries`, `assets`, `users` (plural) |
| Sub-resources | `galleries/{id}/assets` |
| Actions | `POST /galleries/{id}/publish` |
| Kebab-case | `face-groups`, `upload-sessions` |

## HTTP Methods

| Method | Use Case | Idempotent |
|--------|----------|------------|
| `GET` | Retrieve resource(s) | Yes |
| `POST` | Create resource or action | No |
| `PATCH` | Partial update | Yes |
| `PUT` | Full replacement | Yes |
| `DELETE` | Remove resource | Yes |

## Response Format

### Success (Single Resource)

```json
{
  "data": {
    "id": "uuid",
    "name": "Wedding Gallery",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

### Success (Collection)

```json
{
  "data": [
    { "id": "uuid1", "name": "Gallery 1" },
    { "id": "uuid2", "name": "Gallery 2" }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

### Error Response

```json
{
  "error": "ValidationError",
  "message": "Please correct the errors below",
  "details": [
    { "field": "name", "message": "Name is required" },
    { "field": "email", "message": "Invalid email format" }
  ],
  "request_id": "req_abc123"
}
```

## Status Codes

| Code | Use Case |
|------|----------|
| `200` | Success (GET, PATCH, DELETE) |
| `201` | Created (POST) |
| `204` | No Content (DELETE with no body) |
| `400` | Bad Request (validation error) |
| `401` | Unauthorized (no/invalid token) |
| `403` | Forbidden (no permission) |
| `404` | Not Found |
| `409` | Conflict (duplicate, state conflict) |
| `422` | Unprocessable Entity (business logic) |
| `429` | Too Many Requests (rate limited) |
| `500` | Internal Server Error |

## Pagination

### Offset-Based (Simple)

```
GET /galleries?page=2&limit=20
```

```json
{
  "data": [...],
  "pagination": {
    "total": 100,
    "page": 2,
    "limit": 20,
    "pages": 5
  }
}
```

### Cursor-Based (Large Datasets)

```
GET /assets?cursor=eyJpZCI6MTIzfQ&limit=50
```

```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTczfQ",
    "has_more": true
  }
}
```

### Implementation

```python
# FastAPI pagination
from fastapi import Query

@router.get("/galleries")
async def list_galleries(
    workspace_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    offset = (page - 1) * limit
    galleries = await repo.list(workspace_id, offset=offset, limit=limit)
    total = await repo.count(workspace_id)

    return {
        "data": galleries,
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "pages": (total + limit - 1) // limit,
        }
    }
```

## Filtering & Sorting

### Query Parameters

```
GET /assets?status=available&type=photo&sort=-created_at&limit=50
```

| Parameter | Format | Example |
|-----------|--------|---------|
| Filter | `field=value` | `status=available` |
| Multi-value | `field=a,b,c` | `type=photo,video` |
| Sort (asc) | `sort=field` | `sort=name` |
| Sort (desc) | `sort=-field` | `sort=-created_at` |
| Search | `q=term` | `q=wedding` |

### Implementation

```python
@router.get("/assets")
async def list_assets(
    workspace_id: UUID,
    status: str | None = None,
    type: str | None = None,
    sort: str = "-created_at",
    q: str | None = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    filters = {}
    if status:
        filters["status"] = status
    if type:
        filters["type"] = type.split(",")

    # Parse sort
    sort_desc = sort.startswith("-")
    sort_field = sort.lstrip("-")

    return await repo.list(
        workspace_id,
        filters=filters,
        sort_by=sort_field,
        sort_desc=sort_desc,
        search=q,
        offset=(page - 1) * limit,
        limit=limit,
    )
```

## Request Validation

```python
from pydantic import BaseModel, Field, field_validator

class CreateGalleryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    is_public: bool = False

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be blank")
        return v.strip()

class UpdateGalleryRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    is_public: bool | None = None
```

## Authentication

### Bearer Token

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Workspace Context

```python
from fastapi import Depends, HTTPException
from app.auth import get_current_user

@router.get("/workspaces/{workspace_id}/galleries")
async def list_galleries(
    workspace_id: UUID,
    user: User = Depends(get_current_user),
):
    # Verify user has access to workspace
    if not await user.has_workspace_access(workspace_id):
        raise HTTPException(403, "Access denied")

    return await gallery_service.list(workspace_id)
```

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| General API | 100/minute |
| Auth endpoints | 5/15 minutes |
| Uploads | 1000/hour per workspace |
| AI operations | 30/minute per workspace |

### Response Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Versioning

- Current version: `v1`
- Version in URL: `/api/v1/...`
- Breaking changes require new version
- 6 months deprecation notice

### Response Header

```
X-API-Version: v1
X-API-Deprecated: true  # If using deprecated version
```

## Common Patterns

### Bulk Operations

```
POST /galleries/bulk-delete
{
  "ids": ["uuid1", "uuid2", "uuid3"]
}
```

### Actions on Resources

```
POST /galleries/{id}/publish
POST /galleries/{id}/duplicate
POST /uploads/{id}/commit
POST /uploads/{id}/abort
```

### Nested Resources

```
# List assets in gallery
GET /galleries/{id}/assets

# Add asset to gallery
POST /galleries/{id}/assets
{ "asset_id": "uuid" }

# Remove asset from gallery
DELETE /galleries/{id}/assets/{asset_id}
```

## OpenAPI Documentation

```python
from fastapi import FastAPI

app = FastAPI(
    title="RawDrive API",
    description="Professional photography management platform",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)
```

### Endpoint Documentation

```python
@router.get(
    "/galleries/{gallery_id}",
    response_model=GalleryResponse,
    summary="Get gallery by ID",
    description="Retrieves a single gallery with its metadata.",
    responses={
        404: {"description": "Gallery not found"},
        403: {"description": "Access denied"},
    },
)
async def get_gallery(gallery_id: UUID) -> GalleryResponse:
    ...
```
