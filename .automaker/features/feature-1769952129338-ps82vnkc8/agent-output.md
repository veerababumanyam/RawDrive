I'll review the previous context and continue the implementation of the standardized API response envelopes and pagination across microservices. Let me first search my episodic memory for any relevant past work on this feature.

🔧 Tool: mcp__plugin_episodic-memory_episodic-memory__search
Input: {
  "query": [
    "API response envelope",
    "pagination standardization",
    "shared-api package",
    "PaginatedResponse"
  ],
  "limit": 10
}

🔧 Tool: Glob
Input: {
  "pattern": "packages/shared-api/**/*"
}

🔧 Tool: Glob
Input: {
  "pattern": "packages/shared-types/src/**/*.ts"
}

The `shared-api` package doesn't exist yet. Let me explore the current pagination implementations across services to understand the inconsistencies:

🔧 Tool: Grep
Input: {
  "pattern": "PaginatedResponse",
  "path": "services"
}

🔧 Tool: Grep
Input: {
  "pattern": "class.*Paginated|PaginationMeta|PagedResponse",
  "path": "services"
}

🔧 Tool: Grep
Input: {
  "pattern": "ErrorResponse",
  "path": "backend"
}

Let me read the key files to understand the current patterns:

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current pagination patterns across services",
      "status": "in_progress",
      "activeForm": "Exploring current pagination patterns"
    },
    {
      "content": "Create @rawdrive/shared-api package structure",
      "status": "pending",
      "activeForm": "Creating shared-api package structure"
    },
    {
      "content": "Implement standard error response envelope",
      "status": "pending",
      "activeForm": "Implementing standard error response envelope"
    },
    {
      "content": "Implement unified PaginatedResponse generic type",
      "status": "pending",
      "activeForm": "Implementing unified PaginatedResponse type"
    },
    {
      "content": "Implement success response wrapper with {data, meta, status}",
      "status": "pending",
      "activeForm": "Implementing success response wrapper"
    },
    {
      "content": "Export types from shared-api package",
      "status": "pending",
      "activeForm": "Exporting types from shared-api"
    },
    {
      "content": "Update pnpm-workspace.yaml to include new package",
      "status": "pending",
      "activeForm": "Updating pnpm-workspace configuration"
    }
  ]
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\schemas\\common.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\api\\schemas.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\gallery-service\\src\\schemas\\common.py"
}

Let me also check more services to see the full picture of inconsistencies:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\client-service\\src\\schemas\\common.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\livesync-service\\src\\schemas\\common.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-types\\src\\common.ts"
}

Now I have a clear picture of the inconsistencies. Let me also check the pnpm-workspace.yaml and existing package structure:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\pnpm-workspace.yaml"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-types\\package.json"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current pagination patterns across services",
      "status": "completed",
      "activeForm": "Exploring current pagination patterns"
    },
    {
      "content": "Create @rawdrive/shared-api package structure",
      "status": "in_progress",
      "activeForm": "Creating shared-api package structure"
    },
    {
      "content": "Implement standard error response envelope",
      "status": "pending",
      "activeForm": "Implementing standard error response envelope"
    },
    {
      "content": "Implement unified PaginatedResponse generic type",
      "status": "pending",
      "activeForm": "Implementing unified PaginatedResponse type"
    },
    {
      "content": "Implement success response wrapper with {data, meta, status}",
      "status": "pending",
      "activeForm": "Implementing success response wrapper"
    },
    {
      "content": "Export types from shared-api package",
      "status": "pending",
      "activeForm": "Exporting types from shared-api"
    },
    {
      "content": "Create Python equivalent schemas for backend services",
      "status": "pending",
      "activeForm": "Creating Python equivalent schemas"
    }
  ]
}

Now I have a clear understanding of the inconsistencies:

**Current Inconsistencies Found:**

1. **Pagination Field Naming:**
   - webhooks-service: `items`, `total`, `page`, `page_size`, `total_pages`, `has_next`, `has_prev`
   - backend: `items`/`data`, `total`, `page`/`per_page`, `total_pages`
   - gallery-service: `page`, `limit`, `total`, `total_pages`, `has_more`
   - livesync-service: `data`, `total`, `page`, `limit`, `total_pages`
   - shared-types (TS): `data`, `pagination: { total, page, limit, total_pages }`

2. **Error Response Structure:**
   - webhooks-service: `code`, `message`, `details`, `request_id`
   - backend: `status`, `code`, `message`, `details`, `correlation_id`
   - gallery-service: `error`, `message`, `details`, `correlation_id`
   - client-service: `error`, `message`, `details`

Now I'll create the `@rawdrive/shared-api` package with standardized types. Let me create the package structure:

🔧 Tool: Bash
Input: {
  "command": "mkdir -p \"C:/Users/admin/Desktop/RawDrive2/packages/shared-api/src\"",
  "description": "Create shared-api package directory"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\package.json",
  "content": "{\n  \"name\": \"@rawdrive/shared-api\",\n  \"version\": \"1.0.0\",\n  \"description\": \"Standardized API response envelopes, pagination, and error handling for RawDrive microservices\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"main\": \"dist/index.js\",\n  \"types\": \"dist/index.d.ts\",\n  \"files\": [\n    \"dist\",\n    \"src\"\n  ],\n  \"exports\": {\n    \".\": {\n      \"types\": \"./dist/index.d.ts\",\n      \"default\": \"./dist/index.js\"\n    },\n    \"./*\": {\n      \"types\": \"./dist/*.d.ts\",\n      \"default\": \"./dist/*.js\"\n    }\n  },\n  \"scripts\": {\n    \"build\": \"tsc -p tsconfig.json\",\n    \"test\": \"vitest\",\n    \"lint\": \"eslint src --ext .ts\"\n  },\n  \"dependencies\": {},\n  \"devDependencies\": {\n    \"typescript\": \"^5.3.0\",\n    \"vitest\": \"^1.0.0\"\n  },\n  \"peerDependencies\": {}\n}\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\tsconfig.json",
  "content": "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\",\n    \"module\": \"ESNext\",\n    \"moduleResolution\": \"bundler\",\n    \"lib\": [\"ES2022\"],\n    \"declaration\": true,\n    \"declarationMap\": true,\n    \"sourceMap\": true,\n    \"outDir\": \"dist\",\n    \"rootDir\": \"src\",\n    \"strict\": true,\n    \"noImplicitAny\": true,\n    \"strictNullChecks\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"esModuleInterop\": true,\n    \"skipLibCheck\": true,\n    \"forceConsistentCasingInFileNames\": true\n  },\n  \"include\": [\"src/**/*\"],\n  \"exclude\": [\"node_modules\", \"dist\"]\n}\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current pagination patterns across services",
      "status": "completed",
      "activeForm": "Exploring current pagination patterns"
    },
    {
      "content": "Create @rawdrive/shared-api package structure",
      "status": "completed",
      "activeForm": "Creating shared-api package structure"
    },
    {
      "content": "Implement standard error response envelope",
      "status": "in_progress",
      "activeForm": "Implementing standard error response envelope"
    },
    {
      "content": "Implement unified PaginatedResponse generic type",
      "status": "pending",
      "activeForm": "Implementing unified PaginatedResponse type"
    },
    {
      "content": "Implement success response wrapper with {data, meta, status}",
      "status": "pending",
      "activeForm": "Implementing success response wrapper"
    },
    {
      "content": "Export types from shared-api package",
      "status": "pending",
      "activeForm": "Exporting types from shared-api"
    },
    {
      "content": "Create Python equivalent schemas for backend services",
      "status": "pending",
      "activeForm": "Creating Python equivalent schemas"
    }
  ]
}

