# API Contracts

## Overview

API contracts define the formal agreements between client and server for all API endpoints. This document specifies request/response schemas, error handling, versioning, and backward compatibility guarantees for RawDrive's REST API.

## Purpose

API contracts serve to:
- **Define Specifications**: Formal endpoint specifications
- **Ensure Consistency**: Standardized request/response formats
- **Enable Versioning**: Support multiple API versions
- **Guarantee Compatibility**: Backward compatibility promises
- **Facilitate Integration**: Clear integration guidelines
- **Document Changes**: Track API evolution
- **Enable Testing**: Automated contract testing

---

## API Versioning

### Version Strategy

RawDrive uses semantic versioning for API versions.

**Versioning Scheme:**
```
/api/v{MAJOR}.{MINOR}.{PATCH}

Examples:
- /api/v1.0.0 - Initial release
- /api/v1.1.0 - Backward-compatible additions
- /api/v1.1.1 - Bug fixes
- /api/v2.0.0 - Breaking changes
```

**Version Lifecycle:**
- **Current**: Latest version, fully supported
- **Stable**: Previous version, supported for 12 months
- **Deprecated**: Older versions, supported for 6 months
- **Sunset**: No longer supported, removed

**Version Support Timeline:**
```
v1.0.0 (Released: 2025-01-01)
├── Current: 2025-01-01 - 2025-12-31
├── Stable: 2026-01-01 - 2026-12-31
├── Deprecated: 2027-01-01 - 2027-06-30
└── Sunset: 2027-07-01

v2.0.0 (Released: 2026-01-01)
├── Current: 2026-01-01 - 2026-12-31
├── Stable: 2027-01-01 - 2027-12-31
├── Deprecated: 2028-01-01 - 2028-06-30
└── Sunset: 2028-07-01
```

### Backward Compatibility

Guarantee backward compatibility within major versions.

**Compatibility Rules:**
- ✅ Adding optional fields to responses
- ✅ Adding new endpoints
- ✅ Adding optional query parameters
- ✅ Adding new HTTP status codes
- ❌ Removing fields from responses
- ❌ Changing field types
- ❌ Removing endpoints
- ❌ Changing required parameters

**Deprecation Process:**
1. Announce deprecation (3 months notice)
2. Mark as deprecated in documentation
3. Add deprecation header to responses
4. Support for 6 months after announcement
5. Remove in next major version

---

## Request Contracts

### Request Format

Standardized request format for all endpoints.

**HTTP Request Structure:**
```
METHOD /api/v1/resource HTTP/1.1
Host: api.rawdrive.com
Authorization: Bearer {token}
Content-Type: application/json
X-Request-ID: {uuid}
X-Idempotency-Key: {uuid}

{
  "field1": "value1",
  "field2": "value2"
}
```

**Required Headers:**
```typescript
interface RequestHeaders {
  'Authorization': 'Bearer {token}', // Required for authenticated endpoints
  'Content-Type': 'application/json', // For POST/PATCH/PUT
  'X-Request-ID': string, // Optional, generated if not provided
  'X-Idempotency-Key': string, // Optional, for idempotent requests
  'User-Agent': string, // Optional, client identifier
}
```

### Request Validation

Validate all requests.

**Validation Rules:**
```typescript
interface RequestValidation {
  // Required fields
  required: string[],
  
  // Field types
  types: Record<string, string>,
  
  // Field constraints
  constraints: {
    minLength?: number,
    maxLength?: number,
    pattern?: string,
    minimum?: number,
    maximum?: number,
    enum?: any[],
  },
  
  // Custom validation
  custom?: (data: any) => ValidationError | null,
}

// Example: Create Gallery
const createGalleryValidation: RequestValidation = {
  required: ['name'],
  types: {
    name: 'string',
    description: 'string',
    settings: 'object',
  },
  constraints: {
    name: {
      minLength: 1,
      maxLength: 255,
    },
    description: {
      maxLength: 1000,
    },
  },
};
```

### Request Pagination

Standardized pagination for list endpoints.

