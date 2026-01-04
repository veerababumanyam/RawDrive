/**
 * Pagination metadata for list responses
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

/**
 * Standard paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
  request_id?: string;
}

/**
 * Standard success response wrapper
 */
export interface SuccessResponse<T> {
  data: T;
  message?: string;
}