Now let me create the standardized API types:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\src\\error.ts",
  "content": "/**\n * Standardized Error Response Types\n *\n * Provides consistent error handling across all RawDrive microservices.\n * Based on RFC 7807 Problem Details for HTTP APIs with RawDrive extensions.\n *\n * @module @rawdrive/shared-api/error\n */\n\n/**\n * Detailed error information for a specific field (validation errors).\n */\nexport interface ErrorDetail {\n  /** Field path that caused the error (e.g., \"body.email\", \"query.page\") */\n  field?: string;\n  /** Human-readable error message for this field */\n  message: string;\n  /** Optional error code for programmatic handling */\n  code?: string;\n}\n\n/**\n * Standard error response envelope.\n *\n * All microservices MUST return errors in this format for consistency.\n *\n * @example\n * ```json\n * {\n *   \"status\": 400,\n *   \"code\": \"VALIDATION_ERROR\",\n *   \"message\": \"Request validation failed\",\n *   \"details\": [\n *     { \"field\": \"body.email\", \"message\": \"Invalid email format\" }\n *   ],\n *   \"request_id\": \"req_abc123\"\n * }\n * ```\n */\nexport interface ErrorResponse {\n  /** HTTP status code (400, 401, 403, 404, 422, 500, etc.) */\n  status: number;\n  /** Machine-readable error code for programmatic handling */\n  code: string;\n  /** Human-readable error message */\n  message: string;\n  /** Optional array of field-level error details */\n  details?: ErrorDetail[];\n  /** Request correlation ID for tracing */\n  request_id?: string;\n}\n\n/**\n * Standard error codes used across all microservices.\n * Services may extend with domain-specific codes.\n */\nexport const ErrorCodes = {\n  // Authentication errors (401)\n  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',\n  INVALID_TOKEN: 'INVALID_TOKEN',\n  TOKEN_EXPIRED: 'TOKEN_EXPIRED',\n\n  // Authorization errors (403)\n  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',\n  FORBIDDEN: 'FORBIDDEN',\n  WORKSPACE_ACCESS_DENIED: 'WORKSPACE_ACCESS_DENIED',\n\n  // Client errors (400)\n  VALIDATION_ERROR: 'VALIDATION_ERROR',\n  BAD_REQUEST: 'BAD_REQUEST',\n  INVALID_INPUT: 'INVALID_INPUT',\n\n  // Not found errors (404)\n  NOT_FOUND: 'NOT_FOUND',\n  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',\n\n  // Conflict errors (409)\n  CONFLICT: 'CONFLICT',\n  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',\n\n  // Rate limiting (429)\n  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',\n\n  // Server errors (500+)\n  INTERNAL_ERROR: 'INTERNAL_ERROR',\n  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',\n  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',\n} as const;\n\nexport type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];\n\n/**\n * Type guard to check if a response is an ErrorResponse\n */\nexport function isErrorResponse(response: unknown): response is ErrorResponse {\n  return (\n    typeof response === 'object' &&\n    response !== null &&\n    'status' in response &&\n    'code' in response &&\n    'message' in response &&\n    typeof (response as ErrorResponse).status === 'number' &&\n    typeof (response as ErrorResponse).code === 'string' &&\n    typeof (response as ErrorResponse).message === 'string'\n  );\n}\n\n/**\n * Create a standardized error response.\n */\nexport function createErrorResponse(\n  status: number,\n  code: string,\n  message: string,\n  options?: {\n    details?: ErrorDetail[];\n    request_id?: string;\n  }\n): ErrorResponse {\n  return {\n    status,\n    code,\n    message,\n    ...(options?.details && { details: options.details }),\n    ...(options?.request_id && { request_id: options.request_id }),\n  };\n}\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current pagination patterns across services",
      "status": "completed",
      "activeForm": "Exploring current pagination patterns"
    },
    {
      "content": "Create @rawdrive/shared-api package structure",
      "status": "completed",
      "activeForm": "Creating shared-api package structure"
    },
    {
      "content": "Implement standard error response envelope",
      "status": "completed",
      "activeForm": "Implementing standard error response envelope"
    },
    {
      "content": "Implement unified PaginatedResponse generic type",
      "status": "in_progress",
      "activeForm": "Implementing unified PaginatedResponse type"
    },
    {
      "content": "Implement success response wrapper with {data, meta, status}",
      "status": "pending",
      "activeForm": "Implementing success response wrapper"
    },
    {
      "content": "Export types from shared-api package",
      "status": "pending",
      "activeForm": "Exporting types from shared-api"
    },
    {
      "content": "Create Python equivalent schemas for backend services",
      "status": "pending",
      "activeForm": "Creating Python equivalent schemas"
    }
  ]
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\src\\pagination.ts",
  "content": "/**\n * Standardized Pagination Types\n *\n * Provides consistent pagination handling across all RawDrive microservices.\n * Uses page-based pagination with standardized field names.\n *\n * @module @rawdrive/shared-api/pagination\n */\n\n/**\n * Pagination metadata included in all paginated responses.\n *\n * Field naming conventions:\n * - `page`: 1-based current page number\n * - `limit`: Items per page (also known as page_size)\n * - `total`: Total number of items across all pages\n * - `total_pages`: Total number of pages\n * - `has_next`: Whether there is a next page\n * - `has_prev`: Whether there is a previous page\n */\nexport interface PaginationMeta {\n  /** Current page number (1-based) */\n  page: number;\n  /** Number of items per page */\n  limit: number;\n  /** Total number of items across all pages */\n  total: number;\n  /** Total number of pages */\n  total_pages: number;\n  /** Whether there is a next page */\n  has_next: boolean;\n  /** Whether there is a previous page */\n  has_prev: boolean;\n}\n\n/**\n * Standard paginated response wrapper.\n *\n * All paginated endpoints MUST return data in this format.\n *\n * @typeParam T - The type of items in the data array\n *\n * @example\n * ```json\n * {\n *   \"data\": [\n *     { \"id\": \"1\", \"name\": \"Item 1\" },\n *     { \"id\": \"2\", \"name\": \"Item 2\" }\n *   ],\n *   \"meta\": {\n *     \"page\": 1,\n *     \"limit\": 20,\n *     \"total\": 100,\n *     \"total_pages\": 5,\n *     \"has_next\": true,\n *     \"has_prev\": false\n *   }\n * }\n * ```\n */\nexport interface PaginatedResponse<T> {\n  /** Array of items for the current page */\n  data: T[];\n  /** Pagination metadata */\n  meta: PaginationMeta;\n}\n\n/**\n * Standard pagination query parameters.\n *\n * Used for validating incoming pagination requests.\n */\nexport interface PaginationParams {\n  /** Page number (1-based, default: 1) */\n  page?: number;\n  /** Items per page (default: 20, max: 100) */\n  limit?: number;\n}\n\n/**\n * Default pagination settings.\n */\nexport const PAGINATION_DEFAULTS = {\n  /** Default page number */\n  page: 1,\n  /** Default items per page */\n  limit: 20,\n  /** Minimum items per page */\n  min_limit: 1,\n  /** Maximum items per page */\n  max_limit: 100,\n} as const;\n\n/**\n * Calculate pagination metadata from query results.\n *\n * @param total - Total number of items\n * @param page - Current page number (1-based)\n * @param limit - Items per page\n * @returns Pagination metadata object\n */\nexport function calculatePaginationMeta(\n  total: number,\n  page: number,\n  limit: number\n): PaginationMeta {\n  const total_pages = limit > 0 ? Math.ceil(total / limit) : 0;\n\n  return {\n    page,\n    limit,\n    total,\n    total_pages,\n    has_next: page < total_pages,\n    has_prev: page > 1,\n  };\n}\n\n/**\n * Create a paginated response from data and pagination info.\n *\n * @typeParam T - The type of items in the data array\n * @param data - Array of items for the current page\n * @param total - Total number of items across all pages\n * @param page - Current page number (1-based)\n * @param limit - Items per page\n * @returns Complete paginated response object\n */\nexport function createPaginatedResponse<T>(\n  data: T[],\n  total: number,\n  page: number,\n  limit: number\n): PaginatedResponse<T> {\n  return {\n    data,\n    meta: calculatePaginationMeta(total, page, limit),\n  };\n}\n\n/**\n * Validate and normalize pagination parameters.\n *\n * @param params - Raw pagination parameters from request\n * @returns Normalized pagination parameters with defaults applied\n */\nexport function normalizePaginationParams(\n  params: PaginationParams\n): Required<PaginationParams> {\n  const page = Math.max(params.page ?? PAGINATION_DEFAULTS.page, 1);\n  const limit = Math.min(\n    Math.max(params.limit ?? PAGINATION_DEFAULTS.limit, PAGINATION_DEFAULTS.min_limit),\n    PAGINATION_DEFAULTS.max_limit\n  );\n\n  return { page, limit };\n}\n\n/**\n * Calculate SQL offset from pagination parameters.\n *\n * @param page - Current page number (1-based)\n * @param limit - Items per page\n * @returns Offset value for SQL OFFSET clause\n */\nexport function calculateOffset(page: number, limit: number): number {\n  return (page - 1) * limit;\n}\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current pagination patterns across services",
      "status": "completed",
      "activeForm": "Exploring current pagination patterns"
    },
    {
      "content": "Create @rawdrive/shared-api package structure",
      "status": "completed",
      "activeForm": "Creating shared-api package structure"
    },
    {
      "content": "Implement standard error response envelope",
      "status": "completed",
      "activeForm": "Implementing standard error response envelope"
    },
    {
      "content": "Implement unified PaginatedResponse generic type",
      "status": "completed",
      "activeForm": "Implementing unified PaginatedResponse type"
    },
    {
      "content": "Implement success response wrapper with {data, meta, status}",
      "status": "in_progress",
      "activeForm": "Implementing success response wrapper"
    },
    {
      "content": "Export types from shared-api package",
      "status": "pending",
      "activeForm": "Exporting types from shared-api"
    },
    {
      "content": "Create Python equivalent schemas for backend services",
      "status": "pending",
      "activeForm": "Creating Python equivalent schemas"
    }
  ]
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\src\\response.ts",
  "content": "/**\n * Standardized API Response Types\n *\n * Provides consistent response wrappers across all RawDrive microservices.\n *\n * @module @rawdrive/shared-api/response\n */\n\n/**\n * Response metadata for non-paginated responses.\n */\nexport interface ResponseMeta {\n  /** Request correlation ID for tracing */\n  request_id?: string;\n  /** Response timestamp (ISO 8601) */\n  timestamp?: string;\n  /** API version */\n  version?: string;\n}\n\n/**\n * Standard success response wrapper for single resources.\n *\n * All non-paginated success responses SHOULD use this format.\n *\n * @typeParam T - The type of the data payload\n *\n * @example\n * ```json\n * {\n *   \"data\": {\n *     \"id\": \"123\",\n *     \"name\": \"My Gallery\"\n *   },\n *   \"meta\": {\n *     \"request_id\": \"req_abc123\",\n *     \"timestamp\": \"2026-01-23T12:00:00Z\"\n *   },\n *   \"status\": \"success\"\n * }\n * ```\n */\nexport interface SuccessResponse<T> {\n  /** The response payload */\n  data: T;\n  /** Optional response metadata */\n  meta?: ResponseMeta;\n  /** Response status indicator */\n  status: 'success';\n}\n\n/**\n * Simple success response without data payload.\n *\n * Use for operations that don't return data (e.g., DELETE operations).\n *\n * @example\n * ```json\n * {\n *   \"status\": \"success\",\n *   \"message\": \"Resource deleted successfully\"\n * }\n * ```\n */\nexport interface MessageResponse {\n  /** Response status indicator */\n  status: 'success';\n  /** Human-readable success message */\n  message: string;\n  /** Optional response metadata */\n  meta?: ResponseMeta;\n}\n\n/**\n * Bulk operation response for batch operations.\n *\n * @typeParam T - The type of individual result items (optional)\n *\n * @example\n * ```json\n * {\n *   \"status\": \"success\",\n *   \"message\": \"Bulk operation completed\",\n *   \"data\": {\n *     \"success_count\": 8,\n *     \"failure_count\": 2,\n *     \"results\": [...]\n *   }\n * }\n * ```\n */\nexport interface BulkOperationResult<T = unknown> {\n  /** ID of the processed item */\n  id: string;\n  /** Whether this item was processed successfully */\n  success: boolean;\n  /** Error message if failed */\n  error?: string;\n  /** Optional result data */\n  data?: T;\n}\n\nexport interface BulkOperationResponse<T = unknown> {\n  /** Response status indicator */\n  status: 'success' | 'partial';\n  /** Human-readable summary message */\n  message: string;\n  /** Bulk operation results */\n  data: {\n    /** Number of successful operations */\n    success_count: number;\n    /** Number of failed operations */\n    failure_count: number;\n    /** Individual results for each item */\n    results?: BulkOperationResult<T>[];\n  };\n  /** Optional response metadata */\n  meta?: ResponseMeta;\n}\n\n/**\n * Create a standardized success response.\n *\n * @typeParam T - The type of the data payload\n * @param data - The response payload\n * @param meta - Optional response metadata\n * @returns Formatted success response\n */\nexport function createSuccessResponse<T>(\n  data: T,\n  meta?: ResponseMeta\n): SuccessResponse<T> {\n  return {\n    data,\n    status: 'success',\n    ...(meta && { meta }),\n  };\n}\n\n/**\n * Create a message-only success response.\n *\n * @param message - Success message\n * @param meta - Optional response metadata\n * @returns Formatted message response\n */\nexport function createMessageResponse(\n  message: string,\n  meta?: ResponseMeta\n): MessageResponse {\n  return {\n    status: 'success',\n    message,\n    ...(meta && { meta }),\n  };\n}\n\n/**\n * Create a bulk operation response.\n *\n * @typeParam T - The type of individual result items\n * @param successCount - Number of successful operations\n * @param failureCount - Number of failed operations\n * @param results - Optional array of individual results\n * @param message - Optional summary message\n * @returns Formatted bulk operation response\n */\nexport function createBulkOperationResponse<T = unknown>(\n  successCount: number,\n  failureCount: number,\n  results?: BulkOperationResult<T>[],\n  message?: string\n): BulkOperationResponse<T> {\n  const status = failureCount > 0 && successCount > 0 ? 'partial' : 'success';\n  const defaultMessage =\n    failureCount === 0\n      ? `Successfully processed ${successCount} item(s)`\n      : `Processed ${successCount} item(s) successfully, ${failureCount} failed`;\n\n  return {\n    status,\n    message: message ?? defaultMessage,\n    data: {\n      success_count: successCount,\n      failure_count: failureCount,\n      ...(results && { results }),\n    },\n  };\n}\n\n/**\n * Type guard to check if a response is a SuccessResponse\n */\nexport function isSuccessResponse<T>(\n  response: unknown\n): response is SuccessResponse<T> {\n  return (\n    typeof response === 'object' &&\n    response !== null &&\n    'status' in response &&\n    (response as SuccessResponse<T>).status === 'success' &&\n    'data' in response\n  );\n}\n\n/**\n * Type guard to check if a response is a MessageResponse\n */\nexport function isMessageResponse(response: unknown): response is MessageResponse {\n  return (\n    typeof response === 'object' &&\n    response !== null &&\n    'status' in response &&\n    (response as MessageResponse).status === 'success' &&\n    'message' in response &&\n    !('data' in response)\n  );\n}\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current pagination patterns across services",
      "status": "completed",
      "activeForm": "Exploring current pagination patterns"
    },
    {
      "content": "Create @rawdrive/shared-api package structure",
      "status": "completed",
      "activeForm": "Creating shared-api package structure"
    },
    {
      "content": "Implement standard error response envelope",
      "status": "completed",
      "activeForm": "Implementing standard error response envelope"
    },
    {
      "content": "Implement unified PaginatedResponse generic type",
      "status": "completed",
      "activeForm": "Implementing unified PaginatedResponse type"
    },
    {
      "content": "Implement success response wrapper with {data, meta, status}",
      "status": "completed",
      "activeForm": "Implementing success response wrapper"
    },
    {
      "content": "Export types from shared-api package",
      "status": "in_progress",
      "activeForm": "Exporting types from shared-api"
    },
    {
      "content": "Create Python equivalent schemas for backend services",
      "status": "pending",
      "activeForm": "Creating Python equivalent schemas"
    }
  ]
}