**Pagination Parameters:**
```typescript
interface PaginationRequest {
  page?: number, // Default: 1, Min: 1
  limit?: number, // Default: 20, Min: 1, Max: 100
  offset?: number, // Alternative to page
  sort?: string, // Format: "field:asc|desc"
  filter?: Record<string, any>, // Filter criteria
}

// Example
GET /api/v1/galleries?page=1&limit=20&sort=createdAt:desc&filter[status]=active
```

### Request Filtering

Standardized filtering for list endpoints.

**Filter Operators:**
```typescript
interface FilterOperators {
  // Equality
  'eq': 'equals',
  'ne': 'not equals',
  
  // Comparison
  'gt': 'greater than',
  'gte': 'greater than or equal',
  'lt': 'less than',
  'lte': 'less than or equal',
  
  // String
  'contains': 'contains substring',
  'startsWith': 'starts with',
  'endsWith': 'ends with',
  
  // Array
  'in': 'in array',
  'nin': 'not in array',
  
  // Existence
  'exists': 'field exists',
  'null': 'field is null',
}

// Example
GET /api/v1/galleries?filter[createdAt][gte]=2025-01-01&filter[status][in]=active,archived
```

---

## Response Contracts

### Response Format

Standardized response format for all endpoints.

**HTTP Response Structure:**
```
HTTP/1.1 200 OK
Content-Type: application/json
X-Request-ID: {uuid}
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640000000

{
  "data": { ... },
  "meta": { ... },
  "links": { ... }
}
```

**Response Envelope:**
```typescript
interface ResponseEnvelope<T> {
  // Response data
  data: T,
  
  // Metadata
  meta?: {
    page?: number,
    limit?: number,
    total?: number,
    totalPages?: number,
    hasMore?: boolean,
  },
  
  // Links for pagination
  links?: {
    self: string,
    first?: string,
    last?: string,
    next?: string,
    prev?: string,
  },
  
  // Request tracking
  requestId: string,
  timestamp: string,
}
```

### Response Headers

Standardized response headers.

**Required Headers:**
```typescript
interface ResponseHeaders {
  'Content-Type': 'application/json',
  'X-Request-ID': string, // Echo request ID
  'X-RateLimit-Limit': string, // Rate limit
  'X-RateLimit-Remaining': string, // Remaining requests
  'X-RateLimit-Reset': string, // Reset timestamp
  'Cache-Control': string, // Caching directive
  'ETag': string, // Entity tag for caching
  'Last-Modified': string, // Last modification time
}
```

### Response Pagination

Standardized pagination in responses.

**Pagination Response:**
```typescript
interface PaginatedResponse<T> {
  data: T[],
  meta: {
    page: number,
    limit: number,
    total: number,
    totalPages: number,
    hasMore: boolean,
  },
  links: {
    self: string,
    first: string,
    last: string,
    next?: string,
    prev?: string,
  },
}

// Example
{
  "data": [
    { "id": "gal_1", "name": "Gallery 1" },
    { "id": "gal_2", "name": "Gallery 2" }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5,
    "hasMore": true
  },
  "links": {
    "self": "/api/v1/galleries?page=1&limit=20",
    "first": "/api/v1/galleries?page=1&limit=20",
    "last": "/api/v1/galleries?page=5&limit=20",
    "next": "/api/v1/galleries?page=2&limit=20"
  }
}
```

---

## Error Contracts

### Error Response Format

Standardized error response format.

**Error Response Structure:**
```typescript
interface ErrorResponse {
  error: {
    code: string, // Machine-readable error code
    message: string, // Human-readable message
    details?: Record<string, any>, // Additional details
    path?: string, // Request path
    timestamp?: string, // Error timestamp
  },
  requestId: string, // Request tracking
  timestamp: string, // Response timestamp
}

// Example
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "name": "Name is required",
      "email": "Invalid email format"
    }
  },
  "requestId": "req_123456",
  "timestamp": "2025-12-17T10:30:00Z"
}
```

### HTTP Status Codes

Standardized HTTP status codes.

