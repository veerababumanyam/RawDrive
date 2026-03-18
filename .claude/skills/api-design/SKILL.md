---
name: api-design
description: "REST API design conventions for RawDrive including URL patterns, response formats, pagination, error handling, and versioning. Use this skill when designing new API endpoints, defining response schemas, implementing pagination, handling errors, or reviewing API design. Also use for webhook payload design, rate limiting configuration, or API documentation. Triggers on: API design, endpoint design, REST, response format, pagination, error response, rate limiting, API versioning, webhook payload."
---

# API Design Standards

All RawDrive APIs follow consistent conventions for URLs, responses, errors, and pagination.

## URL Conventions

```
POST   /api/v1/galleries              # Create
GET    /api/v1/galleries              # List (paginated)
GET    /api/v1/galleries/{id}         # Get one
PATCH  /api/v1/galleries/{id}         # Partial update
DELETE /api/v1/galleries/{id}         # Delete
GET    /api/v1/galleries/{id}/assets  # Nested resource
```

- Always prefix with `/api/v1/`
- Use kebab-case for multi-word resources: `/gallery-items`
- Use path params for identity: `/{gallery_id}`
- Use query params for filtering: `?status=active&sort=-created_at`

## Response Format

### Success
```json
{
  "data": { "id": "uuid", "name": "Wedding 2025" },
  "meta": { "request_id": "req_abc123" }
}
```

### List (Paginated)
```json
{
  "data": [{ "id": "uuid", "name": "Gallery 1" }],
  "pagination": {
    "total": 42,
    "page": 1,
    "per_page": 20,
    "total_pages": 3
  }
}
```

### Error
```json
{
  "error": {
    "code": "GALLERY_NOT_FOUND",
    "message": "Gallery with the specified ID was not found",
    "details": { "gallery_id": "uuid" }
  }
}
```

## Pagination (Mandatory for Lists)

```python
@router.get("/")
async def list_galleries(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("-created_at"),
    current_user: CurrentUser,
    service: GalleryService = Depends(get_gallery_service),
):
    items, total = await service.list(
        workspace_id=current_user.workspace_id,
        skip=skip, limit=limit, sort=sort,
    )
    return {
        "data": items,
        "pagination": {
            "total": total,
            "page": skip // limit + 1,
            "per_page": limit,
            "total_pages": (total + limit - 1) // limit,
        }
    }
```

For large datasets (100k+ rows), use cursor-based pagination instead of offset.

## Error Handling

```python
from fastapi import HTTPException

# Use semantic error codes, not just HTTP status
raise HTTPException(
    status_code=404,
    detail={
        "code": "GALLERY_NOT_FOUND",
        "message": f"Gallery {gallery_id} not found in workspace"
    }
)

# Common status codes
# 200 - Success
# 201 - Created
# 204 - Deleted (no content)
# 400 - Validation error
# 401 - Not authenticated
# 403 - Not authorized (wrong role)
# 404 - Not found (or not in workspace)
# 409 - Conflict (duplicate)
# 422 - Unprocessable entity
# 429 - Rate limited
```

## Rate Limiting

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/auth/login")
@limiter.limit("5/minute")
async def login(request: Request, ...):
    ...
```

Public endpoints and auth endpoints must have rate limits.

## Webhook Payloads

```json
{
  "event": "gallery.created",
  "timestamp": "2026-01-23T12:00:00Z",
  "data": {
    "gallery_id": "uuid",
    "workspace_id": "uuid",
    "name": "Wedding Photos"
  },
  "webhook_id": "wh_abc123"
}
```

- Sign with HMAC-SHA256
- Include `X-Webhook-Signature` header
- Implement retry with exponential backoff (3 attempts)

**Deep dive:** Read `.claude/reference/webhooks-integration-best-practices.md`