Now let me create the main index export file:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\src\\index.ts",
  "content": "/**\n * @rawdrive/shared-api\n *\n * Standardized API response envelopes, pagination, and error handling\n * for RawDrive microservices.\n *\n * ## Usage\n *\n * ### TypeScript/Frontend\n * ```typescript\n * import {\n *   PaginatedResponse,\n *   ErrorResponse,\n *   SuccessResponse,\n *   createPaginatedResponse,\n *   createErrorResponse,\n * } from '@rawdrive/shared-api';\n * ```\n *\n * ### Standard Response Formats\n *\n * #### Paginated List Response\n * ```json\n * {\n *   \"data\": [...],\n *   \"meta\": {\n *     \"page\": 1,\n *     \"limit\": 20,\n *     \"total\": 100,\n *     \"total_pages\": 5,\n *     \"has_next\": true,\n *     \"has_prev\": false\n *   }\n * }\n * ```\n *\n * #### Success Response\n * ```json\n * {\n *   \"data\": { ... },\n *   \"meta\": { \"request_id\": \"...\" },\n *   \"status\": \"success\"\n * }\n * ```\n *\n * #### Error Response\n * ```json\n * {\n *   \"status\": 400,\n *   \"code\": \"VALIDATION_ERROR\",\n *   \"message\": \"Request validation failed\",\n *   \"details\": [{ \"field\": \"email\", \"message\": \"Invalid format\" }],\n *   \"request_id\": \"...\"\n * }\n * ```\n *\n * @module @rawdrive/shared-api\n */\n\n// Error types and utilities\nexport {\n  ErrorResponse,\n  ErrorDetail,\n  ErrorCode,\n  ErrorCodes,\n  isErrorResponse,\n  createErrorResponse,\n} from './error';\n\n// Pagination types and utilities\nexport {\n  PaginationMeta,\n  PaginatedResponse,\n  PaginationParams,\n  PAGINATION_DEFAULTS,\n  calculatePaginationMeta,\n  createPaginatedResponse,\n  normalizePaginationParams,\n  calculateOffset,\n} from './pagination';\n\n// Response types and utilities\nexport {\n  ResponseMeta,\n  SuccessResponse,\n  MessageResponse,\n  BulkOperationResult,\n  BulkOperationResponse,\n  createSuccessResponse,\n  createMessageResponse,\n  createBulkOperationResponse,\n  isSuccessResponse,\n  isMessageResponse,\n} from './response';\n\n// API Response type union for handling all response types\nimport type { ErrorResponse } from './error';\nimport type { PaginatedResponse } from './pagination';\nimport type { SuccessResponse, MessageResponse, BulkOperationResponse } from './response';\n\n/**\n * Union type representing all possible API response types.\n *\n * @typeParam T - The type of the data payload\n */\nexport type ApiResponse<T> =\n  | SuccessResponse<T>\n  | PaginatedResponse<T>\n  | MessageResponse\n  | BulkOperationResponse<T>\n  | ErrorResponse;\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current pagination patterns across services",
      "status": "completed",
      "activeForm": "Exploring current pagination patterns"
    },
    {
      "content": "Create @rawdrive/shared-api package structure",
      "status": "completed",
      "activeForm": "Creating shared-api package structure"
    },
    {
      "content": "Implement standard error response envelope",
      "status": "completed",
      "activeForm": "Implementing standard error response envelope"
    },
    {
      "content": "Implement unified PaginatedResponse generic type",
      "status": "completed",
      "activeForm": "Implementing unified PaginatedResponse type"
    },
    {
      "content": "Implement success response wrapper with {data, meta, status}",
      "status": "completed",
      "activeForm": "Implementing success response wrapper"
    },
    {
      "content": "Export types from shared-api package",
      "status": "completed",
      "activeForm": "Exporting types from shared-api"
    },
    {
      "content": "Create Python equivalent schemas for backend services",
      "status": "in_progress",
      "activeForm": "Creating Python equivalent schemas"
    }
  ]
}

