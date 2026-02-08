/**
 * @rawdrive/shared-api
 *
 * Standardized API response envelopes, pagination, and error handling
 * for RawDrive microservices.
 *
 * ## Usage
 *
 * ### TypeScript/Frontend
 * ```typescript
 * import {
 *   PaginatedResponse,
 *   ErrorResponse,
 *   SuccessResponse,
 *   createPaginatedResponse,
 *   createErrorResponse,
 * } from '@rawdrive/shared-api';
 * ```
 *
 * ### Standard Response Formats
 *
 * #### Paginated List Response
 * ```json
 * {
 *   "data": [...],
 *   "meta": {
 *     "page": 1,
 *     "limit": 20,
 *     "total": 100,
 *     "total_pages": 5,
 *     "has_next": true,
 *     "has_prev": false
 *   }
 * }
 * ```
 *
 * #### Success Response
 * ```json
 * {
 *   "data": { ... },
 *   "meta": { "request_id": "..." },
 *   "status": "success"
 * }
 * ```
 *
 * #### Error Response
 * ```json
 * {
 *   "status": 400,
 *   "code": "VALIDATION_ERROR",
 *   "message": "Request validation failed",
 *   "details": [{ "field": "email", "message": "Invalid format" }],
 *   "request_id": "..."
 * }
 * ```
 *
 * @module @rawdrive/shared-api
 */

// Error types and utilities
export {
  ErrorResponse,
  ErrorDetail,
  ErrorCode,
  ErrorCodes,
  isErrorResponse,
  createErrorResponse,
} from './error';

// Pagination types and utilities
export {
  PaginationMeta,
  PaginatedResponse,
  PaginationParams,
  PAGINATION_DEFAULTS,
  calculatePaginationMeta,
  createPaginatedResponse,
  normalizePaginationParams,
  calculateOffset,
} from './pagination';

// Response types and utilities
export {
  ResponseMeta,
  SuccessResponse,
  MessageResponse,
  BulkOperationResult,
  BulkOperationResponse,
  createSuccessResponse,
  createMessageResponse,
  createBulkOperationResponse,
  isSuccessResponse,
  isMessageResponse,
} from './response';

// API Response type union for handling all response types
import type { ErrorResponse } from './error';
import type { PaginatedResponse } from './pagination';
import type { SuccessResponse, MessageResponse, BulkOperationResponse } from './response';

/**
 * Union type representing all possible API response types.
 *
 * @typeParam T - The type of the data payload
 */
export type ApiResponse<T> =
  | SuccessResponse<T>
  | PaginatedResponse<T>
  | MessageResponse
  | BulkOperationResponse<T>
  | ErrorResponse;
