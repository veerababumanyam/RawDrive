/**
 * Standardized Pagination Types
 *
 * Provides consistent pagination handling across all RawDrive microservices.
 * Uses page-based pagination with standardized field names.
 *
 * @module @rawdrive/shared-api/pagination
 */

/**
 * Pagination metadata included in all paginated responses.
 *
 * Field naming conventions:
 * - `page`: 1-based current page number
 * - `limit`: Items per page (also known as page_size)
 * - `total`: Total number of items across all pages
 * - `total_pages`: Total number of pages
 * - `has_next`: Whether there is a next page
 * - `has_prev`: Whether there is a previous page
 */
export interface PaginationMeta {
  /** Current page number (1-based) */
  page: number;
  /** Number of items per page */
  limit: number;
  /** Total number of items across all pages */
  total: number;
  /** Total number of pages */
  total_pages: number;
  /** Whether there is a next page */
  has_next: boolean;
  /** Whether there is a previous page */
  has_prev: boolean;
}

/**
 * Standard paginated response wrapper.
 *
 * All paginated endpoints MUST return data in this format.
 *
 * @typeParam T - The type of items in the data array
 *
 * @example
 * ```json
 * {
 *   "data": [
 *     { "id": "1", "name": "Item 1" },
 *     { "id": "2", "name": "Item 2" }
 *   ],
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
 */
export interface PaginatedResponse<T> {
  /** Array of items for the current page */
  data: T[];
  /** Pagination metadata */
  meta: PaginationMeta;
}

/**
 * Standard pagination query parameters.
 *
 * Used for validating incoming pagination requests.
 */
export interface PaginationParams {
  /** Page number (1-based, default: 1) */
  page?: number;
  /** Items per page (default: 20, max: 100) */
  limit?: number;
}

/**
 * Default pagination settings.
 */
export const PAGINATION_DEFAULTS = {
  /** Default page number */
  page: 1,
  /** Default items per page */
  limit: 20,
  /** Minimum items per page */
  min_limit: 1,
  /** Maximum items per page */
  max_limit: 100,
} as const;

/**
 * Calculate pagination metadata from query results.
 *
 * @param total - Total number of items
 * @param page - Current page number (1-based)
 * @param limit - Items per page
 * @returns Pagination metadata object
 */
export function calculatePaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const total_pages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    page,
    limit,
    total,
    total_pages,
    has_next: page < total_pages,
    has_prev: page > 1,
  };
}

/**
 * Create a paginated response from data and pagination info.
 *
 * @typeParam T - The type of items in the data array
 * @param data - Array of items for the current page
 * @param total - Total number of items across all pages
 * @param page - Current page number (1-based)
 * @param limit - Items per page
 * @returns Complete paginated response object
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResponse<T> {
  return {
    data,
    meta: calculatePaginationMeta(total, page, limit),
  };
}

/**
 * Validate and normalize pagination parameters.
 *
 * @param params - Raw pagination parameters from request
 * @returns Normalized pagination parameters with defaults applied
 */
export function normalizePaginationParams(
  params: PaginationParams
): Required<PaginationParams> {
  const page = Math.max(params.page ?? PAGINATION_DEFAULTS.page, 1);
  const limit = Math.min(
    Math.max(params.limit ?? PAGINATION_DEFAULTS.limit, PAGINATION_DEFAULTS.min_limit),
    PAGINATION_DEFAULTS.max_limit
  );

  return { page, limit };
}

/**
 * Calculate SQL offset from pagination parameters.
 *
 * @param page - Current page number (1-based)
 * @param limit - Items per page
 * @returns Offset value for SQL OFFSET clause
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}
