# Error Handling Patterns Audit

## Overview

This document summarizes the current error handling patterns across the RawDrive platform, identifying strengths, inconsistencies, and gaps based on a comprehensive codebase review.

## Backend (Python/FastAPI)

### Existing Strengths
- **AppError Exception Hierarchy**: Well-structured domain exceptions with consistent error response format per [docs/TechnicalSpecs/error_handling.json](docs/TechnicalSpecs/error_handling.json).
- **Global Exception Handlers**: Centralized error handling in `backend/src/app/main.py` with `app_error_handler` and `generic_exception_handler`.
- **Standardized Error Response Format**: Consistent JSON responses with error codes, messages, and details.

### Inconsistencies Identified
- **HTTPException Usage**: Multiple routes (especially in `backend/src/routes/`) use `HTTPException` instead of domain exceptions. Try-except blocks often catch custom exceptions and re-raise as `HTTPException`.
- **Inconsistent Error Logging**: No centralized error logging utility; logging is scattered and lacks structured context (e.g., workspace_id, request_id).
- **Missing User-Friendly Messages**: `AppError` base class does not support user-friendly messages or log levels.
- **Tenant Safety Gaps**: No validation to prevent cross-tenant information leakage in error responses.

### Gaps
- No `TenantSafeErrorValidator` utility for checking error responses.
- No `ErrorLogger` class for comprehensive, context-aware logging.
- Property tests for error handling are missing.

## Frontend (React/TypeScript)

### Existing Strengths
- **Toast Notification System**: Integrated toast notifications for user feedback.
- **API Client**: Automatic token refresh on 401 errors.

### Inconsistencies Identified
- **Hook Error Handling**: Hooks like `useGallery` and `useGalleryAssets` have try-catch blocks but inconsistent patterns; some swallow errors, others re-throw.
- **Component Error Handling**: No React error boundaries; unhandled errors can crash the entire app.

### Gaps
- No `ErrorBoundary` components at app, route, or component levels.
- No `ErrorMessageMapper` utility for mapping API errors to user-friendly messages.
- No `useErrorHandler` hook for centralized error handling.
- No error message localization support.
- Missing property tests for error scenarios.

## AI Service (Python/FastMCP)

### Existing Strengths
- MCP server structure is in place.

### Gaps
- No structured `MCPError` classes; uses generic `ValueError` and `PermissionError`.
- No workspace isolation checks in error handling.
- Missing error logging with context (workspace_id, user_id).

## Recommendations

1. **Prioritize Backend Infrastructure**: Implement `ErrorLogger`, `TenantSafeErrorValidator`, and enhance `AppError` with user-friendly messages.
2. **Standardize Route Error Handling**: Replace all `HTTPException` usage with domain exceptions.
3. **Implement React Error Boundaries**: Add `ErrorBoundary` components and fallback UIs.
4. **Enhance Frontend Error Handling**: Create `ErrorMessageMapper` and `useErrorHandler` hook.
5. **Improve AI Service**: Add structured `MCPError` classes and workspace checks.
6. **Add Comprehensive Logging**: Configure structured logging across all services.
7. **Implement Retry Logic**: Add network timeout retry and WebSocket reconnection.
8. **Support Localization**: Add Hindi/English error message translations.
9. **Configure Monitoring**: Integrate Sentry/GlitchTip for production error tracking.

## Developer Guide

### Backend Error Handling Patterns

#### Using Domain Exceptions
```python
from src.app.api.exceptions import NotFoundError, ForbiddenError, ConflictError

# Instead of HTTPException
raise NotFoundError("gallery", gallery_id)

# With user-friendly message
raise ForbiddenError("You don't have permission to access this gallery.")
```

#### Error Logger Usage
```python
from src.app.utils.error_logger import ErrorLogger

error_logger = ErrorLogger()
error_logger.log_error(exception, request_id="req_123", workspace_id="ws_456")
```

#### Tenant-Safe Validation
```python
from src.app.utils.error_validator import TenantSafeErrorValidator

is_safe = TenantSafeErrorValidator.validate_error_response(error_response, workspace_id="ws_456")
```

### Frontend Error Handling Patterns

#### Using Error Boundaries
```tsx
import ErrorBoundary from './components/error/ErrorBoundary';
import { AppErrorFallback } from './components/error/ErrorFallbacks';

<ErrorBoundary fallback={<AppErrorFallback />}>
  <YourComponent />
</ErrorBoundary>
```

#### Using Error Handler Hook
```tsx
import { useErrorHandler } from './hooks/useErrorHandler';

const { handleApiError } = useErrorHandler();

try {
  await apiCall();
} catch (error) {
  handleApiError(error, { component: 'GalleryList', action: 'load' });
}
```

#### Error Message Mapping
```tsx
import { ErrorMessageMapper } from './utils/errorMessages';

const mapping = ErrorMessageMapper.mapApiError('GALLERY_NOT_FOUND');
console.log(mapping.title, mapping.message);
```

### Common Error Scenarios

#### Authentication Errors
- `AUTH_REQUIRED`: User not logged in
- `INVALID_CREDENTIALS`: Wrong email/password
- `FORBIDDEN`: Insufficient permissions

#### Resource Errors
- `GALLERY_NOT_FOUND`: Gallery doesn't exist
- `PHOTO_NOT_FOUND`: Photo doesn't exist
- `VALIDATION_ERROR`: Invalid input data

#### System Errors
- `INTERNAL_ERROR`: Unexpected server error
- `NETWORK_ERROR`: Connection issues
- `RATE_LIMIT_EXCEEDED`: Too many requests

### Error Response Format
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "User-friendly message",
    "requestId": "req_123456789",
    "timestamp": "2024-12-19T10:30:00Z",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Best Practices

1. **Always use domain exceptions** instead of HTTPException in backend routes
2. **Wrap components with ErrorBoundary** for graceful error handling
3. **Use useErrorHandler hook** for consistent error display
4. **Include context** when logging errors (user_id, workspace_id, request_id)
5. **Validate error responses** for tenant safety
6. **Provide user-friendly messages** in all error responses
7. **Log errors at appropriate levels** (warning for client errors, error for server errors)