**Status Code Mapping:**
```typescript
interface StatusCodes {
  // Success
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  
  // Redirection
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  
  // Client Error
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  
  // Server Error
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
}
```

### Error Codes

Standardized error codes for common scenarios.

**Error Code Reference:**
```typescript
interface ErrorCodes {
  // Validation
  'VALIDATION_ERROR': 'Request validation failed',
  'INVALID_REQUEST': 'Invalid request format',
  'MISSING_REQUIRED_FIELD': 'Required field missing',
  'INVALID_FIELD_VALUE': 'Field value invalid',
  
  // Authentication
  'UNAUTHORIZED': 'Authentication required',
  'INVALID_TOKEN': 'Token invalid or expired',
  'INVALID_CREDENTIALS': 'Invalid credentials',
  'TOKEN_EXPIRED': 'Token expired',
  
  // Authorization
  'FORBIDDEN': 'Access denied',
  'INSUFFICIENT_PERMISSIONS': 'Insufficient permissions',
  'RESOURCE_NOT_ACCESSIBLE': 'Resource not accessible',
  
  // Resource
  'NOT_FOUND': 'Resource not found',
  'ALREADY_EXISTS': 'Resource already exists',
  'CONFLICT': 'Resource conflict',
  
  // Rate Limiting
  'RATE_LIMITED': 'Rate limit exceeded',
  'QUOTA_EXCEEDED': 'Quota exceeded',
  
  // Server
  'INTERNAL_ERROR': 'Internal server error',
  'SERVICE_UNAVAILABLE': 'Service unavailable',
  'TIMEOUT': 'Request timeout',
}
```

---

## Endpoint Contracts

### Gallery Endpoints

Gallery management endpoints.

**List Galleries:**
```typescript
// Request
GET /api/v1/galleries
Query: {
  page?: number,
  limit?: number,
  sort?: string,
  filter?: Record<string, any>,
}
Headers: {
  Authorization: 'Bearer {token}',
}

// Response (200 OK)
{
  data: [
    {
      id: string,
      name: string,
      description: string,
      photoCount: number,
      createdAt: string,
      updatedAt: string,
    }
  ],
  meta: { page, limit, total, totalPages, hasMore },
  links: { self, first, last, next, prev },
}

// Error (401 Unauthorized)
{
  error: {
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
  },
  requestId: string,
  timestamp: string,
}
```

**Get Gallery:**
```typescript
// Request
GET /api/v1/galleries/:id
Headers: {
  Authorization: 'Bearer {token}',
}

// Response (200 OK)
{
  data: {
    id: string,
    name: string,
    description: string,
    settings: {
      isPublic: boolean,
      passwordProtected: boolean,
      allowDownload: boolean,
    },
    photoCount: number,
    createdAt: string,
    updatedAt: string,
  },
  requestId: string,
  timestamp: string,
}

// Error (404 Not Found)
{
  error: {
    code: 'NOT_FOUND',
    message: 'Gallery not found',
    details: { galleryId: ':id' },
  },
  requestId: string,
  timestamp: string,
}
```

**Create Gallery:**
```typescript
// Request
POST /api/v1/galleries
Headers: {
  Authorization: 'Bearer {token}',
  Content-Type: 'application/json',
}
Body: {
  name: string, // Required, 1-255 chars
  description?: string, // Optional, max 1000 chars
  settings?: {
    isPublic?: boolean,
    passwordProtected?: boolean,
    password?: string,
    allowDownload?: boolean,
  },
}

// Response (201 Created)
{
  data: {
    id: string,
    name: string,
    description: string,
    settings: { ... },
    photoCount: 0,
    createdAt: string,
    updatedAt: string,
  },
  requestId: string,
  timestamp: string,
}

// Error (422 Unprocessable Entity)
{
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    details: {
      name: 'Name is required',
    },
  },
  requestId: string,
  timestamp: string,
}
```

