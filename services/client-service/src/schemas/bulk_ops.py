"""
Pydantic schemas for bulk operations.

Supports bulk operations on multiple clients:
- Bulk tag add/remove
- Bulk status change
- Bulk delete
"""

from typing import List
from uuid import UUID
from pydantic import BaseModel, Field


class BulkTagRequest(BaseModel):
    """Request to add or remove tags in bulk."""

    client_ids: List[UUID] = Field(..., min_length=1, description="List of client IDs")
    tag_ids: List[UUID] = Field(..., min_length=1, description="List of tag IDs")


class BulkStatusChangeRequest(BaseModel):
    """Request to change status for multiple clients."""

    client_ids: List[UUID] = Field(..., min_length=1, description="List of client IDs")
    status: str = Field(..., pattern="^(active|inactive)$", description="New status")


class BulkDeleteRequest(BaseModel):
    """Request to delete multiple clients."""

    client_ids: List[UUID] = Field(..., min_length=1, description="List of client IDs")
    confirm: bool = Field(
        ..., description="Confirmation flag (must be true to proceed)"
    )


class BulkOperationResult(BaseModel):
    """Result of a bulk operation."""

    total_requested: int = Field(..., description="Total clients requested")
    success_count: int = Field(..., description="Successfully processed clients")
    failed_count: int = Field(..., description="Failed clients")
    failed_ids: List[UUID] = Field(
        default_factory=list, description="IDs of clients that failed"
    )
    message: str = Field(..., description="Summary message")
