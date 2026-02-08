"""
Standardized Pagination Types

Provides consistent pagination handling across all RawDrive microservices.
Uses page-based pagination with standardized field names.
"""

from typing import Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field


T = TypeVar("T")


class PaginationMeta(BaseModel):
    """
    Pagination metadata included in all paginated responses.

    Field naming conventions:
    - page: 1-based current page number
    - limit: Items per page (also known as page_size)
    - total: Total number of items across all pages
    - total_pages: Total number of pages
    - has_next: Whether there is a next page
    - has_prev: Whether there is a previous page
    """

    page: int = Field(..., ge=1, description="Current page number (1-based)")
    limit: int = Field(..., ge=1, le=100, description="Number of items per page")
    total: int = Field(..., ge=0, description="Total number of items across all pages")
    total_pages: int = Field(..., ge=0, description="Total number of pages")
    has_next: bool = Field(..., description="Whether there is a next page")
    has_prev: bool = Field(..., description="Whether there is a previous page")

    class Config:
        json_schema_extra = {
            "example": {
                "page": 1,
                "limit": 20,
                "total": 100,
                "total_pages": 5,
                "has_next": True,
                "has_prev": False,
            }
        }


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Standard paginated response wrapper.

    All paginated endpoints MUST return data in this format.

    Example:
        {
            "data": [
                {"id": "1", "name": "Item 1"},
                {"id": "2", "name": "Item 2"}
            ],
            "meta": {
                "page": 1,
                "limit": 20,
                "total": 100,
                "total_pages": 5,
                "has_next": true,
                "has_prev": false
            }
        }
    """

    data: List[T] = Field(..., description="Array of items for the current page")
    meta: PaginationMeta = Field(..., description="Pagination metadata")

    class Config:
        json_schema_extra = {
            "example": {
                "data": [{"id": "1", "name": "Item 1"}],
                "meta": {
                    "page": 1,
                    "limit": 20,
                    "total": 100,
                    "total_pages": 5,
                    "has_next": True,
                    "has_prev": False,
                },
            }
        }


class PaginationParams(BaseModel):
    """Standard pagination query parameters."""

    page: int = Field(default=1, ge=1, description="Page number (1-based, default: 1)")
    limit: int = Field(
        default=20, ge=1, le=100, description="Items per page (default: 20, max: 100)"
    )

    @property
    def offset(self) -> int:
        """Calculate offset for database query."""
        return (self.page - 1) * self.limit


class PAGINATION_DEFAULTS:
    """Default pagination settings."""

    page: int = 1
    limit: int = 20
    min_limit: int = 1
    max_limit: int = 100


def calculate_pagination_meta(total: int, page: int, limit: int) -> PaginationMeta:
    """
    Calculate pagination metadata from query results.

    Args:
        total: Total number of items
        page: Current page number (1-based)
        limit: Items per page

    Returns:
        Pagination metadata object
    """
    total_pages = (total + limit - 1) // limit if limit > 0 else 0

    return PaginationMeta(
        page=page,
        limit=limit,
        total=total,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )


def create_paginated_response(
    data: List[T],
    total: int,
    page: int,
    limit: int,
) -> dict:
    """
    Create a paginated response from data and pagination info.

    Args:
        data: Array of items for the current page
        total: Total number of items across all pages
        page: Current page number (1-based)
        limit: Items per page

    Returns:
        Complete paginated response dict
    """
    return {
        "data": data,
        "meta": calculate_pagination_meta(total, page, limit).model_dump(),
    }


def normalize_pagination_params(
    page: Optional[int] = None,
    limit: Optional[int] = None,
) -> tuple[int, int]:
    """
    Validate and normalize pagination parameters.

    Args:
        page: Raw page parameter from request
        limit: Raw limit parameter from request

    Returns:
        Tuple of (normalized_page, normalized_limit)
    """
    normalized_page = max(page if page is not None else PAGINATION_DEFAULTS.page, 1)
    normalized_limit = min(
        max(
            limit if limit is not None else PAGINATION_DEFAULTS.limit,
            PAGINATION_DEFAULTS.min_limit,
        ),
        PAGINATION_DEFAULTS.max_limit,
    )
    return normalized_page, normalized_limit


def calculate_offset(page: int, limit: int) -> int:
    """
    Calculate SQL offset from pagination parameters.

    Args:
        page: Current page number (1-based)
        limit: Items per page

    Returns:
        Offset value for SQL OFFSET clause
    """
    return (page - 1) * limit