**Update Gallery:**
```typescript
// Request
PATCH /api/v1/galleries/:id
Headers: {
  Authorization: 'Bearer {token}',
  Content-Type: 'application/json',
}
Body: {
  name?: string,
  description?: string,
  settings?: { ... },
}

// Response (200 OK)
{
  data: {
    id: string,
    name: string,
    description: string,
    settings: { ... },
    photoCount: number,
    createdAt: string,
    updatedAt: string,
  },
  requestId: string,
  timestamp: string,
}
```

**Delete Gallery:**
```typescript
// Request
DELETE /api/v1/galleries/:id
Headers: {
  Authorization: 'Bearer {token}',
}

// Response (204 No Content)
(empty body)

// Error (409 Conflict)
{
  error: {
    code: 'CONFLICT',
    message: 'Cannot delete gallery with active clients',
  },
  requestId: string,
  timestamp: string,
}
```

### Photo Endpoints

Photo management endpoints.

**Upload Photo:**
```typescript
// Request
POST /api/v1/galleries/:galleryId/photos
Headers: {
  Authorization: 'Bearer {token}',
  Content-Type: 'multipart/form-data',
}
Body: FormData {
  file: File, // Required
  title?: string,
  description?: string,
  tags?: string[],
}

// Response (201 Created)
{
  data: {
    id: string,
    galleryId: string,
    title: string,
    description: string,
    url: string,
    thumbnailUrl: string,
    size: number,
    mimeType: string,
    uploadedAt: string,
  },
  requestId: string,
  timestamp: string,
}

// Error (413 Payload Too Large)
{
  error: {
    code: 'FILE_TOO_LARGE',
    message: 'File exceeds maximum size of 50MB',
  },
  requestId: string,
  timestamp: string,
}
```

---

## Idempotency

### Idempotent Requests

Support idempotent requests for safe retries.

**Idempotency Key:**
```typescript
interface IdempotencyRequest {
  headers: {
    'X-Idempotency-Key': string, // UUID
  },
}

// Example
POST /api/v1/galleries
Headers: {
  Authorization: 'Bearer {token}',
  X-Idempotency-Key: '550e8400-e29b-41d4-a716-446655440000',
}
Body: {
  name: 'My Gallery',
}
```

**Idempotency Guarantee:**
- Same request with same idempotency key returns same response
- Idempotency key valid for 24 hours
- Duplicate requests within 24 hours return cached response
- After 24 hours, key can be reused for new request

---

## Rate Limiting

### Rate Limit Headers

Include rate limit information in responses.

**Rate Limit Headers:**
```typescript
interface RateLimitHeaders {
  'X-RateLimit-Limit': string, // Max requests per window
  'X-RateLimit-Remaining': string, // Remaining requests
  'X-RateLimit-Reset': string, // Unix timestamp when limit resets
  'Retry-After': string, // Seconds to wait before retry (on 429)
}

// Example
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640000000
```

### Rate Limit Tiers

Different rate limits by subscription tier.

**Rate Limits by Tier:**
```typescript
interface RateLimitsByTier {
  free: {
    requestsPerMinute: 10,
    requestsPerHour: 100,
    requestsPerDay: 1000,
  },
  starter: {
    requestsPerMinute: 30,
    requestsPerHour: 500,
    requestsPerDay: 5000,
  },
  professional: {
    requestsPerMinute: 100,
    requestsPerHour: 2000,
    requestsPerDay: 20000,
  },
  business: {
    requestsPerMinute: 500,
    requestsPerHour: 10000,
    requestsPerDay: 100000,
  },
  enterprise: {
    requestsPerMinute: 5000,
    requestsPerHour: 100000,
    requestsPerDay: 1000000,
  },
}
```

---

## Webhook Contracts

### Webhook Event Format

Standardized webhook event format.

**Webhook Payload:**
```typescript
interface WebhookPayload {
  id: string, // Event ID
  type: string, // Event type
  timestamp: string, // ISO 8601 timestamp
  data: Record<string, any>, // Event data
  signature: string, // HMAC-SHA256 signature
}

// Example
{
  "id": "evt_123456",
  "type": "gallery.created",
  "timestamp": "2025-12-17T10:30:00Z",
  "data": {
    "gallery": {
      "id": "gal_123456",
      "name": "Wedding Photos",
      "createdAt": "2025-12-17T10:30:00Z"
    }
  },
  "signature": "sha256=abcdef123456..."
}
```

