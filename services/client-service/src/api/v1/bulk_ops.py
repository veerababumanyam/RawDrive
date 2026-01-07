"""
Bulk operations API endpoints.

Provides REST API for bulk operations on multiple clients:
- Bulk tag add/remove
- Bulk status change
- Bulk delete
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status

from src.services.bulk_operations_service import (
    BulkOperationsService,
    get_bulk_operations_service,
)
from src.schemas.bulk_ops import (
    BulkTagRequest,
    BulkStatusChangeRequest,
    BulkDeleteRequest,
    BulkOperationResult,
)
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/api/v1/workspaces/{workspace_id}/clients/bulk",
    tags=["bulk-operations"],
)


# =============================================================================
# Dependency Injection
# =============================================================================


def get_service() -> BulkOperationsService:
    """Get BulkOperationsService instance."""
    return get_bulk_operations_service()


async def verify_workspace_access(
    workspace_id: UUID = Path(...),
    current_user: JWTPayload = Depends(get_current_user),
) -> UUID:
    """
    Verify user has access to workspace.

    Args:
        workspace_id: Workspace ID from path
        current_user: JWT payload from auth middleware

    Returns:
        UUID: Validated workspace_id

    Raises:
        HTTPException: 403 if user doesn't have access
    """
    if str(current_user.workspace_id) != str(workspace_id):
        logger.warning(
            "Workspace access denied",
            extra={
                "user_id": str(current_user.user_id),
                "requested_workspace": str(workspace_id),
                "user_workspace": str(current_user.workspace_id),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse(
                error="WORKSPACE_ACCESS_DENIED",
                message="You do not have access to this workspace",
            ).model_dump(),
        )

    return workspace_id


# =============================================================================
# Bulk Tag Operations
# =============================================================================


@router.post("/add-tags", response_model=BulkOperationResult)
async def bulk_add_tags(
    data: BulkTagRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    service: BulkOperationsService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> BulkOperationResult:
    """
    Add tags to multiple clients in bulk.

    Args:
        data: Bulk tag request with client IDs and tag IDs
        workspace_id: Workspace ID
        service: BulkOperationsService instance
        current_user: Current user from JWT

    Returns:
        BulkOperationResult: Result with success/failure counts

    Raises:
        HTTPException: 400 if validation fails
    """
    try:
        result = await service.bulk_add_tags(
            workspace_id=str(workspace_id),
            client_ids=[str(cid) for cid in data.client_ids],
            tag_ids=[str(tid) for tid in data.tag_ids],
        )

        logger.info(
            "Bulk add tags completed",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "client_count": len(data.client_ids),
                "tag_count": len(data.tag_ids),
                "success": result["success_count"],
            },
        )

        return BulkOperationResult(**result)

    except Exception as e:
        logger.error(
            "Bulk add tags failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="BULK_ADD_TAGS_FAILED",
                message="Failed to add tags in bulk",
            ).model_dump(),
        )


@router.post("/remove-tags", response_model=BulkOperationResult)
async def bulk_remove_tags(
    data: BulkTagRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    service: BulkOperationsService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> BulkOperationResult:
    """
    Remove tags from multiple clients in bulk.

    Args:
        data: Bulk tag request with client IDs and tag IDs
        workspace_id: Workspace ID
        service: BulkOperationsService instance
        current_user: Current user from JWT

    Returns:
        BulkOperationResult: Result with success/failure counts

    Raises:
        HTTPException: 400 if validation fails
    """
    try:
        result = await service.bulk_remove_tags(
            workspace_id=str(workspace_id),
            client_ids=[str(cid) for cid in data.client_ids],
            tag_ids=[str(tid) for tid in data.tag_ids],
        )

        logger.info(
            "Bulk remove tags completed",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "client_count": len(data.client_ids),
                "tag_count": len(data.tag_ids),
                "success": result["success_count"],
            },
        )

        return BulkOperationResult(**result)

    except Exception as e:
        logger.error(
            "Bulk remove tags failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="BULK_REMOVE_TAGS_FAILED",
                message="Failed to remove tags in bulk",
            ).model_dump(),
        )


# =============================================================================
# Bulk Status Change
# =============================================================================


@router.post("/change-status", response_model=BulkOperationResult)
async def bulk_change_status(
    data: BulkStatusChangeRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    service: BulkOperationsService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> BulkOperationResult:
    """
    Change status for multiple clients in bulk.

    Args:
        data: Bulk status change request with client IDs and new status
        workspace_id: Workspace ID
        service: BulkOperationsService instance
        current_user: Current user from JWT

    Returns:
        BulkOperationResult: Result with success/failure counts

    Raises:
        HTTPException: 400 if validation fails
    """
    try:
        result = await service.bulk_change_status(
            workspace_id=str(workspace_id),
            client_ids=[str(cid) for cid in data.client_ids],
            status=data.status,
        )

        logger.info(
            "Bulk status change completed",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "client_count": len(data.client_ids),
                "new_status": data.status,
                "success": result["success_count"],
            },
        )

        return BulkOperationResult(**result)

    except Exception as e:
        logger.error(
            "Bulk status change failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="BULK_STATUS_CHANGE_FAILED",
                message="Failed to change status in bulk",
            ).model_dump(),
        )


# =============================================================================
# Bulk Delete
# =============================================================================


@router.post("/delete", response_model=BulkOperationResult)
async def bulk_delete(
    data: BulkDeleteRequest,
    workspace_id: UUID = Depends(verify_workspace_access),
    service: BulkOperationsService = Depends(get_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> BulkOperationResult:
    """
    Delete multiple clients in bulk.

    CRITICAL: This operation cascades to all related data:
    - Contacts
    - Addresses
    - Tag assignments
    - Gallery links
    - Activities
    - Communications

    Requires confirmation flag to be true.

    Args:
        data: Bulk delete request with client IDs and confirmation
        workspace_id: Workspace ID
        service: BulkOperationsService instance
        current_user: Current user from JWT

    Returns:
        BulkOperationResult: Result with success/failure counts

    Raises:
        HTTPException: 400 if confirmation is false
    """
    # Require confirmation
    if not data.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="CONFIRMATION_REQUIRED",
                message="Bulk delete requires confirmation flag to be true",
            ).model_dump(),
        )

    try:
        result = await service.bulk_delete(
            workspace_id=str(workspace_id),
            client_ids=[str(cid) for cid in data.client_ids],
        )

        logger.info(
            "Bulk delete completed",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "client_count": len(data.client_ids),
                "success": result["success_count"],
            },
        )

        return BulkOperationResult(**result)

    except Exception as e:
        logger.error(
            "Bulk delete failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="BULK_DELETE_FAILED",
                message="Failed to delete clients in bulk",
            ).model_dump(),
        )
