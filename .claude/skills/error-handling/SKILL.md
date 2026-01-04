---
name: error-handling
aliases: [errors, exceptions, error-boundary, error-messages]
description: Error handling patterns for RawDrive. Use when implementing error boundaries, API error responses, form validation, loading states, or user-friendly error messages.
---

# Error Handling Patterns

## React Error Boundaries

```typescript
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Wrap major sections
<ErrorBoundary fallback={<ErrorFallback />}>
  <GalleryView />
</ErrorBoundary>

// ErrorBoundary implementation
class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to monitoring (Sentry, etc.)
    logger.error('React error boundary', { error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

## User-Friendly Error Messages

```typescript
// Map technical errors to user-friendly messages
const ERROR_MESSAGES: Record<string, string> = {
  'NETWORK_ERROR': 'Unable to connect. Please check your internet connection.',
  'UNAUTHORIZED': 'Your session has expired. Please log in again.',
  'FORBIDDEN': 'You don\'t have permission to perform this action.',
  'NOT_FOUND': 'The requested item could not be found.',
  'VALIDATION_ERROR': 'Please check your input and try again.',
  'UPLOAD_FAILED': 'Upload failed. Please try again or use a smaller file.',
  'RATE_LIMITED': 'Too many requests. Please wait a moment and try again.',
  'SERVER_ERROR': 'Something went wrong. Our team has been notified.',
};

// Usage
const handleError = (error: ApiError) => {
  const userMessage = ERROR_MESSAGES[error.code] || ERROR_MESSAGES.SERVER_ERROR;
  showToast(userMessage, 'error');
  logger.error('API error', { code: error.code, details: error.details });
};
```

## API Error Response Format

### Backend Response Structure

```python
# Python/FastAPI error response
from fastapi import HTTPException
from pydantic import BaseModel

class ErrorDetail(BaseModel):
    field: str
    message: str

class ErrorResponse(BaseModel):
    error: str           # Error type: 'ValidationError', 'NotFound', etc.
    message: str         # User-friendly message
    details: list[ErrorDetail] | None = None  # Field-specific errors
    request_id: str | None = None  # For support reference

# Usage
raise HTTPException(
    status_code=400,
    detail=ErrorResponse(
        error="ValidationError",
        message="Please correct the errors below",
        details=[
            ErrorDetail(field="email", message="Invalid email format"),
            ErrorDetail(field="password", message="Password too short"),
        ]
    ).model_dump()
)

# 404 example
raise HTTPException(
    status_code=404,
    detail=ErrorResponse(
        error="NotFound",
        message="Gallery not found or has been deleted"
    ).model_dump()
)
```

### Frontend Error Handling

```typescript
// api.ts - centralized error handling
class ApiClient {
  private async request<T>(url: string, options: RequestInit): Promise<T> {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json();
        throw new ApiError(error.error, error.message, error.details);
      }

      return response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('NETWORK_ERROR', 'Network request failed');
    }
  }
}

// Custom error class
class ApiError extends Error {
  constructor(
    public code: string,
    public userMessage: string,
    public details?: Array<{ field: string; message: string }>
  ) {
    super(userMessage);
    this.name = 'ApiError';
  }
}
```

## Form Validation Errors

```typescript
// Show inline errors with accessibility
<AppInput
  label="Email"
  error={errors.email?.message}
  aria-invalid={!!errors.email}
  aria-describedby={errors.email ? 'email-error' : undefined}
/>
{errors.email && (
  <span id="email-error" role="alert" className="text-error text-sm">
    {errors.email.message}
  </span>
)}
```

### Error Message Guidelines

| Do | Don't |
|----|-------|
| "Email must include @" | "Invalid email" |
| "Password must be 8+ characters with a number" | "Password invalid" |
| "Please enter your name" | "You forgot to enter name" |
| "Gallery not found" | "Error 404" |

## Loading, Empty, and Error States

```typescript
// Always handle all three states
const GalleryList = () => {
  const { data, isLoading, error } = useGalleries();

  // Loading state
  if (isLoading) {
    return <Skeleton count={6} className="h-48" />;
  }

  // Error state
  if (error) {
    return (
      <ErrorState
        title="Failed to load galleries"
        description={error.message}
        action={<AppButton onClick={refetch}>Try Again</AppButton>}
      />
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Camera className="w-12 h-12" />}
        title="No galleries yet"
        description="Create your first gallery to get started"
        action={<AppButton onClick={onCreate}>Create Gallery</AppButton>}
      />
    );
  }

  // Success state
  return <GalleryGrid galleries={data} />;
};
```

## Backend Exception Handling

```python
# Python/FastAPI exception handlers
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=400,
        content={"error": "ValidationError", "message": str(exc)}
    )

@app.exception_handler(PermissionError)
async def permission_error_handler(request: Request, exc: PermissionError):
    return JSONResponse(
        status_code=403,
        content={"error": "Forbidden", "message": "Permission denied"}
    )

# Service layer - raise domain exceptions
class GalleryService:
    async def get_gallery(self, workspace_id: UUID, gallery_id: UUID) -> Gallery:
        gallery = await self.repo.get_by_id(gallery_id)
        if not gallery:
            raise HTTPException(404, detail={"error": "NotFound", "message": "Gallery not found"})
        if gallery.workspace_id != workspace_id:
            raise HTTPException(403, detail={"error": "Forbidden", "message": "Access denied"})
        return gallery
```

## Async Error Handling

```typescript
// React Query error handling
const { mutate, isError, error } = useMutation({
  mutationFn: deleteGallery,
  onError: (error: ApiError) => {
    showToast(error.userMessage, 'error');
  },
  onSuccess: () => {
    showToast('Gallery deleted', 'success');
    queryClient.invalidateQueries(['galleries']);
  },
});

// Async/await with try-catch
const handleSubmit = async (data: FormData) => {
  try {
    setIsSubmitting(true);
    await api.galleries.create(data);
    showToast('Gallery created', 'success');
    navigate('/galleries');
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.details) {
        // Set field-specific errors
        error.details.forEach(({ field, message }) => {
          setError(field, { message });
        });
      } else {
        showToast(error.userMessage, 'error');
      }
    }
  } finally {
    setIsSubmitting(false);
  }
};
```

## Logging Best Practices

```python
# Backend logging - never log PII
import structlog
logger = structlog.get_logger()

# GOOD - log IDs, not personal data
logger.error("Upload failed",
    user_id=user.id,
    workspace_id=workspace.id,
    file_size=file.size,
    error=str(exc)
)

# BAD - never log email, names, etc.
logger.error("Upload failed", email=user.email, name=user.name)
```

## Error Monitoring Integration

```typescript
// Sentry integration example
import * as Sentry from '@sentry/react';

// Wrap app with error boundary
<Sentry.ErrorBoundary fallback={<ErrorFallback />}>
  <App />
</Sentry.ErrorBoundary>

// Manual error capture
try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error, {
    tags: { feature: 'gallery-upload' },
    extra: { galleryId, fileCount },
  });
  throw error; // Re-throw for UI handling
}
```