Now let me create the Python equivalent schemas that can be used by all Python microservices. I'll create them in a shared location:

🔧 Tool: Bash
Input: {
  "command": "mkdir -p \"C:/Users/admin/Desktop/RawDrive2/packages/shared-api/python\"",
  "description": "Create Python schemas directory"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\python\\__init__.py",
  "content": "\"\"\"\n@rawdrive/shared-api - Python Schemas\n\nStandardized API response envelopes, pagination, and error handling\nfor RawDrive Python microservices.\n\nUsage:\n    from shared_api import (\n        PaginatedResponse,\n        ErrorResponse,\n        SuccessResponse,\n        create_paginated_response,\n        create_error_response,\n    )\n\nThis module provides Pydantic models that match the TypeScript types\nin @rawdrive/shared-api for consistent API responses across all services.\n\"\"\"\n\nfrom .error import (\n    ErrorDetail,\n    ErrorResponse,\n    ErrorCodes,\n    create_error_response,\n)\nfrom .pagination import (\n    PaginationMeta,\n    PaginatedResponse,\n    PaginationParams,\n    PAGINATION_DEFAULTS,\n    calculate_pagination_meta,\n    create_paginated_response,\n    normalize_pagination_params,\n    calculate_offset,\n)\nfrom .response import (\n    ResponseMeta,\n    SuccessResponse,\n    MessageResponse,\n    BulkOperationResult,\n    BulkOperationResponse,\n    create_success_response,\n    create_message_response,\n    create_bulk_operation_response,\n)\n\n__all__ = [\n    # Error types\n    \"ErrorDetail\",\n    \"ErrorResponse\",\n    \"ErrorCodes\",\n    \"create_error_response\",\n    # Pagination types\n    \"PaginationMeta\",\n    \"PaginatedResponse\",\n    \"PaginationParams\",\n    \"PAGINATION_DEFAULTS\",\n    \"calculate_pagination_meta\",\n    \"create_paginated_response\",\n    \"normalize_pagination_params\",\n    \"calculate_offset\",\n    # Response types\n    \"ResponseMeta\",\n    \"SuccessResponse\",\n    \"MessageResponse\",\n    \"BulkOperationResult\",\n    \"BulkOperationResponse\",\n    \"create_success_response\",\n    \"create_message_response\",\n    \"create_bulk_operation_response\",\n]\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\python\\error.py",
  "content": "\"\"\"\nStandardized Error Response Types\n\nProvides consistent error handling across all RawDrive microservices.\nBased on RFC 7807 Problem Details for HTTP APIs with RawDrive extensions.\n\"\"\"\n\nfrom typing import List, Optional\nfrom pydantic import BaseModel, Field\n\n\nclass ErrorDetail(BaseModel):\n    \"\"\"Detailed error information for a specific field (validation errors).\"\"\"\n\n    field: Optional[str] = Field(\n        None,\n        description=\"Field path that caused the error (e.g., 'body.email', 'query.page')\",\n    )\n    message: str = Field(..., description=\"Human-readable error message for this field\")\n    code: Optional[str] = Field(\n        None, description=\"Optional error code for programmatic handling\"\n    )\n\n\nclass ErrorResponse(BaseModel):\n    \"\"\"\n    Standard error response envelope.\n\n    All microservices MUST return errors in this format for consistency.\n\n    Example:\n        {\n            \"status\": 400,\n            \"code\": \"VALIDATION_ERROR\",\n            \"message\": \"Request validation failed\",\n            \"details\": [\n                {\"field\": \"body.email\", \"message\": \"Invalid email format\"}\n            ],\n            \"request_id\": \"req_abc123\"\n        }\n    \"\"\"\n\n    status: int = Field(..., description=\"HTTP status code (400, 401, 403, 404, 422, 500, etc.)\")\n    code: str = Field(..., description=\"Machine-readable error code for programmatic handling\")\n    message: str = Field(..., description=\"Human-readable error message\")\n    details: Optional[List[ErrorDetail]] = Field(\n        None, description=\"Optional array of field-level error details\"\n    )\n    request_id: Optional[str] = Field(\n        None, description=\"Request correlation ID for tracing\"\n    )\n\n    class Config:\n        json_schema_extra = {\n            \"example\": {\n                \"status\": 400,\n                \"code\": \"VALIDATION_ERROR\",\n                \"message\": \"Request validation failed\",\n                \"details\": [{\"field\": \"body.email\", \"message\": \"Invalid email format\"}],\n                \"request_id\": \"req_abc123\",\n            }\n        }\n\n\nclass ErrorCodes:\n    \"\"\"Standard error codes used across all microservices.\"\"\"\n\n    # Authentication errors (401)\n    AUTHENTICATION_REQUIRED = \"AUTHENTICATION_REQUIRED\"\n    INVALID_TOKEN = \"INVALID_TOKEN\"\n    TOKEN_EXPIRED = \"TOKEN_EXPIRED\"\n\n    # Authorization errors (403)\n    INSUFFICIENT_PERMISSIONS = \"INSUFFICIENT_PERMISSIONS\"\n    FORBIDDEN = \"FORBIDDEN\"\n    WORKSPACE_ACCESS_DENIED = \"WORKSPACE_ACCESS_DENIED\"\n\n    # Client errors (400)\n    VALIDATION_ERROR = \"VALIDATION_ERROR\"\n    BAD_REQUEST = \"BAD_REQUEST\"\n    INVALID_INPUT = \"INVALID_INPUT\"\n\n    # Not found errors (404)\n    NOT_FOUND = \"NOT_FOUND\"\n    RESOURCE_NOT_FOUND = \"RESOURCE_NOT_FOUND\"\n\n    # Conflict errors (409)\n    CONFLICT = \"CONFLICT\"\n    DUPLICATE_RESOURCE = \"DUPLICATE_RESOURCE\"\n\n    # Rate limiting (429)\n    RATE_LIMIT_EXCEEDED = \"RATE_LIMIT_EXCEEDED\"\n\n    # Server errors (500+)\n    INTERNAL_ERROR = \"INTERNAL_ERROR\"\n    SERVICE_UNAVAILABLE = \"SERVICE_UNAVAILABLE\"\n    GATEWAY_TIMEOUT = \"GATEWAY_TIMEOUT\"\n\n\ndef create_error_response(\n    status: int,\n    code: str,\n    message: str,\n    details: Optional[List[ErrorDetail]] = None,\n    request_id: Optional[str] = None,\n) -> ErrorResponse:\n    \"\"\"\n    Create a standardized error response.\n\n    Args:\n        status: HTTP status code\n        code: Machine-readable error code\n        message: Human-readable error message\n        details: Optional list of field-level errors\n        request_id: Optional request correlation ID\n\n    Returns:\n        Formatted ErrorResponse instance\n    \"\"\"\n    return ErrorResponse(\n        status=status,\n        code=code,\n        message=message,\n        details=details,\n        request_id=request_id,\n    )\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\python\\pagination.py",
  "content": "\"\"\"\nStandardized Pagination Types\n\nProvides consistent pagination handling across all RawDrive microservices.\nUses page-based pagination with standardized field names.\n\"\"\"\n\nfrom typing import Generic, List, Optional, TypeVar\nfrom pydantic import BaseModel, Field\n\n\nT = TypeVar(\"T\")\n\n\nclass PaginationMeta(BaseModel):\n    \"\"\"\n    Pagination metadata included in all paginated responses.\n\n    Field naming conventions:\n    - page: 1-based current page number\n    - limit: Items per page (also known as page_size)\n    - total: Total number of items across all pages\n    - total_pages: Total number of pages\n    - has_next: Whether there is a next page\n    - has_prev: Whether there is a previous page\n    \"\"\"\n\n    page: int = Field(..., ge=1, description=\"Current page number (1-based)\")\n    limit: int = Field(..., ge=1, le=100, description=\"Number of items per page\")\n    total: int = Field(..., ge=0, description=\"Total number of items across all pages\")\n    total_pages: int = Field(..., ge=0, description=\"Total number of pages\")\n    has_next: bool = Field(..., description=\"Whether there is a next page\")\n    has_prev: bool = Field(..., description=\"Whether there is a previous page\")\n\n    class Config:\n        json_schema_extra = {\n            \"example\": {\n                \"page\": 1,\n                \"limit\": 20,\n                \"total\": 100,\n                \"total_pages\": 5,\n                \"has_next\": True,\n                \"has_prev\": False,\n            }\n        }\n\n\nclass PaginatedResponse(BaseModel, Generic[T]):\n    \"\"\"\n    Standard paginated response wrapper.\n\n    All paginated endpoints MUST return data in this format.\n\n    Example:\n        {\n            \"data\": [\n                {\"id\": \"1\", \"name\": \"Item 1\"},\n                {\"id\": \"2\", \"name\": \"Item 2\"}\n            ],\n            \"meta\": {\n                \"page\": 1,\n                \"limit\": 20,\n                \"total\": 100,\n                \"total_pages\": 5,\n                \"has_next\": true,\n                \"has_prev\": false\n            }\n        }\n    \"\"\"\n\n    data: List[T] = Field(..., description=\"Array of items for the current page\")\n    meta: PaginationMeta = Field(..., description=\"Pagination metadata\")\n\n    class Config:\n        json_schema_extra = {\n            \"example\": {\n                \"data\": [{\"id\": \"1\", \"name\": \"Item 1\"}],\n                \"meta\": {\n                    \"page\": 1,\n                    \"limit\": 20,\n                    \"total\": 100,\n                    \"total_pages\": 5,\n                    \"has_next\": True,\n                    \"has_prev\": False,\n                },\n            }\n        }\n\n\nclass PaginationParams(BaseModel):\n    \"\"\"Standard pagination query parameters.\"\"\"\n\n    page: int = Field(default=1, ge=1, description=\"Page number (1-based, default: 1)\")\n    limit: int = Field(\n        default=20, ge=1, le=100, description=\"Items per page (default: 20, max: 100)\"\n    )\n\n    @property\n    def offset(self) -> int:\n        \"\"\"Calculate offset for database query.\"\"\"\n        return (self.page - 1) * self.limit\n\n\nclass PAGINATION_DEFAULTS:\n    \"\"\"Default pagination settings.\"\"\"\n\n    page: int = 1\n    limit: int = 20\n    min_limit: int = 1\n    max_limit: int = 100\n\n\ndef calculate_pagination_meta(total: int, page: int, limit: int) -> PaginationMeta:\n    \"\"\"\n    Calculate pagination metadata from query results.\n\n    Args:\n        total: Total number of items\n        page: Current page number (1-based)\n        limit: Items per page\n\n    Returns:\n        Pagination metadata object\n    \"\"\"\n    total_pages = (total + limit - 1) // limit if limit > 0 else 0\n\n    return PaginationMeta(\n        page=page,\n        limit=limit,\n        total=total,\n        total_pages=total_pages,\n        has_next=page < total_pages,\n        has_prev=page > 1,\n    )\n\n\ndef create_paginated_response(\n    data: List[T],\n    total: int,\n    page: int,\n    limit: int,\n) -> dict:\n    \"\"\"\n    Create a paginated response from data and pagination info.\n\n    Args:\n        data: Array of items for the current page\n        total: Total number of items across all pages\n        page: Current page number (1-based)\n        limit: Items per page\n\n    Returns:\n        Complete paginated response dict\n    \"\"\"\n    return {\n        \"data\": data,\n        \"meta\": calculate_pagination_meta(total, page, limit).model_dump(),\n    }\n\n\ndef normalize_pagination_params(\n    page: Optional[int] = None,\n    limit: Optional[int] = None,\n) -> tuple[int, int]:\n    \"\"\"\n    Validate and normalize pagination parameters.\n\n    Args:\n        page: Raw page parameter from request\n        limit: Raw limit parameter from request\n\n    Returns:\n        Tuple of (normalized_page, normalized_limit)\n    \"\"\"\n    normalized_page = max(page if page is not None else PAGINATION_DEFAULTS.page, 1)\n    normalized_limit = min(\n        max(\n            limit if limit is not None else PAGINATION_DEFAULTS.limit,\n            PAGINATION_DEFAULTS.min_limit,\n        ),\n        PAGINATION_DEFAULTS.max_limit,\n    )\n    return normalized_page, normalized_limit\n\n\ndef calculate_offset(page: int, limit: int) -> int:\n    \"\"\"\n    Calculate SQL offset from pagination parameters.\n\n    Args:\n        page: Current page number (1-based)\n        limit: Items per page\n\n    Returns:\n        Offset value for SQL OFFSET clause\n    \"\"\"\n    return (page - 1) * limit\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\python\\response.py",
  "content": "\"\"\"\nStandardized API Response Types\n\nProvides consistent response wrappers across all RawDrive microservices.\n\"\"\"\n\nfrom typing import Any, Generic, List, Literal, Optional, TypeVar\nfrom pydantic import BaseModel, Field\n\n\nT = TypeVar(\"T\")\n\n\nclass ResponseMeta(BaseModel):\n    \"\"\"Response metadata for non-paginated responses.\"\"\"\n\n    request_id: Optional[str] = Field(\n        None, description=\"Request correlation ID for tracing\"\n    )\n    timestamp: Optional[str] = Field(None, description=\"Response timestamp (ISO 8601)\")\n    version: Optional[str] = Field(None, description=\"API version\")\n\n\nclass SuccessResponse(BaseModel, Generic[T]):\n    \"\"\"\n    Standard success response wrapper for single resources.\n\n    All non-paginated success responses SHOULD use this format.\n\n    Example:\n        {\n            \"data\": {\n                \"id\": \"123\",\n                \"name\": \"My Gallery\"\n            },\n            \"meta\": {\n                \"request_id\": \"req_abc123\",\n                \"timestamp\": \"2026-01-23T12:00:00Z\"\n            },\n            \"status\": \"success\"\n        }\n    \"\"\"\n\n    data: Any = Field(..., description=\"The response payload\")\n    meta: Optional[ResponseMeta] = Field(None, description=\"Optional response metadata\")\n    status: Literal[\"success\"] = Field(default=\"success\", description=\"Response status indicator\")\n\n\nclass MessageResponse(BaseModel):\n    \"\"\"\n    Simple success response without data payload.\n\n    Use for operations that don't return data (e.g., DELETE operations).\n\n    Example:\n        {\n            \"status\": \"success\",\n            \"message\": \"Resource deleted successfully\"\n        }\n    \"\"\"\n\n    status: Literal[\"success\"] = Field(default=\"success\", description=\"Response status indicator\")\n    message: str = Field(..., description=\"Human-readable success message\")\n    meta: Optional[ResponseMeta] = Field(None, description=\"Optional response metadata\")\n\n\nclass BulkOperationResult(BaseModel, Generic[T]):\n    \"\"\"Individual result in a bulk operation.\"\"\"\n\n    id: str = Field(..., description=\"ID of the processed item\")\n    success: bool = Field(..., description=\"Whether this item was processed successfully\")\n    error: Optional[str] = Field(None, description=\"Error message if failed\")\n    data: Optional[Any] = Field(None, description=\"Optional result data\")\n\n\nclass BulkOperationData(BaseModel, Generic[T]):\n    \"\"\"Data payload for bulk operation response.\"\"\"\n\n    success_count: int = Field(..., description=\"Number of successful operations\")\n    failure_count: int = Field(..., description=\"Number of failed operations\")\n    results: Optional[List[BulkOperationResult]] = Field(\n        None, description=\"Individual results for each item\"\n    )\n\n\nclass BulkOperationResponse(BaseModel, Generic[T]):\n    \"\"\"\n    Bulk operation response for batch operations.\n\n    Example:\n        {\n            \"status\": \"success\",\n            \"message\": \"Bulk operation completed\",\n            \"data\": {\n                \"success_count\": 8,\n                \"failure_count\": 2,\n                \"results\": [...]\n            }\n        }\n    \"\"\"\n\n    status: Literal[\"success\", \"partial\"] = Field(\n        ..., description=\"Response status indicator\"\n    )\n    message: str = Field(..., description=\"Human-readable summary message\")\n    data: BulkOperationData = Field(..., description=\"Bulk operation results\")\n    meta: Optional[ResponseMeta] = Field(None, description=\"Optional response metadata\")\n\n\ndef create_success_response(\n    data: Any,\n    request_id: Optional[str] = None,\n    timestamp: Optional[str] = None,\n) -> dict:\n    \"\"\"\n    Create a standardized success response.\n\n    Args:\n        data: The response payload\n        request_id: Optional request correlation ID\n        timestamp: Optional response timestamp\n\n    Returns:\n        Formatted success response dict\n    \"\"\"\n    response = {\n        \"data\": data,\n        \"status\": \"success\",\n    }\n\n    if request_id or timestamp:\n        response[\"meta\"] = {}\n        if request_id:\n            response[\"meta\"][\"request_id\"] = request_id\n        if timestamp:\n            response[\"meta\"][\"timestamp\"] = timestamp\n\n    return response\n\n\ndef create_message_response(\n    message: str,\n    request_id: Optional[str] = None,\n) -> dict:\n    \"\"\"\n    Create a message-only success response.\n\n    Args:\n        message: Success message\n        request_id: Optional request correlation ID\n\n    Returns:\n        Formatted message response dict\n    \"\"\"\n    response = {\n        \"status\": \"success\",\n        \"message\": message,\n    }\n\n    if request_id:\n        response[\"meta\"] = {\"request_id\": request_id}\n\n    return response\n\n\ndef create_bulk_operation_response(\n    success_count: int,\n    failure_count: int,\n    results: Optional[List[dict]] = None,\n    message: Optional[str] = None,\n) -> dict:\n    \"\"\"\n    Create a bulk operation response.\n\n    Args:\n        success_count: Number of successful operations\n        failure_count: Number of failed operations\n        results: Optional array of individual results\n        message: Optional summary message\n\n    Returns:\n        Formatted bulk operation response dict\n    \"\"\"\n    status = \"partial\" if failure_count > 0 and success_count > 0 else \"success\"\n    default_message = (\n        f\"Successfully processed {success_count} item(s)\"\n        if failure_count == 0\n        else f\"Processed {success_count} item(s) successfully, {failure_count} failed\"\n    )\n\n    response = {\n        \"status\": status,\n        \"message\": message or default_message,\n        \"data\": {\n            \"success_count\": success_count,\n            \"failure_count\": failure_count,\n        },\n    }\n\n    if results:\n        response[\"data\"][\"results\"] = results\n\n    return response\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current pagination patterns across services",
      "status": "completed",
      "activeForm": "Exploring current pagination patterns"
    },
    {
      "content": "Create @rawdrive/shared-api package structure",
      "status": "completed",
      "activeForm": "Creating shared-api package structure"
    },
    {
      "content": "Implement standard error response envelope",
      "status": "completed",
      "activeForm": "Implementing standard error response envelope"
    },
    {
      "content": "Implement unified PaginatedResponse generic type",
      "status": "completed",
      "activeForm": "Implementing unified PaginatedResponse type"
    },
    {
      "content": "Implement success response wrapper with {data, meta, status}",
      "status": "completed",
      "activeForm": "Implementing success response wrapper"
    },
    {
      "content": "Export types from shared-api package",
      "status": "completed",
      "activeForm": "Exporting types from shared-api"
    },
    {
      "content": "Create Python equivalent schemas for backend services",
      "status": "completed",
      "activeForm": "Creating Python equivalent schemas"
    },
    {
      "content": "Build and verify TypeScript package",
      "status": "in_progress",
      "activeForm": "Building and verifying TypeScript package"
    },
    {
      "content": "Create README documentation with usage examples",
      "status": "pending",
      "activeForm": "Creating README documentation"
    }
  ]
}

