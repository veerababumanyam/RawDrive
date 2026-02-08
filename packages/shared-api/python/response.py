"""
Standardized API Response Types

Provides consistent response wrappers across all RawDrive microservices.
"""

from typing import Any, Generic, List, Literal, Optional, TypeVar
from pydantic import BaseModel, Field


T = TypeVar("T")


class ResponseMeta(BaseModel):
    """Response metadata for non-paginated responses."""

    request_id: Optional[str] = Field(
        None, description="Request correlation ID for tracing"
    )
    timestamp: Optional[str] = Field(None, description="Response timestamp (ISO 8601)")
    version: Optional[str] = Field(None, description="API version")


class SuccessResponse(BaseModel, Generic[T]):
    """
    Standard success response wrapper for single resources.

    All non-paginated success responses SHOULD use this format.

    Example:
        {
            "data": {
                "id": "123",
                "name": "My Gallery"
            },
            "meta": {
                "request_id": "req_abc123",
                "timestamp": "2026-01-23T12:00:00Z"
            },
            "status": "success"
        }
    """

    data: Any = Field(..., description="The response payload")
    meta: Optional[ResponseMeta] = Field(None, description="Optional response metadata")
    status: Literal["success"] = Field(default="success", description="Response status indicator")


class MessageResponse(BaseModel):
    """
    Simple success response without data payload.

    Use for operations that don't return data (e.g., DELETE operations).

    Example:
        {
            "status": "success",
            "message": "Resource deleted successfully"
        }
    """

    status: Literal["success"] = Field(default="success", description="Response status indicator")
    message: str = Field(..., description="Human-readable success message")
    meta: Optional[ResponseMeta] = Field(None, description="Optional response metadata")


class BulkOperationResult(BaseModel, Generic[T]):
    """Individual result in a bulk operation."""

    id: str = Field(..., description="ID of the processed item")
    success: bool = Field(..., description="Whether this item was processed successfully")
    error: Optional[str] = Field(None, description="Error message if failed")
    data: Optional[Any] = Field(None, description="Optional result data")


class BulkOperationData(BaseModel, Generic[T]):
    """Data payload for bulk operation response."""

    success_count: int = Field(..., description="Number of successful operations")
    failure_count: int = Field(..., description="Number of failed operations")
    results: Optional[List[BulkOperationResult]] = Field(
        None, description="Individual results for each item"
    )


class BulkOperationResponse(BaseModel, Generic[T]):
    """
    Bulk operation response for batch operations.

    Example:
        {
            "status": "success",
            "message": "Bulk operation completed",
            "data": {
                "success_count": 8,
                "failure_count": 2,
                "results": [...]
            }
        }
    """

    status: Literal["success", "partial"] = Field(
        ..., description="Response status indicator"
    )
    message: str = Field(..., description="Human-readable summary message")
    data: BulkOperationData = Field(..., description="Bulk operation results")
    meta: Optional[ResponseMeta] = Field(None, description="Optional response metadata")


def create_success_response(
    data: Any,
    request_id: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> dict:
    """
    Create a standardized success response.

    Args:
        data: The response payload
        request_id: Optional request correlation ID
        timestamp: Optional response timestamp

    Returns:
        Formatted success response dict
    """
    response = {
        "data": data,
        "status": "success",
    }

    if request_id or timestamp:
        response["meta"] = {}
        if request_id:
            response["meta"]["request_id"] = request_id
        if timestamp:
            response["meta"]["timestamp"] = timestamp

    return response


def create_message_response(
    message: str,
    request_id: Optional[str] = None,
) -> dict:
    """
    Create a message-only success response.

    Args:
        message: Success message
        request_id: Optional request correlation ID

    Returns:
        Formatted message response dict
    """
    response = {
        "status": "success",
        "message": message,
    }

    if request_id:
        response["meta"] = {"request_id": request_id}

    return response


def create_bulk_operation_response(
    success_count: int,
    failure_count: int,
    results: Optional[List[dict]] = None,
    message: Optional[str] = None,
) -> dict:
    """
    Create a bulk operation response.

    Args:
        success_count: Number of successful operations
        failure_count: Number of failed operations
        results: Optional array of individual results
        message: Optional summary message

    Returns:
        Formatted bulk operation response dict
    """
    status = "partial" if failure_count > 0 and success_count > 0 else "success"
    default_message = (
        f"Successfully processed {success_count} item(s)"
        if failure_count == 0
        else f"Processed {success_count} item(s) successfully, {failure_count} failed"
    )

    response = {
        "status": status,
        "message": message or default_message,
        "data": {
            "success_count": success_count,
            "failure_count": failure_count,
        },
    }

    if results:
        response["data"]["results"] = results

    return response
