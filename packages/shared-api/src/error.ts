/**
 * Standardized Error Response Types
 *
 * Provides consistent error handling across all RawDrive microservices.
 * Based on RFC 7807 Problem Details for HTTP APIs with RawDrive extensions.
 *
 * @module @rawdrive/shared-api/error
 */

/**
 * Detailed error information for a specific field (validation errors).
 */
export interface ErrorDetail {
  /** Field path that caused the error (e.g., "body.email", "query.page") */
  field?: string;
  /** Human-readable error message for this field */
  message: string;
  /** Optional error code for programmatic handling */
  code?: string;
}

/**
 * Standard error response envelope.
 *
 * All microservices MUST return errors in this format for consistency.
 *
 * @example
 * ```json
 * {
 *   "status": 400,
 *   "code": "VALIDATION_ERROR",
 *   "message": "Request validation failed",
 *   "details": [
 *     { "field": "body.email", "message": "Invalid email format" }
 *   ],
 *   "request_id": "req_abc123"
 * }
 * ```
 */
export interface ErrorResponse {
  /** HTTP status code (400, 401, 403, 404, 422, 500, etc.) */
  status: number;
  /** Machine-readable error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Optional array of field-level error details */
  details?: ErrorDetail[];
  /** Request correlation ID for tracing */
  request_id?: string;
}

/**
 * Standard error codes used across all microservices.
 * Services may extend with domain-specific codes.
 */
export const ErrorCodes = {
  // Authentication errors (401)
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Authorization errors (403)
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  FORBIDDEN: 'FORBIDDEN',
  WORKSPACE_ACCESS_DENIED: 'WORKSPACE_ACCESS_DENIED',

  // Client errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  INVALID_INPUT: 'INVALID_INPUT',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

  // Conflict errors (409)
  CONFLICT: 'CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Server errors (500+)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Type guard to check if a response is an ErrorResponse
 */
export function isErrorResponse(response: unknown): response is ErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    'code' in response &&
    'message' in response &&
    typeof (response as ErrorResponse).status === 'number' &&
    typeof (response as ErrorResponse).code === 'string' &&
    typeof (response as ErrorResponse).message === 'string'
  );
}

/**
 * Create a standardized error response.
 */
export function createErrorResponse(
  status: number,
  code: string,
  message: string,
  options?: {
    details?: ErrorDetail[];
    request_id?: string;
  }
): ErrorResponse {
  return {
    status,
    code,
    message,
    ...(options?.details && { details: options.details }),
    ...(options?.request_id && { request_id: options.request_id }),
  };
}