Let me verify the TypeScript package compiles correctly:

🔧 Tool: Bash
Input: {
  "command": "cd \"C:/Users/admin/Desktop/RawDrive2/packages/shared-api\" && pnpm install 2>&1 | head -30",
  "description": "Install dependencies for shared-api"
}

🔧 Tool: Bash
Input: {
  "command": "cd \"C:/Users/admin/Desktop/RawDrive2/packages/shared-api\" && pnpm build 2>&1",
  "description": "Build shared-api TypeScript package"
}

The package builds successfully. Now let me create a README with usage examples:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\README.md",
  "content": "# @rawdrive/shared-api\n\nStandardized API response envelopes, pagination, and error handling for RawDrive microservices.\n\n## Overview\n\nThis package provides consistent API response types across all 15 RawDrive microservices, ensuring:\n\n- **Unified pagination format** with `{data, meta}` structure\n- **Standard error responses** matching RFC 7807 with RawDrive extensions\n- **Success response wrappers** with `{data, meta, status}` structure\n- **Type-safe utilities** for creating responses\n\n## Installation\n\n### TypeScript/Frontend\n\n```bash\npnpm add @rawdrive/shared-api\n```\n\n### Python/Backend\n\nCopy the `python/` directory to your service's shared modules or import directly.\n\n## Response Formats\n\n### Paginated Response\n\nAll list endpoints return paginated data in this format:\n\n```json\n{\n  \"data\": [\n    { \"id\": \"1\", \"name\": \"Item 1\" },\n    { \"id\": \"2\", \"name\": \"Item 2\" }\n  ],\n  \"meta\": {\n    \"page\": 1,\n    \"limit\": 20,\n    \"total\": 100,\n    \"total_pages\": 5,\n    \"has_next\": true,\n    \"has_prev\": false\n  }\n}\n```\n\n### Success Response\n\nSingle resource responses use this format:\n\n```json\n{\n  \"data\": {\n    \"id\": \"123\",\n    \"name\": \"My Gallery\"\n  },\n  \"meta\": {\n    \"request_id\": \"req_abc123\",\n    \"timestamp\": \"2026-01-23T12:00:00Z\"\n  },\n  \"status\": \"success\"\n}\n```\n\n### Error Response\n\nAll errors return in this format:\n\n```json\n{\n  \"status\": 400,\n  \"code\": \"VALIDATION_ERROR\",\n  \"message\": \"Request validation failed\",\n  \"details\": [\n    { \"field\": \"body.email\", \"message\": \"Invalid email format\" }\n  ],\n  \"request_id\": \"req_abc123\"\n}\n```\n\n## Usage\n\n### TypeScript\n\n```typescript\nimport {\n  PaginatedResponse,\n  PaginationMeta,\n  createPaginatedResponse,\n  ErrorResponse,\n  ErrorCodes,\n  createErrorResponse,\n  SuccessResponse,\n  createSuccessResponse,\n} from '@rawdrive/shared-api';\n\n// Define your data type\ninterface Gallery {\n  id: string;\n  name: string;\n}\n\n// Create a paginated response\nconst response: PaginatedResponse<Gallery> = createPaginatedResponse(\n  galleries,\n  totalCount,\n  page,\n  limit\n);\n\n// Create an error response\nconst error: ErrorResponse = createErrorResponse(\n  400,\n  ErrorCodes.VALIDATION_ERROR,\n  'Email is required',\n  {\n    details: [{ field: 'email', message: 'This field is required' }],\n    request_id: 'req_123',\n  }\n);\n\n// Create a success response\nconst success: SuccessResponse<Gallery> = createSuccessResponse(gallery, {\n  request_id: 'req_123',\n});\n```\n\n### Python\n\n```python\nfrom shared_api import (\n    PaginatedResponse,\n    create_paginated_response,\n    ErrorResponse,\n    ErrorCodes,\n    create_error_response,\n    create_success_response,\n)\n\n# Create a paginated response\nresponse = create_paginated_response(\n    data=galleries,\n    total=total_count,\n    page=page,\n    limit=limit,\n)\n\n# Create an error response\nerror = create_error_response(\n    status=400,\n    code=ErrorCodes.VALIDATION_ERROR,\n    message=\"Email is required\",\n    details=[ErrorDetail(field=\"email\", message=\"This field is required\")],\n)\n\n# Create a success response\nsuccess = create_success_response(\n    data=gallery,\n    request_id=\"req_123\",\n)\n```\n\n### FastAPI Integration\n\n```python\nfrom fastapi import APIRouter, Query\nfrom shared_api import (\n    PaginatedResponse,\n    PaginationParams,\n    create_paginated_response,\n    normalize_pagination_params,\n    calculate_offset,\n)\n\nrouter = APIRouter()\n\n@router.get(\"/galleries\")\nasync def list_galleries(\n    page: int = Query(1, ge=1),\n    limit: int = Query(20, ge=1, le=100),\n):\n    page, limit = normalize_pagination_params(page, limit)\n    offset = calculate_offset(page, limit)\n\n    galleries = await repository.get_many(offset=offset, limit=limit)\n    total = await repository.count()\n\n    return create_paginated_response(\n        data=[g.model_dump() for g in galleries],\n        total=total,\n        page=page,\n        limit=limit,\n    )\n```\n\n## Migration Guide\n\n### Before (Inconsistent)\n\n```python\n# Service A - uses 'items' and 'per_page'\n{\"items\": [...], \"total\": 100, \"page\": 1, \"per_page\": 20}\n\n# Service B - uses 'data' and 'limit'\n{\"data\": [...], \"total\": 100, \"page\": 1, \"limit\": 20}\n\n# Service C - uses nested 'pagination'\n{\"data\": [...], \"pagination\": {\"total\": 100, \"page\": 1}}\n```\n\n### After (Standardized)\n\n```python\n# All services use the same format\n{\n  \"data\": [...],\n  \"meta\": {\n    \"page\": 1,\n    \"limit\": 20,\n    \"total\": 100,\n    \"total_pages\": 5,\n    \"has_next\": true,\n    \"has_prev\": false\n  }\n}\n```\n\n## Field Reference\n\n### PaginationMeta Fields\n\n| Field | Type | Description |\n|-------|------|-------------|\n| `page` | int | Current page number (1-based) |\n| `limit` | int | Items per page |\n| `total` | int | Total items across all pages |\n| `total_pages` | int | Total number of pages |\n| `has_next` | bool | Whether there's a next page |\n| `has_prev` | bool | Whether there's a previous page |\n\n### ErrorResponse Fields\n\n| Field | Type | Description |\n|-------|------|-------------|\n| `status` | int | HTTP status code |\n| `code` | string | Machine-readable error code |\n| `message` | string | Human-readable message |\n| `details` | array | Optional field-level errors |\n| `request_id` | string | Request correlation ID |\n\n### Standard Error Codes\n\n| Code | HTTP Status | Description |\n|------|-------------|-------------|\n| `VALIDATION_ERROR` | 400 | Request validation failed |\n| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid auth |\n| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks permissions |\n| `NOT_FOUND` | 404 | Resource not found |\n| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |\n| `INTERNAL_ERROR` | 500 | Server error |\n\n## Defaults\n\n- **Default page**: 1\n- **Default limit**: 20\n- **Max limit**: 100\n- **Min limit**: 1\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current pagination patterns across services",
      "status": "completed",
      "activeForm": "Exploring current pagination patterns"
    },
    {
      "content": "Create @rawdrive/shared-api package structure",
      "status": "completed",
      "activeForm": "Creating shared-api package structure"
    },
    {
      "content": "Implement standard error response envelope",
      "status": "completed",
      "activeForm": "Implementing standard error response envelope"
    },
    {
      "content": "Implement unified PaginatedResponse generic type",
      "status": "completed",
      "activeForm": "Implementing unified PaginatedResponse type"
    },
    {
      "content": "Implement success response wrapper with {data, meta, status}",
      "status": "completed",
      "activeForm": "Implementing success response wrapper"
    },
    {
      "content": "Export types from shared-api package",
      "status": "completed",
      "activeForm": "Exporting types from shared-api"
    },
    {
      "content": "Create Python equivalent schemas for backend services",
      "status": "completed",
      "activeForm": "Creating Python equivalent schemas"
    },
    {
      "content": "Build and verify TypeScript package",
      "status": "completed",
      "activeForm": "Building and verifying TypeScript package"
    },
    {
      "content": "Create README documentation with usage examples",
      "status": "completed",
      "activeForm": "Creating README documentation"
    }
  ]
}

