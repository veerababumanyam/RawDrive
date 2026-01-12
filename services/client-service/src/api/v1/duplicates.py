"""
Duplicate Detection & Merging API endpoints.

Provides REST API for:
- Detect duplicate clients with fuzzy matching
- Review duplicate groups by confidence level
- Merge duplicate clients with audit trail
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Body, status

from src.services.duplicate_service import (
    DuplicateService,
    get_duplicate_service,
)
from src.schemas.duplicate import (
    DuplicateDetectionRequest,
    DuplicateDetectionResponse,
    DuplicateGroup,
    MergeStrategy,
    MergeResult,
)
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/clients",
    tags=["duplicates"],
)


# =============================================================================
# Duplicate Detection Endpoints
# =============================================================================


@router.post("/duplicates/detect", response_model=DuplicateDetectionResponse)
async def detect_duplicates(
    request: DuplicateDetectionRequest = Body(...),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: DuplicateService = Depends(get_duplicate_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> DuplicateDetectionResponse:
    """
    Detect duplicate clients using fuzzy matching.

    Algorithm:
    - Email exact match (score 1.0)
    - Email domain match (score 0.8)
    - Name fuzzy match using Levenshtein distance (score 0.6-0.95)
    - Phone exact match (score 0.95)
    - Weighted average for final similarity score

    Confidence Levels:
    - High: avg similarity >= 0.9 (likely duplicates)
    - Medium: avg similarity >= 0.75 (possible duplicates)
    - Low: avg similarity >= threshold (review needed)

    Args:
        request: Detection request with threshold and filters
        workspace_id: Workspace ID
        service: DuplicateService instance
        current_user: Current user from JWT

    Returns:
        DuplicateDetectionResponse: Groups of duplicate candidates with confidence scores

    Raises:
        HTTPException: 400 if invalid parameters
        HTTPException: 404 if client not found
    """
    try:
        duplicate_groups = await service.detect_duplicates(
            workspace_id=str(workspace_id),
            client_id=str(request.client_id) if request.client_id else None,
            threshold=request.threshold,
            include_merged=request.include_merged,
        )

        # Count by confidence
        high_count = sum(1 for g in duplicate_groups if g["confidence"] == "high")
        medium_count = sum(1 for g in duplicate_groups if g["confidence"] == "medium")
        low_count = sum(1 for g in duplicate_groups if g["confidence"] == "low")

        # Total duplicates (unique)
        seen_clients = set()
        for group in duplicate_groups:
            for dup in group["duplicates"]:
                seen_clients.add(str(dup["client_id"]))
        total_duplicates = len(seen_clients)

        logger.info(
            "Duplicate detection completed",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "groups_found": len(duplicate_groups),
                "total_duplicates": total_duplicates,
            },
        )

        return DuplicateDetectionResponse(
            duplicate_groups=[DuplicateGroup(**g) for g in duplicate_groups],
            total_duplicates=total_duplicates,
            high_confidence_count=high_count,
            medium_confidence_count=medium_count,
            low_confidence_count=low_count,
        )

    except Exception as e:
        logger.error(
            "Duplicate detection failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="DETECTION_FAILED",
                message="Failed to detect duplicates",
            ).model_dump(),
        )


# =============================================================================
# Merge Endpoints
# =============================================================================


@router.post("/duplicates/merge", response_model=MergeResult)
async def merge_clients(
    strategy: MergeStrategy = Body(...),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: DuplicateService = Depends(get_duplicate_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> MergeResult:
    """
    Merge duplicate clients into a primary client.

    Merge Process:
    1. Contacts: Transfer without duplicates (email/phone dedup)
    2. Addresses: Transfer as non-primary addresses
    3. Tags: Merge tag assignments (ON CONFLICT DO NOTHING)
    4. Gallery Links: Transfer links (avoid duplicate gallery-client pairs)
    5. Activities: Migrate all activities to primary client
    6. Communications: Migrate all communications to primary client
    7. Analytics Events: Update client_id references
    8. Delete or mark merged clients (based on delete_after_merge)

    Audit Trail:
    - Creates audit record with detailed merge information
    - Tracks who performed the merge and when
    - Records counts of merged entities
    - Enables potential undo functionality

    Args:
        strategy: Merge strategy with primary and merge clients
        workspace_id: Workspace ID
        service: DuplicateService instance
        current_user: Current user from JWT

    Returns:
        MergeResult: Merge summary with counts and audit trail ID

    Raises:
        HTTPException: 400 if invalid merge strategy
        HTTPException: 404 if clients not found
        HTTPException: 409 if trying to merge into self
    """
    # Validate merge strategy
    if not strategy.merge_client_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="INVALID_MERGE_STRATEGY",
                message="At least one client must be specified for merging",
            ).model_dump(),
        )

    # Prevent merging client into itself
    keep_id_str = str(strategy.keep_client_id)
    if keep_id_str in [str(cid) for cid in strategy.merge_client_ids]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=ErrorResponse(
                error="SELF_MERGE_NOT_ALLOWED",
                message="Cannot merge a client into itself",
            ).model_dump(),
        )

    try:
        result = await service.merge_clients(
            workspace_id=str(workspace_id),
            keep_client_id=str(strategy.keep_client_id),
            merge_client_ids=[str(cid) for cid in strategy.merge_client_ids],
            performed_by=str(current_user.user_id),
            delete_after_merge=strategy.delete_after_merge,
        )

        logger.info(
            "Clients merged successfully",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "keep_client_id": str(strategy.keep_client_id),
                "merged_count": len(strategy.merge_client_ids),
                "audit_trail_id": str(result["audit_trail_id"]),
            },
        )

        return MergeResult(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Merge failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="MERGE_FAILED",
                message="Failed to merge clients",
            ).model_dump(),
        )
