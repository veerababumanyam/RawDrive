"""
Common Pydantic schemas.
"""

from typing import TypeVar, Generic, List, Optional, Any
from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response wrapper matching frontend expectations."""

    items: List[T] = Field(..., description="List of items for the current page")
    total: int = Field(..., ge=0, description="Total number of items")
    page: int = Field(..., ge=1, description="Current page number")
    page_size: int = Field(..., ge=1, description="Number of items per page")
    total_pages: int = Field(..., ge=0, description="Total number of pages")
    has_next: bool = Field(..., description="Whether there is a next page")
    has_prev: bool = Field(..., description="Whether there is a previous page")


class ErrorDetail(BaseModel):
    """Error detail."""

    field: Optional[str] = None
    message: str


class ErrorResponse(BaseModel):
    """Error response."""

    code: str
    message: str
    details: Optional[List[ErrorDetail]] = None
    request_id: Optional[str] = None
