# Design Document: Error Handling and Boundaries Audit

## Overview

This design document outlines the architecture and implementation strategy for auditing and improving error handling across the RawDrive platform. The system will ensure consistent, user-friendly, and tenant-safe error handling in the backend (Python/FastAPI), frontend (React/TypeScript), and ai-service (Python/FastMCP).

### Current State Analysis

**Backend (Python/FastAPI):**
- ✅ Standardized error response format with `ErrorResponse` schema
- ✅ Custom exception classes (`AppError`, `NotFoundError`, `ConflictError`, etc.)
- ✅ Global exception handlers registered in `exceptions.py`
- ✅ Request ID tracking for correlation
- ⚠️ Inconsistent error handling in routes (mix of `HTTPException` and custom exceptions)
- ⚠️ Some routes catch exceptions and re-raise as `HTTPException` instead of using domain exceptions
- ❌ No centralized error logging configuration
- ❌ Missing tenant-safe error message validation

**Frontend (React/TypeScript):**
- ✅ Toast notification system with variants (success, error, warning, info)
- ✅ API client with automatic token refresh on 401
- ✅ Standardized `ApiResponse<T>` and `ApiError` types
- ⚠️ Inconsistent error handling in hooks (some use try-catch, some don't)
- ⚠️ Error messages not always user-friendly (e.g., "Failed to fetch gallery")
- ❌ No React error boundaries implemented
- ❌ No centralized error logging to external service
- ❌ No localization support for error messages

**AI Service (Python/FastMCP):**
- ✅ Basic permission checks with `PermissionError`
- ✅ Authentication context validation
- ⚠️ Errors raised as generic `ValueError` and `PermissionError`
- ❌ No structured error responses
- ❌ No error logging
- ❌ No tenant isolation validation

## Architecture

### Error Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Error        │  │ Toast        │  │ Error        │      │
│  │ Boundary     │  │ Notification │  │ Logger       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  API Client Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Error        │  │ Token        │  │ Retry        │      │
│  │ Interceptor  │  │ Refresh      │  │ Logic        │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Backend API Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Exception    │  │ Error        │  │ Audit        │      │
│  │ Handlers     │  │ Formatter    │  │ Logger       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│                  Service Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Domain       │  │ Tenant       │  │ Error        │      │
│  │ Exceptions   │  │ Validator    │  │ Context      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Backend Error Handling Components

#### 1.1 Exception Hierarchy

```python
# backend/src/app/api/exceptions.py (existing, to be enhanced)

class AppError(Exception):
    """Base application error with standard structure."""
    def __init__(
        self,
        message: str,
        code: str,
        status_code: int = 400,
        details: list[dict[str, Any]] | None = None,
        user_message: str | None = None,  # NEW: Human-friendly message
        log_level: str = "warning",  # NEW: Logging level
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details
        self.user_message = user_message or message  # NEW
        self.log_level = log_level  # NEW

# Subclasses remain the same but add user_message support
class NotFoundError(AppError):
    def __init__(self, resource: str, resource_id: Any = None, user_message: str | None = None):
        detail = f" with ID {resource_id}" if resource_id else ""
        super().__init__(
            message=f"{resource} not found{detail}",
            code=f"{resource.upper()}_NOT_FOUND",
            status_code=404,
            user_message=user_message or f"The {resource.lower()} you're looking for doesn't exist.",
            log_level="info",
        )
```

#### 1.2 Tenant-Safe Error Validator

```python
# backend/src/app/utils/error_validator.py (NEW)

class TenantSafeErrorValidator:
    """Validates error messages don't leak cross-tenant information."""
    
    @staticmethod
    def validate_error_response(
        error: AppError,
        user_workspace_id: UUID,
        resource_workspace_id: UUID | None,
    ) -> AppError:
        """
        Validates error doesn't leak information about other tenants.
        
        If user tries to access resource from another workspace,
        return NotFoundError instead of ForbiddenError.
        """
        if resource_workspace_id and resource_workspace_id != user_workspace_id:
            # Don't reveal existence of resource in other workspace
            return NotFoundError(
                resource="Resource",
                user_message="The resource you're looking for doesn't exist."
            )
        return error
```

#### 1.3 Enhanced Error Logger

```python
# backend/src/app/utils/error_logger.py (NEW)

import logging
from typing import Any
from uuid import UUID

logger = logging.getLogger(__name__)

class ErrorLogger:
    """Centralized error logging with context."""
    
    @staticmethod
    def log_error(
        error: Exception,
        request_id: str,
        user_id: UUID | None = None,
        workspace_id: UUID | None = None,
        extra_context: dict[str, Any] | None = None,
    ) -> None:
        """Log error with full context."""
        log_data = {
            "request_id": request_id,
            "error_type": type(error).__name__,
            "error_message": str(error),
        }
        
        if user_id:
            log_data["user_id"] = str(user_id)
        if workspace_id:
            log_data["workspace_id"] = str(workspace_id)
        if extra_context:
            log_data.update(extra_context)
        
        if isinstance(error, AppError):
            log_level = getattr(logging, error.log_level.upper(), logging.WARNING)
            logger.log(log_level, error.message, extra=log_data)
        else:
            logger.exception("Unhandled exception", extra=log_data)
```

### 2. Frontend Error Handling Components

#### 2.1 Error Boundary Component

```typescript
// frontend/src/components/error/ErrorBoundary.tsx (NEW)

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  level?: 'app' | 'route' | 'component';
}

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
  level: 'app' | 'route' | 'component';
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // Catches rendering errors and displays fallback UI
  // Logs errors to console and optional external service
  // Provides reset functionality
}
```

#### 2.2 Error Message Mapper

```typescript
// frontend/src/utils/errorMessages.ts (NEW)

interface ErrorMessageConfig {
  title?: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export class ErrorMessageMapper {
  /**
   * Maps API error codes to user-friendly messages
   */
  static mapApiError(error: ApiError['error']): ErrorMessageConfig {
    const errorMap: Record<string, ErrorMessageConfig> = {
      'GALLERY_NOT_FOUND': {
        title: 'Gallery Not Found',
        message: 'The gallery you\'re looking for doesn\'t exist or has been deleted.',
        action: {
          label: 'Go to Galleries',
          onClick: () => window.location.href = '/galleries',
        },
      },
      'WORKSPACE_ACCESS_DENIED': {
        title: 'Access Denied',
        message: 'You don\'t have permission to access this workspace.',
      },
      'NETWORK_ERROR': {
        title: 'Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection and try again.',
      },
      // ... more mappings
    };
    
    return errorMap[error.code] || {
      message: error.message || 'An unexpected error occurred. Please try again.',
    };
  }
}
```

#### 2.3 Enhanced API Client with Error Handling

```typescript
// frontend/src/services/api.ts (enhanced)

class ApiClient {
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      // ... existing logic ...
      
      if (!response.ok) {
        // Log error for debugging
        this.logError(response.status, data, endpoint);
        
        // Return structured error
        return {
          error: data.error || {
            code: `HTTP_${response.status}`,
            message: this.getDefaultErrorMessage(response.status),
          },
        };
      }
      
      return { data };
    } catch (error) {
      // Log network errors
      this.logError(0, error, endpoint);
      
      return {
        error: {
          code: 'NETWORK_ERROR',
          message: 'Unable to connect to the server. Please check your connection.',
        },
      };
    }
  }
  
  private logError(status: number, error: any, endpoint: string): void {
    console.error('[API Error]', {
      status,
      endpoint,
      error,
      timestamp: new Date().toISOString(),
    });
    
    // TODO: Send to external logging service (Sentry, etc.)
  }
  
  private getDefaultErrorMessage(status: number): string {
    const messages: Record<number, string> = {
      400: 'The request was invalid. Please check your input.',
      401: 'Your session has expired. Please sign in again.',
      403: 'You don\'t have permission to perform this action.',
      404: 'The resource you\'re looking for doesn\'t exist.',
      429: 'Too many requests. Please wait a moment and try again.',
      500: 'Something went wrong on our end. Please try again later.',
      503: 'The service is temporarily unavailable. Please try again later.',
    };
    
    return messages[status] || 'An unexpected error occurred.';
  }
}
```

#### 2.4 Error Display Hook

```typescript
// frontend/src/hooks/useErrorHandler.ts (NEW)

export function useErrorHandler() {
  const { error: showErrorToast } = useToastActions();
  
  const handleError = useCallback((error: unknown, context?: string) => {
    let errorConfig: ErrorMessageConfig;
    
    if (isApiError(error)) {
      errorConfig = ErrorMessageMapper.mapApiError(error.error);
    } else if (error instanceof Error) {
      errorConfig = {
        message: error.message,
      };
    } else {
      errorConfig = {
        message: 'An unexpected error occurred.',
      };
    }
    
    // Show toast
    showErrorToast(errorConfig.message, {
      title: errorConfig.title,
      action: errorConfig.action,
      duration: 7000, // Longer for errors
    });
    
    // Log to console
    console.error(`[Error${context ? ` - ${context}` : ''}]`, error);
  }, [showErrorToast]);
  
  return { handleError };
}
```

### 3. AI Service Error Handling Components

#### 3.1 Structured MCP Error Responses

```python
# services/ai-service/src/mcp/errors.py (NEW)

from dataclasses import dataclass
from typing import Any

@dataclass
class MCPError:
    """Structured error for MCP responses."""
    code: str
    message: str
    details: dict[str, Any] | None = None
    
    def to_dict(self) -> dict[str, Any]:
        result = {
            "error": {
                "code": self.code,
                "message": self.message,
            }
        }
        if self.details:
            result["error"]["details"] = self.details
        return result

class MCPAuthError(MCPError):
    """Authentication error."""
    def __init__(self, message: str = "Authentication required"):
        super().__init__(
            code="MCP_AUTH_REQUIRED",
            message=message,
        )

class MCPPermissionError(MCPError):
    """Permission denied error."""
    def __init__(self, required_permission: str):
        super().__init__(
            code="MCP_PERMISSION_DENIED",
            message=f"Permission denied: {required_permission}",
            details={"required_permission": required_permission},
        )

class MCPWorkspaceAccessError(MCPError):
    """Cross-workspace access error."""
    def __init__(self, resource_type: str):
        super().__init__(
            code="MCP_WORKSPACE_ACCESS_DENIED",
            message=f"Cannot access {resource_type} from different workspace",
        )
```

## Data Models

### Backend Error Response Schema

```python
# backend/src/app/api/schemas.py (enhanced)

class ErrorDetail(BaseModel):
    """Detailed error information."""
    field: Optional[str] = None
    message: str

class ErrorResponse(BaseModel):
    """Standard error response."""
    error: dict = Field(..., description="Error object")
    
    class Config:
        schema_extra = {
            "example": {
                "error": {
                    "code": "GALLERY_NOT_FOUND",
                    "message": "Gallery not found with ID abc123",
                    "requestId": "req_abc123def456",
                    "timestamp": "2024-12-19T10:30:00Z",
                    "details": [
                        {
                            "field": "gallery_id",
                            "message": "Gallery does not exist"
                        }
                    ]
                }
            }
        }
```

### Frontend Error Types

```typescript
// frontend/src/types/errors.ts (NEW)

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
    timestamp?: string;
    details?: Array<{
      field?: string;
      message: string;
    }>;
  };
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export interface ErrorLogEntry {
  timestamp: string;
  level: 'error' | 'warning' | 'info';
  message: string;
  code?: string;
  context?: Record<string, any>;
  stackTrace?: string;
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Error Response Structure Consistency
*For any* API endpoint that encounters an error, the response SHALL contain an "error" object with "code", "message", "requestId", and "timestamp" fields.
**Validates: Requirements 1.1, 8.1**

### Property 2: Domain Exception Type Correctness
*For any* domain-specific error condition (not found, conflict, forbidden, unauthorized, rate limit, validation), the system SHALL raise the appropriate AppError subclass.
**Validates: Requirements 1.2**

### Property 3: Internal Error Sanitization
*For any* unexpected exception, the error response SHALL contain code "INTERNAL_ERROR" and SHALL NOT expose implementation details (stack traces, file paths, database queries) in the message field.
**Validates: Requirements 1.3**

### Property 4: Validation Error Field Details
*For any* request validation failure, the response SHALL have status 422 and SHALL include a "details" array with field-level error information.
**Validates: Requirements 1.4, 8.2**

### Property 5: Tenant Isolation Error Code
*For any* tenant isolation violation (cross-workspace access attempt), the system SHALL return status 403 with code "WORKSPACE_ACCESS_DENIED".
**Validates: Requirements 1.5**

### Property 6: API Error Toast Display
*For any* failed API call in the frontend, a toast notification SHALL be displayed with a human-friendly error message.
**Validates: Requirements 2.1**

### Property 7: Token Refresh on 401
*For any* 401 Unauthorized response, the system SHALL attempt token refresh once, and if refresh fails, SHALL redirect to signin page.
**Validates: Requirements 2.3, 9.2**

### Property 8: Form Validation Field Highlighting
*For any* form validation error, the specific invalid fields SHALL be highlighted with inline error messages.
**Validates: Requirements 2.4**

### Property 9: Toast Auto-Dismiss Timing
*For any* error toast, non-critical errors SHALL auto-dismiss after 5 seconds, and critical errors SHALL require manual dismissal.
**Validates: Requirements 2.5**

### Property 10: Error Boundary Fallback Display
*For any* React component rendering error, the error boundary SHALL catch the error and display fallback UI instead of crashing the application.
**Validates: Requirements 3.1**

### Property 11: Error Boundary Logging
*For any* error caught by error boundary, the system SHALL log error details including component stack to the console.
**Validates: Requirements 3.2**

### Property 12: Critical Route Error Recovery
*For any* error in critical routes (gallery view, upload), the error boundary SHALL display route-specific fallback with recovery options (Reload, Go Back).
**Validates: Requirements 3.3**

### Property 13: Component Error Isolation
*For any* error in non-critical components, the error boundary SHALL display component-level fallback without unmounting the entire page.
**Validates: Requirements 3.4**

### Property 14: Error Boundary Recovery Actions
*For any* error boundary fallback UI, the system SHALL provide at least one recovery action (Reload or Go Back).
**Validates: Requirements 3.5**

### Property 15: MCP Permission Enforcement
*For any* MCP tool call without required permissions, the system SHALL raise PermissionError with message "Permission denied: {required_permission}".
**Validates: Requirements 4.2**

### Property 16: MCP Workspace Isolation
*For any* MCP tool attempting cross-workspace access, the system SHALL raise PermissionError with message "Cannot access {resource} from different workspace".
**Validates: Requirements 4.3**

### Property 17: MCP Database Error Handling
*For any* MCP tool encountering a database error, the system SHALL log the error and return a structured error response.
**Validates: Requirements 4.4**

### Property 18: MCP Validation Error Messages
*For any* MCP tool validation failure, the error message SHALL clearly indicate which parameter is invalid.
**Validates: Requirements 4.5**

### Property 19: Error Message Localization
*For any* error when user's preferred language is set, the error message SHALL be displayed in that language.
**Validates: Requirements 5.2**

### Property 20: User-Friendly Resource Names
*For any* error message referencing a resource, the message SHALL use user-friendly names (e.g., "Gallery" instead of "gallery_id").
**Validates: Requirements 5.3**

### Property 21: Constructive Validation Messages
*For any* validation error, the error message SHALL use constructive language (e.g., "Please enter..." instead of "Invalid...").
**Validates: Requirements 5.4**

### Property 22: Apologetic System Error Messages
*For any* system error (5xx), the error message SHALL include an apology and next steps.
**Validates: Requirements 5.5**

### Property 23: Tenant-Safe Not Found Responses
*For any* cross-workspace access attempt, the system SHALL return "Resource not found" (404) instead of "Permission denied" (403) to avoid confirming resource existence.
**Validates: Requirements 6.1**

### Property 24: Tenant-Safe Resource ID Exposure
*For any* error response including resource IDs, the system SHALL only include IDs for resources in the user's workspace.
**Validates: Requirements 6.2**

### Property 25: Workspace ID in Error Logs
*For any* error logged in the backend, the log entry SHALL include workspace_id in the context.
**Validates: Requirements 6.3**

### Property 26: Missing Tenant Filter Security Warning
*For any* database query failing due to missing workspace_id filter, the system SHALL log a CRITICAL level security warning.
**Validates: Requirements 6.4**

### Property 27: No Cross-Tenant Data in Errors
*For any* error in a multi-tenant context, the error message SHALL NOT expose workspace names, slugs, or user emails from other tenants.
**Validates: Requirements 6.5**

### Property 28: Backend Error Log Structure
*For any* error in the backend, the log entry SHALL include severity level, request_id, user_id, workspace_id, and timestamp.
**Validates: Requirements 7.1**

### Property 29: Frontend Error Console Logging
*For any* error in the frontend, the console log SHALL include component stack and user context.
**Validates: Requirements 7.2**

### Property 30: Critical Error Log Level
*For any* critical error (500, database failure), the system SHALL log at ERROR level with full stack trace.
**Validates: Requirements 7.3**

### Property 31: User Error Log Level
*For any* user-caused error (400, 422), the system SHALL log at WARNING level without stack trace.
**Validates: Requirements 7.4**

### Property 32: Rate Limit Retry-After Header
*For any* rate limit error (429), the response SHALL include a "Retry-After" header.
**Validates: Requirements 8.3**

### Property 33: Error Status Code Consistency
*For any* error response, the HTTP status code SHALL match the error type (404 for not found, 403 for forbidden, 401 for unauthorized, etc.).
**Validates: Requirements 8.4**

### Property 34: Batch Operation Error Results
*For any* batch operation with some failures, the response SHALL include a results array with per-item success/error status.
**Validates: Requirements 8.5**

### Property 35: Network Timeout Retry Logic
*For any* network request timeout, the system SHALL automatically retry up to 2 times with exponential backoff.
**Validates: Requirements 9.1**

### Property 36: Upload Resumption Support
*For any* upload failure mid-transfer, the system SHALL support resuming the upload using TUS protocol.
**Validates: Requirements 9.4**

### Property 37: WebSocket Reconnection Logic
*For any* WebSocket connection drop, the system SHALL automatically attempt to reconnect with exponential backoff up to 5 times.
**Validates: Requirements 9.5**

## Error Handling

### Backend Error Handling Strategy

1. **Exception Hierarchy**: All domain errors inherit from `AppError` base class
2. **Global Exception Handlers**: FastAPI exception handlers catch and format all errors
3. **Tenant Validation**: All errors validated to ensure no cross-tenant information leakage
4. **Structured Logging**: All errors logged with full context (request_id, user_id, workspace_id)
5. **User-Friendly Messages**: All errors include both technical message and user-friendly message

### Frontend Error Handling Strategy

1. **Error Boundaries**: React error boundaries at app, route, and component levels
2. **API Error Interceptor**: Centralized error handling in API client
3. **Toast Notifications**: User-friendly error messages displayed via toast system
4. **Error Message Mapping**: API error codes mapped to human-friendly messages
5. **Automatic Recovery**: Token refresh, retry logic, and reconnection for transient errors

### AI Service Error Handling Strategy

1. **Structured Errors**: All MCP errors return structured error objects
2. **Permission Validation**: All tools validate authentication and permissions
3. **Workspace Isolation**: All tools enforce workspace_id matching
4. **Error Logging**: All errors logged with context for debugging
5. **Clear Messages**: All validation errors clearly indicate the problem

### Error Logging Levels

- **CRITICAL**: Security violations, missing tenant filters, data corruption
- **ERROR**: Unexpected exceptions, database failures, external service failures
- **WARNING**: User-caused errors, validation failures, rate limits
- **INFO**: Expected errors like not found, already exists

## Testing Strategy

### Unit Testing

**Backend Unit Tests:**
- Test each exception class constructor and properties
- Test error response builder with various inputs
- Test tenant-safe error validator logic
- Test error logger formatting
- Test exception handler functions

**Frontend Unit Tests:**
- Test ErrorBoundary component with thrown errors
- Test ErrorMessageMapper with various error codes
- Test API client error handling paths
- Test useErrorHandler hook
- Test toast notification display

**AI Service Unit Tests:**
- Test MCP error classes and formatting
- Test authentication context validation
- Test permission checking logic
- Test workspace isolation validation

### Property-Based Testing

**Backend Property Tests:**
- Property 1: Error response structure (generate random errors, verify structure)
- Property 3: Internal error sanitization (generate exceptions, verify no leaks)
- Property 23: Tenant-safe responses (generate cross-workspace attempts, verify 404)
- Property 28: Log structure (generate errors, verify log fields)

**Frontend Property Tests:**
- Property 6: Toast display (generate API errors, verify toast shown)
- Property 10: Error boundary fallback (generate component errors, verify fallback)
- Property 20: User-friendly names (generate errors, verify resource names)

**AI Service Property Tests:**
- Property 15: Permission enforcement (generate unauthorized calls, verify error)
- Property 16: Workspace isolation (generate cross-workspace calls, verify error)

### Integration Testing

- Test end-to-end error flows from API to UI
- Test error boundary recovery actions
- Test token refresh flow on 401
- Test retry logic for network failures
- Test WebSocket reconnection
- Test upload resumption

### Test Coverage Goals

- Backend error handling: 90%+ coverage
- Frontend error components: 85%+ coverage
- AI service error handling: 90%+ coverage
- Error paths in services: 80%+ coverage

## Performance Considerations

1. **Error Logging**: Async logging to avoid blocking request handling
2. **Toast Notifications**: Debounce duplicate errors to avoid spam
3. **Error Boundaries**: Lightweight fallback components to minimize re-render cost
4. **Retry Logic**: Exponential backoff to avoid overwhelming services
5. **Error Message Caching**: Cache localized error messages to avoid repeated lookups

## Security Considerations

1. **Tenant Isolation**: All errors validated to prevent cross-tenant information leakage
2. **Information Disclosure**: Internal errors sanitized to avoid exposing implementation details
3. **Rate Limiting**: Error responses include rate limit headers to prevent abuse
4. **Audit Logging**: All errors logged with workspace_id for security audits
5. **Permission Validation**: All MCP tools validate permissions before execution

## Deployment Considerations

1. **Error Monitoring**: Integration with Sentry/GlitchTip for production error tracking
2. **Log Aggregation**: Centralized logging for error analysis
3. **Alerting**: Critical errors trigger alerts to on-call engineers
4. **Metrics**: Error rate metrics tracked per endpoint and error type
5. **Rollback**: High error rates trigger automatic rollback

## Future Enhancements

1. **Error Message Localization**: Full i18n support for all error messages
2. **Error Analytics**: Dashboard showing error trends and patterns
3. **Smart Retry**: ML-based retry logic that learns from past failures
4. **Error Recovery Suggestions**: Context-aware suggestions for error resolution
5. **User Error Reporting**: Allow users to report errors with context
