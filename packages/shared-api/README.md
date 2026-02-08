# @rawdrive/shared-api

Standardized API response envelopes, pagination, and error handling for RawDrive microservices.

## Overview

This package provides consistent API response types across all 15 RawDrive microservices, ensuring:

- **Unified pagination format** with `{data, meta}` structure
- **Standard error responses** matching RFC 7807 with RawDrive extensions
- **Success response wrappers** with `{data, meta, status}` structure
- **Type-safe utilities** for creating responses

## Installation

### TypeScript/Frontend

```bash
pnpm add @rawdrive/shared-api
```

### Python/Backend

Copy the `python/` directory to your service's shared modules or import directly.

## Response Formats

### Paginated Response

All list endpoints return paginated data in this format:

```json
{
  "data": [
    { "id": "1", "name": "Item 1" },
    { "id": "2", "name": "Item 2" }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5,
    "has_next": true,
    "has_prev": false
  }
}
```

### Success Response

Single resource responses use this format:

```json
{
  "data": {
    "id": "123",
    "name": "My Gallery"
  },
  "meta": {
    "request_id": "req_abc123",
    "timestamp": "2026-01-23T12:00:00Z"
  },
  "status": "success"
}
```

### Error Response

All errors return in this format:

```json
{
  "status": 400,
  "code": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    { "field": "body.email", "message": "Invalid email format" }
  ],
  "request_id": "req_abc123"
}
```

## Usage

### TypeScript

```typescript
import {
  PaginatedResponse,
  PaginationMeta,
  createPaginatedResponse,
  ErrorResponse,
  ErrorCodes,
  createErrorResponse,
  SuccessResponse,
  createSuccessResponse,
} from '@rawdrive/shared-api';

// Define your data type
interface Gallery {
  id: string;
  name: string;
}

// Create a paginated response
const response: PaginatedResponse<Gallery> = createPaginatedResponse(
  galleries,
  totalCount,
  page,
  limit
);

// Create an error response
const error: ErrorResponse = createErrorResponse(
  400,
  ErrorCodes.VALIDATION_ERROR,
  'Email is required',
  {
    details: [{ field: 'email', message: 'This field is required' }],
    request_id: 'req_123',
  }
);

// Create a success response
const success: SuccessResponse<Gallery> = createSuccessResponse(gallery, {
  request_id: 'req_123',
});
```

### Python

```python
from shared_api import (
    PaginatedResponse,
    create_paginated_response,
    ErrorResponse,
    ErrorCodes,
    create_error_response,
    create_success_response,
)

# Create a paginated response
response = create_paginated_response(
    data=galleries,
    total=total_count,
    page=page,
    limit=limit,
)

# Create an error response
error = create_error_response(
    status=400,
    code=ErrorCodes.VALIDATION_ERROR,
    message="Email is required",
    details=[ErrorDetail(field="email", message="This field is required")],
)

# Create a success response
success = create_success_response(
    data=gallery,
    request_id="req_123",
)
```

### FastAPI Integration

```python
from fastapi import APIRouter, Query
from shared_api import (
    PaginatedResponse,
    PaginationParams,
    create_paginated_response,
    normalize_pagination_params,
    calculate_offset,
)

router = APIRouter()

@router.get("/galleries")
async def list_galleries(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    page, limit = normalize_pagination_params(page, limit)
    offset = calculate_offset(page, limit)

    galleries = await repository.get_many(offset=offset, limit=limit)
    total = await repository.count()

    return create_paginated_response(
        data=[g.model_dump() for g in galleries],
        total=total,
        page=page,
        limit=limit,
    )
```

## Migration Guide

### Before (Inconsistent)

```python
# Service A - uses 'items' and 'per_page'
{"items": [...], "total": 100, "page": 1, "per_page": 20}

# Service B - uses 'data' and 'limit'
{"data": [...], "total": 100, "page": 1, "limit": 20}

# Service C - uses nested 'pagination'
{"data": [...], "pagination": {"total": 100, "page": 1}}
```

### After (Standardized)

```python
# All services use the same format
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5,
    "has_next": true,
    "has_prev": false
  }
}
```

## Field Reference

### PaginationMeta Fields

| Field | Type | Description |
|-------|------|-------------|
| `page` | int | Current page number (1-based) |
| `limit` | int | Items per page |
| `total` | int | Total items across all pages |
| `total_pages` | int | Total number of pages |
| `has_next` | bool | Whether there's a next page |
| `has_prev` | bool | Whether there's a previous page |

### ErrorResponse Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | int | HTTP status code |
| `code` | string | Machine-readable error code |
| `message` | string | Human-readable message |
| `details` | array | Optional field-level errors |
| `request_id` | string | Request correlation ID |

### Standard Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid auth |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Defaults

- **Default page**: 1
- **Default limit**: 20
- **Max limit**: 100
- **Min limit**: 1