Now let me verify the package is properly included in the workspace. The pnpm-workspace.yaml already includes `packages/*` so it should be automatically picked up. Let me verify:

🔧 Tool: Bash
Input: {
  "command": "cd \"C:/Users/admin/Desktop/RawDrive2\" && pnpm list --filter \"@rawdrive/*\" --depth=0 2>&1 | head -20",
  "description": "Verify shared-api is in workspace"
}

🔧 Tool: Bash
Input: {
  "command": "cd \"C:/Users/admin/Desktop/RawDrive2\" && ls packages/",
  "description": "List all packages in workspace"
}

The package is included. Let me also verify the built files exist:

🔧 Tool: Bash
Input: {
  "command": "ls -la \"C:/Users/admin/Desktop/RawDrive2/packages/shared-api/dist/\"",
  "description": "Verify built files"
}

All files are built. Let me verify the package structure:

🔧 Tool: Bash
Input: {
  "command": "cd \"C:/Users/admin/Desktop/RawDrive2/packages/shared-api\" && find . -type f -name \"*.py\" -o -name \"*.ts\" -o -name \"*.json\" 2>/dev/null | grep -v node_modules | grep -v dist | sort",
  "description": "List package structure"
}

The package is complete. Now let me create a brief summary of what was implemented:

<summary>
## Summary: Standardize API response envelopes and pagination across microservices

