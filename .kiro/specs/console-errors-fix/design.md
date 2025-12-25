# Design Document: Console Errors Fix

## Overview

This design addresses multiple console errors in the RawDrive application by implementing fixes across the frontend i18n configuration, backend API error handling, and frontend component error states. The goal is to eliminate noisy console errors and provide better user feedback when errors occur.

## Architecture

The fixes span three layers of the application:

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │  i18n Config    │  │   API Client    │  │ PeoplePanel  │ │
│  │  (load: lang)   │  │  (error types)  │  │ (error UI)   │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Backend Layer                            │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  CORS Middleware│  │ Face Groups API │                   │
│  │  (error headers)│  │ (error handling)│                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Database Layer                           │
│  ┌─────────────────┐                                        │
│  │  face_groups    │                                        │
│  │  (migration)    │                                        │
│  └─────────────────┘                                        │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. i18n Configuration Update

**File:** `frontend/src/i18n/config.ts`

**Changes:**
- Add `load: 'languageOnly'` to i18next configuration to prevent loading regional variants
- Configure `nonExplicitSupportedLngs: true` to allow fallback for unsupported locales
- Reduce debug logging in production

```typescript
// Updated i18next configuration
i18n.init({
    fallbackLng: 'en',
    load: 'languageOnly',  // Only load 'en', not 'en-IN', 'en-US', etc.
    nonExplicitSupportedLngs: true,
    supportedLngs: ['en', 'hi', 'te', 'ta', 'kn', 'ml', 'as', 'bn', 'gu', 'mr', 'or', 'pa', 'ur'],
    // ... rest of config
});
```

### 2. API Client Error Types

**File:** `frontend/src/services/api.ts`

**Changes:**
- Add specific error codes for different failure types
- Reduce console logging in production
- Better CORS error detection

```typescript
// Error codes
type ApiErrorCode = 
    | 'NETWORK_ERROR'      // Connection refused, no network
    | 'CORS_ERROR'         // CORS policy blocked
    | 'TIMEOUT'            // Request timeout
    | 'SERVER_ERROR'       // 5xx errors
    | 'SERVICE_UNAVAILABLE' // 503 specifically
    | 'UNAUTHORIZED'       // 401
    | 'NOT_FOUND'          // 404
    | 'VALIDATION_ERROR';  // 400/422
```

### 3. PeoplePanel Error State

**File:** `frontend/src/components/features/gallery/PeoplePanel.tsx`

**Changes:**
- Add error state with descriptive message
- Add retry button
- Distinguish between "no data" and "error" states

```typescript
interface PeoplePanelState {
    groups: FaceGroup[];
    loading: boolean;
    error: string | null;  // New: error message
    errorCode: string | null;  // New: error code for specific handling
}
```

### 4. Backend Face Groups Error Handling

**File:** `backend/src/app/api/v1/face_groups.py`

**Changes:**
- Add try-catch around database operations
- Return structured error responses
- Handle missing table gracefully

```python
@router.get("/workspaces/{workspace_id}/face-groups")
async def list_face_groups(...):
    try:
        groups = await group_repo.find_by_workspace(...)
        return FaceGroupListResponse(...)
    except UndefinedTableError as e:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "SERVICE_UNAVAILABLE",
                "message": "Face detection service is not configured. Please run database migrations."
            }
        )
    except Exception as e:
        logger.exception("Failed to list face groups")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "INTERNAL_ERROR",
                "message": "Failed to load face groups"
            }
        )
```

## Data Models

No new data models are required. The changes are primarily configuration and error handling improvements.



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Translation Files Exist for All Supported Languages

*For any* supported language code in the i18n configuration, there SHALL exist a corresponding translation file at `/locales/{lang}/common.json`.

**Validates: Requirements 1.4**

### Property 2: API Error Responses Include CORS Headers

*For any* API endpoint that returns an error response (4xx or 5xx status), the response SHALL include the `Access-Control-Allow-Origin` header matching the request origin.

**Validates: Requirements 2.1, 2.2**

### Property 3: Migration Idempotency

*For any* database migration in the face detection feature, running the migration multiple times SHALL produce the same final state without errors.

**Validates: Requirements 5.3**

## Error Handling

### Frontend Error Handling

1. **i18n Errors**: Silently fall back to English without console errors
2. **API Network Errors**: Return structured error with `NETWORK_ERROR` code
3. **API CORS Errors**: Return structured error with `CORS_ERROR` code
4. **API Server Errors**: Return structured error with appropriate code

### Backend Error Handling

1. **Missing Database Tables**: Return 503 with descriptive message
2. **Database Connection Errors**: Return 503 with retry-after header
3. **Validation Errors**: Return 400 with field-level details
4. **Internal Errors**: Return 500 with request ID for debugging

### Error Response Format

```json
{
    "error": {
        "code": "SERVICE_UNAVAILABLE",
        "message": "Face detection service is not configured",
        "details": {
            "missing_table": "face_groups"
        },
        "request_id": "abc123"
    }
}
```

## Testing Strategy

### Unit Tests

1. **i18n Configuration Tests**
   - Verify `load: 'languageOnly'` is configured
   - Verify fallback language is set to 'en'
   - Verify supported languages list

2. **API Client Tests**
   - Test network error handling
   - Test CORS error detection
   - Test retry logic with exponential backoff
   - Test production logging behavior

3. **PeoplePanel Tests**
   - Test error state rendering
   - Test retry button functionality
   - Test loading state
   - Test empty state vs error state differentiation

### Property-Based Tests

Using Python's Hypothesis library for backend tests:

1. **API Error Response Properties**
   - Generate various error scenarios
   - Verify CORS headers are always present
   - Verify error response structure

2. **Migration Idempotency**
   - Run migrations multiple times
   - Verify database state is consistent

### Integration Tests

1. **End-to-End Error Flow**
   - Simulate backend unavailability
   - Verify frontend displays appropriate error
   - Verify retry functionality works

## Implementation Notes

### i18n Configuration Changes

The key change is adding `load: 'languageOnly'` to the i18next configuration. This tells i18next to only load the base language code (e.g., `en`) instead of trying to load regional variants (e.g., `en-IN`).

```typescript
i18n.init({
    load: 'languageOnly',  // Key change
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi', 'te', 'ta', 'kn', 'ml', 'as', 'bn', 'gu', 'mr', 'or', 'pa', 'ur'],
    nonExplicitSupportedLngs: true,
    // ... rest of config
});
```

### CORS Middleware Order

The CORS middleware in FastAPI must be added last to ensure it processes all responses, including error responses from other middleware. The current configuration is correct:

```python
# CORS middleware - MUST be added last
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
```

### Database Error Handling

The face groups endpoint needs to catch `UndefinedTableError` from asyncpg and return a 503 response:

```python
from asyncpg.exceptions import UndefinedTableError

try:
    groups = await group_repo.find_by_workspace(...)
except UndefinedTableError:
    raise HTTPException(
        status_code=503,
        detail={"code": "SERVICE_UNAVAILABLE", "message": "..."}
    )
```
