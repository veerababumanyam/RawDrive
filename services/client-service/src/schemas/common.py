"""Common schemas used across all endpoints."""

from typing import Optional, List
from pydantic import BaseModel, Field


class PaginationMeta(BaseModel):
    """Pagination metadata for list responses."""

    total: int = Field(..., description="Total number of items")
    page: int = Field(..., description="Current page number")
    limit: int = Field(..., description="Items per page")
    total_pages: int = Field(..., description="Total number of pages")


class ErrorDetail(BaseModel):
    """Detailed error information for a specific field."""

    field: str = Field(..., description="Field name that caused the error")
    message: str = Field(..., description="Error message for this field")


class ErrorResponse(BaseModel):
    """Standard error response format."""

    error: str = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[List[ErrorDetail]] = Field(None, description="Detailed field errors")


class SuccessResponse(BaseModel):
    """Standard success response for operations without data."""

    success: bool = Field(True, description="Operation success status")
    message: str = Field(..., description="Success message")
