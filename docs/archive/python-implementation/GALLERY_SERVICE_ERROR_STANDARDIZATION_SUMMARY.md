# Gallery Service API Error Response Standardization

**Date:** 2026-02-08
**Status:** ✅ Completed

---

## Overview

Standardized all API error responses in the gallery service to use a consistent format across all endpoints.

## Target Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {},
    "request_id": "uuid",
    "timestamp": "iso8601"
  }
}
```

## Files Updated

### 1. ✅ `services/gallery-service/src/api/v1/galleries.py`
- **Status:** Fully standardized
- **Changes:**
  - Updated all `raise HTTPException` calls to use `raise_http_exception` helper
  - Added `request_id` parameter to all endpoints
  - Updated exception handlers to use `exception_to_error_response`
  - Standardized error responses for:
    - Gallery CRUD operations
    - Sub-gallery operations
    - Asset management
    - Cache warming
    - Design configuration
    - Download limits

### 2. ✅ `services/gallery-service/src/api/v1/public/galleries.py`
- **Status:** Fully standardized
- **Changes:**
  - Removed `HTTPException` from imports, added error handling imports
  - Updated `verify_gallery_access` function to use standardized errors
  - Updated PIN/password verification endpoints
  - Updated rating endpoint
  - Updated breadcrumbs endpoint
  - All endpoints now use `raise_http_exception` and `exception_to_error_response`

### 3. ✅ `services/gallery-service/src/api/v1/agents.py`
- **Status:** Fully standardized
- **Changes:**
  - Removed `HTTPException` from imports, added error handling imports
  - Updated all three agent endpoints:
    - `gallery_manager_agent`
    - `proofing_assistant_agent`
    - `batch_processor_agent`
  - All now use `raise_http_exception` with proper error codes

### 4. ✅ `services/gallery-service/src/api/v1/magic_links.py`
- **Status:** Fully standardized
- **Changes:**
  - Removed `HTTPException` from imports, added error handling imports
  - Updated `create_magic_link` endpoint
  - Added proper date validation with standardized error responses
  - Uses `exception_to_error_response` for magic link errors

## Error Code Examples

The following error codes are now consistently used:

### Gallery Errors
- `GALLERY_NOT_FOUND` (404)
- `GALLERY_EMPTY` (400)
- `GALLERY_ALREADY_EXISTS` (409)
- `GALLERY_INVALID_STATUS` (400)

### Sub-Gallery Errors
- `SUB_GALLERY_NOT_FOUND` (404)
- `SUB_GALLERY_INVALID_PARENT` (400)
- `SUB_GALLERY_MAX_DEPTH` (400)

### Asset Errors
- `ASSET_NOT_FOUND` (404)
- `ASSET_ALREADY_IN_GALLERY` (400)
- `ASSET_NOT_IN_GALLERY` (400)
- `ASSET_INVALID_METADATA` (400)

### Magic Link Errors
- `MAGIC_LINK_NOT_FOUND` (404)
- `MAGIC_LINK_EXPIRED` (401)
- `MAGIC_LINK_MAX_VIEWS` (429)
- `MAGIC_LINK_INVALID_PIN` (403)
- `MAGIC_LINK_INVALID_PASSWORD` (401)

### Authentication & Authorization
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `INVALID_TOKEN` (401)
- `TOKEN_EXPIRED` (401)
- `INSUFFICIENT_PERMISSIONS` (403)

### Validation Errors
- `VALIDATION_ERROR` (400)
- `INVALID_FORMAT` (400)
- `MISSING_REQUIRED_FIELD` (400)

### Service Errors
- `INTERNAL_ERROR` (500)
- `DATABASE_ERROR` (500)
- `CACHE_ERROR` (500)
- `STORAGE_ERROR` (500)

## Helper Functions

The following helper functions from `src.api.v1.errors` are now used consistently:

1. **`raise_http_exception`** - Raises HTTPException with standardized error response
2. **`exception_to_error_response`** - Converts service exceptions to error responses
3. **`get_request_id`** - Extracts or generates request correlation ID
4. **`create_error_response`** - Creates standardized error response objects

## HTTP Status Code Mapping

All error codes are mapped to appropriate HTTP status codes:

- **400 Bad Request** - Validation errors, invalid input
- **401 Unauthorized** - Authentication failures
- **403 Forbidden** - Authorization failures
- **404 Not Found** - Resource not found
- **429 Too Many Requests** - Rate limiting exceeded
- **500 Internal Server Error** - Server errors
- **503 Service Unavailable** - Service temporarily unavailable

## Benefits

1. **Consistency** - All endpoints return errors in the same format
2. **Traceability** - All errors include `request_id` for debugging
3. **Client-Friendly** - Clear error codes and messages for API consumers
4. **Maintainability** - Centralized error handling logic
5. **Logging** - Automatic error logging with proper context

## Testing Recommendations

1. Test all endpoints with invalid inputs to verify error responses
2. Verify request IDs are present in all error responses
3. Check that error codes match HTTP status codes
4. Ensure error messages are clear and actionable
5. Validate error details provide useful context

## Future Work

Consider standardizing error responses in other API files:
- `assets.py`
- `batch.py`
- `desktop_sync.py`
- `gallery_design_recommendations.py`
- `gallery_design_templates.py`
- `sync_keys.py`
- `xmp_sync.py`
- `public/proofing.py`
- `public/magic_links.py`

---

**References:**
- Error definitions: `services/gallery-service/src/api/v1/errors.py`
- Error codes: `ErrorCode` class
- Error messages: `ErrorMessage` class
- Status code mapping: `STATUS_CODE_MAP`