### Changes Implemented

1. **Created `@rawdrive/shared-api` package** - A new shared package providing standardized API response types for both TypeScript and Python

2. **Standardized Error Response Envelope** (`error.ts` / `error.py`):
   - `ErrorResponse` type with consistent fields: `status`, `code`, `message`, `details`, `request_id`
   - `ErrorDetail` type for field-level validation errors
   - `ErrorCodes` enum with standard error codes (VALIDATION_ERROR, NOT_FOUND, etc.)
   - Helper function `createErrorResponse()` / `create_error_response()`

3. **Unified Pagination Response** (`pagination.ts` / `pagination.py`):
   - `PaginatedResponse<T>` generic type with `{data, meta}` structure
   - `PaginationMeta` with standardized fields: `page`, `limit`, `total`, `total_pages`, `has_next`, `has_prev`
   - Helper functions: `createPaginatedResponse()`, `calculatePaginationMeta()`, `normalizePaginationParams()`, `calculateOffset()`
   - `PAGINATION_DEFAULTS` constants (page=1, limit=20, max=100)

4. **Success Response Wrapper** (`response.ts` / `response.py`):
   - `SuccessResponse<T>` with `{data, meta, status}` structure
   - `MessageResponse` for operations without data payload
   - `BulkOperationResponse` for batch operations with success/failure counts
   - Helper functions: `createSuccessResponse()`, `createMessageResponse()`, `createBulkOperationResponse()`

