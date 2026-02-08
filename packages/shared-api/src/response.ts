/**
 * Standardized API Response Types
 *
 * Provides consistent response wrappers across all RawDrive microservices.
 *
 * @module @rawdrive/shared-api/response
 */

/**
 * Response metadata for non-paginated responses.
 */
export interface ResponseMeta {
  /** Request correlation ID for tracing */
  request_id?: string;
  /** Response timestamp (ISO 8601) */
  timestamp?: string;
  /** API version */
  version?: string;
}

/**
 * Standard success response wrapper for single resources.
 *
 * All non-paginated success responses SHOULD use this format.
 *
 * @typeParam T - The type of the data payload
 *
 * @example
 * ```json
 * {
 *   "data": {
 *     "id": "123",
 *     "name": "My Gallery"
 *   },
 *   "meta": {
 *     "request_id": "req_abc123",
 *     "timestamp": "2026-01-23T12:00:00Z"
 *   },
 *   "status": "success"
 * }
 * ```
 */
export interface SuccessResponse<T> {
  /** The response payload */
  data: T;
  /** Optional response metadata */
  meta?: ResponseMeta;
  /** Response status indicator */
  status: 'success';
}

/**
 * Simple success response without data payload.
 *
 * Use for operations that don't return data (e.g., DELETE operations).
 *
 * @example
 * ```json
 * {
 *   "status": "success",
 *   "message": "Resource deleted successfully"
 * }
 * ```
 */
export interface MessageResponse {
  /** Response status indicator */
  status: 'success';
  /** Human-readable success message */
  message: string;
  /** Optional response metadata */
  meta?: ResponseMeta;
}

/**
 * Bulk operation response for batch operations.
 *
 * @typeParam T - The type of individual result items (optional)
 *
 * @example
 * ```json
 * {
 *   "status": "success",
 *   "message": "Bulk operation completed",
 *   "data": {
 *     "success_count": 8,
 *     "failure_count": 2,
 *     "results": [...]
 *   }
 * }
 * ```
 */
export interface BulkOperationResult<T = unknown> {
  /** ID of the processed item */
  id: string;
  /** Whether this item was processed successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Optional result data */
  data?: T;
}

export interface BulkOperationResponse<T = unknown> {
  /** Response status indicator */
  status: 'success' | 'partial';
  /** Human-readable summary message */
  message: string;
  /** Bulk operation results */
  data: {
    /** Number of successful operations */
    success_count: number;
    /** Number of failed operations */
    failure_count: number;
    /** Individual results for each item */
    results?: BulkOperationResult<T>[];
  };
  /** Optional response metadata */
  meta?: ResponseMeta;
}

/**
 * Create a standardized success response.
 *
 * @typeParam T - The type of the data payload
 * @param data - The response payload
 * @param meta - Optional response metadata
 * @returns Formatted success response
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: ResponseMeta
): SuccessResponse<T> {
  return {
    data,
    status: 'success',
    ...(meta && { meta }),
  };
}

/**
 * Create a message-only success response.
 *
 * @param message - Success message
 * @param meta - Optional response metadata
 * @returns Formatted message response
 */
export function createMessageResponse(
  message: string,
  meta?: ResponseMeta
): MessageResponse {
  return {
    status: 'success',
    message,
    ...(meta && { meta }),
  };
}

/**
 * Create a bulk operation response.
 *
 * @typeParam T - The type of individual result items
 * @param successCount - Number of successful operations
 * @param failureCount - Number of failed operations
 * @param results - Optional array of individual results
 * @param message - Optional summary message
 * @returns Formatted bulk operation response
 */
export function createBulkOperationResponse<T = unknown>(
  successCount: number,
  failureCount: number,
  results?: BulkOperationResult<T>[],
  message?: string
): BulkOperationResponse<T> {
  const status = failureCount > 0 && successCount > 0 ? 'partial' : 'success';
  const defaultMessage =
    failureCount === 0
      ? `Successfully processed ${successCount} item(s)`
      : `Processed ${successCount} item(s) successfully, ${failureCount} failed`;

  return {
    status,
    message: message ?? defaultMessage,
    data: {
      success_count: successCount,
      failure_count: failureCount,
      ...(results && { results }),
    },
  };
}

/**
 * Type guard to check if a response is a SuccessResponse
 */
export function isSuccessResponse<T>(
  response: unknown
): response is SuccessResponse<T> {
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    (response as SuccessResponse<T>).status === 'success' &&
    'data' in response
  );
}

/**
 * Type guard to check if a response is a MessageResponse
 */
export function isMessageResponse(response: unknown): response is MessageResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    (response as MessageResponse).status === 'success' &&
    'message' in response &&
    !('data' in response)
  );
}
