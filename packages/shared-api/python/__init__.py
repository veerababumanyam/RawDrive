"""
@rawdrive/shared-api - Python Schemas

Standardized API response envelopes, pagination, and error handling
for RawDrive Python microservices.

Usage:
    from shared_api import (
        PaginatedResponse,
        ErrorResponse,
        SuccessResponse,
        create_paginated_response,
        create_error_response,
    )

This module provides Pydantic models that match the TypeScript types
in @rawdrive/shared-api for consistent API responses across all services.
"""

from .error import (
    ErrorDetail,
    ErrorResponse,
    ErrorCodes,
    create_error_response,
)
from .pagination import (
    PaginationMeta,
    PaginatedResponse,
    PaginationParams,
    PAGINATION_DEFAULTS,
    calculate_pagination_meta,
    create_paginated_response,
    normalize_pagination_params,
    calculate_offset,
)
from .response import (
    ResponseMeta,
    SuccessResponse,
    MessageResponse,
    BulkOperationResult,
    BulkOperationResponse,
    create_success_response,
    create_message_response,
    create_bulk_operation_response,
)

__all__ = [
    # Error types
    "ErrorDetail",
    "ErrorResponse",
    "ErrorCodes",
    "create_error_response",
    # Pagination types
    "PaginationMeta",
    "PaginatedResponse",
    "PaginationParams",
    "PAGINATION_DEFAULTS",
    "calculate_pagination_meta",
    "create_paginated_response",
    "normalize_pagination_params",
    "calculate_offset",
    # Response types
    "ResponseMeta",
    "SuccessResponse",
    "MessageResponse",
    "BulkOperationResult",
    "BulkOperationResponse",
    "create_success_response",
    "create_message_response",
    "create_bulk_operation_response",
]