5. **Package Configuration**:
   - TypeScript configuration (`tsconfig.json`)
   - Package manifest (`package.json`) with proper exports
   - Comprehensive README with usage examples and migration guide

### Files Modified

None - this is a new package

### Files Created

**TypeScript Sources:**
- `packages/shared-api/package.json`
- `packages/shared-api/tsconfig.json`
- `packages/shared-api/README.md`
- `packages/shared-api/src/index.ts`
- `packages/shared-api/src/error.ts`
- `packages/shared-api/src/pagination.ts`
- `packages/shared-api/src/response.ts`

**Python Sources:**
- `packages/shared-api/python/__init__.py`
- `packages/shared-api/python/error.py`
- `packages/shared-api/python/pagination.py`
- `packages/shared-api/python/response.py`

### Notes for Developer

1. **Existing Services**: This package establishes the standard - existing services should be migrated to use these types. The inconsistencies identified were:
   - webhooks-service uses `items`, `page_size`
   - backend uses `items`/`data`, `per_page`
   - gallery-service uses `limit`, `has_more`
   - livesync-service uses `data`, `limit`

2. **Migration Path**: 
   - Import from `@rawdrive/shared-api` in TypeScript
   - Copy `python/` directory to service's shared modules for Python
   - Replace existing pagination/error schemas with the standardized ones

3. **Standard Format**:
   - Pagination: `{data: [...], meta: {page, limit, total, total_pages, has_next, has_prev}}`
   - Success: `{data: {...}, meta?: {...}, status: "success"}`
   - Error: `{status: 400, code: "CODE", message: "...", details?: [...], request_id?: "..."}`

4. **Package is already built** and verified - ready for use in other packages/services
</summary>