### Webhook Retry Policy

Standardized retry policy for failed webhooks.

**Retry Configuration:**
```typescript
interface WebhookRetryPolicy {
  maxRetries: 5,
  backoffStrategy: 'exponential',
  initialDelay: 1000, // 1 second
  maxDelay: 3600000, // 1 hour
  
  // Retry schedule
  retries: [
    { attempt: 1, delay: 1000 }, // 1 second
    { attempt: 2, delay: 2000 }, // 2 seconds
    { attempt: 3, delay: 4000 }, // 4 seconds
    { attempt: 4, delay: 8000 }, // 8 seconds
    { attempt: 5, delay: 16000 }, // 16 seconds
  ],
}
```

---

## API Gateway & Infrastructure

### Traefik IngressRoute Configuration

**Ingress Setup:**
- Load balancing across backend pods via Traefik
- SSL/TLS termination with automatic Let's Encrypt
- Request routing by path and hostname using IngressRoute CRDs
- Rate limiting at ingress level via Traefik middleware
- KEDA autoscaling based on Traefik metrics

**Configuration Example:**
```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: rawdrive-api
  namespace: rawdrive
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`api.rawdrive.com`) && PathPrefix(`/api/v1`)
      kind: Rule
      middlewares:
        - name: rate-limit-api
        - name: security-headers
      services:
        - name: backend-service
          port: 8000
  tls:
    certResolver: letsencrypt
```

### Rate Limiting at Edge

**Cloudflare Rate Limiting:**
- Global rate limits enforced at edge
- Per-IP rate limiting
- Per-user rate limiting (authenticated)
- Burst allowance for legitimate traffic
- Automatic challenge on threshold

**Configuration:**
```
Zone Rate Limiting:
- 1000 requests/minute per IP
- 10000 requests/hour per IP
- 100000 requests/day per IP

Authenticated Rate Limiting:
- 5000 requests/minute per user
- 50000 requests/hour per user
- 500000 requests/day per user
```

### Request Tracing

**Distributed Tracing:**
- X-Request-ID header for request tracking
- Trace propagation through all services
- Tempo/Jaeger for trace visualization
- Latency analysis and bottleneck detection

**Trace Headers:**
```
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
X-Trace-ID: 550e8400-e29b-41d4-a716-446655440001
X-Span-ID: 550e8400-e29b-41d4-a716-446655440002
X-Parent-Span-ID: 550e8400-e29b-41d4-a716-446655440003
```

---

## Observability Integration

### Metrics Collection

**Prometheus Metrics:**
- Request count by endpoint
- Request latency (p50, p95, p99)
- Error rate by status code
- Database query latency
- Cache hit/miss ratio
- Background job processing time

**Metric Endpoints:**
```
GET /metrics - Prometheus metrics
GET /health - Health check
GET /ready - Readiness probe
```

### Logging Integration

**Loki Log Collection:**
- Structured JSON logging
- Log levels: DEBUG, INFO, WARN, ERROR
- Request/response logging
- Error stack traces
- Performance metrics

**Log Format:**
```json
{
  "timestamp": "2025-12-17T10:30:00Z",
  "level": "INFO",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "service": "backend",
  "endpoint": "POST /api/v1/galleries",
  "statusCode": 201,
  "duration": 125,
  "userId": "user_123456",
  "message": "Gallery created successfully"
}
```

---

## Related Files

- `docs/Features/API_AND_INTEGRATIONS.md` - API documentation
- `docs/project/02-SECURITY_REQUIREMENTS.md` - Security requirements
- `docs/project/01-TECH_STACK.md` - Technology stack and architecture
- `backend/src/api/` - API implementation
- `backend/src/validation/` - Request validation
- `docs/TechnicalSpecs/api_standards.json` - API standards
- `docs/TechnicalSpecs/observability.json` - Observability setup

## Last Updated

2025-12-17
