"""AI Duplicate Detection API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.duplicate_schemas import (
    DetectClientDuplicatesAIRequest,
    DetectClientDuplicatesAIResponse,
    DetectPhotoDuplicatesRequest,
    DetectPhotoDuplicatesResponse,
    DuplicateClientGroup,
    DuplicateClientMember,
    DuplicateGroupActionResponse,
    DuplicateGroupDetail,
    DuplicateGroupListItem,
    DuplicateGroupListResponse,
    DuplicatePhotoGroup,
    DuplicatePhotoMember,
)
from app.api.schemas import ErrorResponse
from app.api.exceptions import (
    ForbiddenError,
    InternalError,
    NotFoundError,
    ValidationAppError,
)
from app.services.duplicate_detection_service import get_duplicate_detection_service
from app.services.subscription_service import (
    LimitType,
    SubscriptionService,
    TierLimitExceededError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Photo Duplicate Detection
# ---------------------------------------------------------------------------


@router.post(
    "/photos/detect-duplicates",
    response_model=DetectPhotoDuplicatesResponse,
    status_code=status.HTTP_200_OK,
    summary="Detect duplicate photos using AI perceptual hashing",
    description=(
        "Detects visually similar photos using perceptual hashing (pHash) algorithm. "
        "Compares photos based on visual content, robust to resizing and compression. "
        "Cost: 10 credits per 100 photos (one-time hash computation), subsequent scans are free."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        402: {"model": ErrorResponse, "description": "Insufficient AI credits"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def detect_photo_duplicates(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: DetectPhotoDuplicatesRequest,
) -> DetectPhotoDuplicatesResponse:
    """Detect duplicate photos using AI perceptual hashing."""

    logger.info(
        "Photo duplicate detection requested",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "gallery_id": str(request.gallery_id) if request.gallery_id else None,
            "threshold": request.similarity_threshold,
        },
    )

    duplicate_service = get_duplicate_detection_service()
    subscription_service = SubscriptionService()

    try:
        # Find duplicates (service handles credit tracking internally)
        duplicate_groups = await duplicate_service.find_duplicate_photos_ai(
            workspace_id=workspace_id,
            gallery_id=request.gallery_id,
            threshold=request.similarity_threshold,
            user_id=current_user.user_id,  # For credit tracking
        )

        # Filter by minimum group size
        filtered_groups = [
            group for group in duplicate_groups
            if len(group.get("members", [])) >= request.min_group_size
        ]

        # Calculate statistics
        total_photos_scanned = sum(
            len(group.get("members", [])) for group in duplicate_groups
        )
        unique_photos = set()
        for group in duplicate_groups:
            for member in group.get("members", []):
                unique_photos.add(member.get("asset_id"))
        photos_with_duplicates = len(unique_photos)

        # Calculate credits used (10 credits per 100 photos for hash computation)
        # This is approximate - service handles actual credit deduction
        credits_per_100 = 10
        photos_needing_hash = total_photos_scanned  # Assume all need hash computation for now
        credits_used = max(1, (photos_needing_hash * credits_per_100) // 100)

        # Get remaining credits
        subscription_status = await subscription_service.get_subscription_status(workspace_id)
        credits_remaining = subscription_status.plan.ai_credits_monthly - subscription_status.ai_credits_used

        # Convert to response format
        response_groups = []
        for group in filtered_groups:
            members = [
                DuplicatePhotoMember(
                    asset_id=UUID(m.get("asset_id")),
                    file_name=m.get("file_name", ""),
                    file_size=m.get("file_size", 0),
                    perceptual_hash=m.get("perceptual_hash"),
                    similarity_to_primary=m.get("similarity_to_primary"),
                    is_primary=m.get("is_primary", False),
                    thumbnail_url=m.get("thumbnail_url"),
                )
                for m in group.get("members", [])
            ]

            response_groups.append(
                DuplicatePhotoGroup(
                    group_id=UUID(group["group_id"]) if group.get("group_id") else None,
                    members=members,
                    similarity_score=group.get("similarity_score", 0.0),
                    detection_method="perceptual_hash",
                    status=group.get("status", "pending"),
                    created_at=group.get("created_at"),
                )
            )

        return DetectPhotoDuplicatesResponse(
            duplicate_groups=response_groups,
            total_groups=len(filtered_groups),
            total_photos_scanned=total_photos_scanned,
            photos_with_duplicates=photos_with_duplicates,
            credits_used=credits_used,
            credits_remaining=credits_remaining,
        )

    except TierLimitExceededError as e:
        logger.warning(
            "Insufficient AI credits",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "limit_type": e.limit_type,
                "current": e.current,
                "maximum": e.maximum,
            },
        )
        raise ForbiddenError(
            f"Insufficient AI credits. Current: {e.current}, Maximum: {e.maximum}. "
            "Please upgrade your plan or wait for monthly reset."
        )
    except ValueError as e:
        logger.warning("Validation error", extra={"error": str(e)})
        raise ValidationAppError(str(e))
    except Exception as e:
        logger.exception("Failed to detect photo duplicates")
        raise InternalError("Failed to detect photo duplicates")


# ---------------------------------------------------------------------------
# Client Duplicate Detection (AI)
# ---------------------------------------------------------------------------


@router.post(
    "/clients/detect-duplicates-ai",
    response_model=DetectClientDuplicatesAIResponse,
    status_code=status.HTTP_200_OK,
    summary="Detect duplicate clients using AI semantic embeddings",
    description=(
        "Detects semantically similar clients using Google Gemini embeddings. "
        "Analyzes name, email, phone, and address data for similarity. "
        "Supports 3 modes: ai (Gemini only), traditional (Levenshtein), hybrid (both). "
        "Cost: 15 credits per 100 clients (one-time embedding generation), subsequent scans are free."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        402: {"model": ErrorResponse, "description": "Insufficient AI credits"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def detect_client_duplicates_ai(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: DetectClientDuplicatesAIRequest,
) -> DetectClientDuplicatesAIResponse:
    """Detect duplicate clients using AI semantic embeddings."""

    logger.info(
        "Client duplicate detection (AI) requested",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "mode": request.mode,
            "threshold": request.similarity_threshold,
        },
    )

    duplicate_service = get_duplicate_detection_service()
    subscription_service = SubscriptionService()

    try:
        # Find duplicates (service handles credit tracking internally)
        duplicate_groups = await duplicate_service.find_duplicate_clients_ai(
            workspace_id=workspace_id,
            mode=request.mode,
            threshold=request.similarity_threshold,
            user_id=current_user.user_id,  # For credit tracking
        )

        # Filter by minimum group size
        filtered_groups = [
            group for group in duplicate_groups
            if len(group.get("members", [])) >= request.min_group_size
        ]

        # Calculate statistics
        total_clients_scanned = sum(
            len(group.get("members", [])) for group in duplicate_groups
        )
        unique_clients = set()
        for group in duplicate_groups:
            for member in group.get("members", []):
                unique_clients.add(member.get("client_id"))
        clients_with_duplicates = len(unique_clients)

        # Calculate credits used (15 credits per 100 clients for embedding generation)
        # Only AI and hybrid modes use credits
        credits_used = 0
        if request.mode in ["ai", "hybrid"]:
            credits_per_100 = 15
            clients_needing_embedding = total_clients_scanned  # Approximate
            credits_used = max(1, (clients_needing_embedding * credits_per_100) // 100)

        # Get remaining credits
        subscription_status = await subscription_service.get_subscription_status(workspace_id)
        credits_remaining = subscription_status.plan.ai_credits_monthly - subscription_status.ai_credits_used

        # Determine detection method for response
        detection_method = {
            "ai": "gemini_embedding",
            "traditional": "levenshtein",
            "hybrid": "hybrid",
        }[request.mode]

        # Convert to response format
        response_groups = []
        for group in filtered_groups:
            members = [
                DuplicateClientMember(
                    client_id=UUID(m.get("client_id")),
                    full_name=m.get("full_name", ""),
                    primary_email=m.get("primary_email"),
                    primary_phone=m.get("primary_phone"),
                    similarity_to_primary=m.get("similarity_to_primary"),
                    is_primary=m.get("is_primary", False),
                    match_reason=m.get("match_reason"),
                )
                for m in group.get("members", [])
            ]

            response_groups.append(
                DuplicateClientGroup(
                    group_id=UUID(group["group_id"]) if group.get("group_id") else None,
                    members=members,
                    similarity_score=group.get("similarity_score", 0.0),
                    detection_method=detection_method,
                    status=group.get("status", "pending"),
                    created_at=group.get("created_at"),
                )
            )

        return DetectClientDuplicatesAIResponse(
            duplicate_groups=response_groups,
            total_groups=len(filtered_groups),
            total_clients_scanned=total_clients_scanned,
            clients_with_duplicates=clients_with_duplicates,
            credits_used=credits_used,
            credits_remaining=credits_remaining,
        )

    except TierLimitExceededError as e:
        logger.warning(
            "Insufficient AI credits",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "limit_type": e.limit_type,
                "current": e.current,
                "maximum": e.maximum,
            },
        )
        raise ForbiddenError(
            f"Insufficient AI credits. Current: {e.current}, Maximum: {e.maximum}. "
            "Please upgrade your plan or wait for monthly reset."
        )
    except ValueError as e:
        logger.warning("Validation error", extra={"error": str(e)})
        raise ValidationAppError(str(e))
    except Exception as e:
        logger.exception("Failed to detect client duplicates")
        raise InternalError("Failed to detect client duplicates")


# ---------------------------------------------------------------------------
# Duplicate Group Management
# ---------------------------------------------------------------------------


@router.get(
    "/duplicate-groups",
    response_model=DuplicateGroupListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get duplicate groups",
    description="Get all duplicate groups with optional filters by entity type and status.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def get_duplicate_groups(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    entity_type: Annotated[
        Optional[Literal["photo", "client"]],
        Query(description="Filter by entity type (photo or client)")
    ] = None,
    status_filter: Annotated[
        Optional[Literal["pending", "confirmed", "dismissed"]],
        Query(alias="status", description="Filter by status")
    ] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
) -> DuplicateGroupListResponse:
    """Get all duplicate groups with filters."""

    logger.info(
        "Duplicate groups list requested",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "entity_type": entity_type,
            "status": status_filter,
            "page": page,
            "limit": limit,
        },
    )

    duplicate_service = get_duplicate_detection_service()

    try:
        # Get groups from service
        result = await duplicate_service.get_duplicate_groups(
            workspace_id=workspace_id,
            entity_type=entity_type,
            status=status_filter,
        )

        # Calculate pagination
        total = len(result)
        start = (page - 1) * limit
        end = start + limit
        paginated = result[start:end]

        # Convert to response format
        groups = []
        for group in paginated:
            groups.append(
                DuplicateGroupListItem(
                    group_id=UUID(group["group_id"]),
                    workspace_id=workspace_id,
                    entity_type=group["entity_type"],
                    detection_method=group["detection_method"],
                    similarity_score=group.get("similarity_score"),
                    status=group["status"],
                    member_count=len(group.get("members", [])),
                    reviewed_by_user_id=UUID(group["reviewed_by_user_id"]) if group.get("reviewed_by_user_id") else None,
                    reviewed_at=group.get("reviewed_at"),
                    created_at=group["created_at"],
                    updated_at=group["updated_at"],
                )
            )

        return DuplicateGroupListResponse(
            groups=groups,
            total=total,
            page=page,
            limit=limit,
        )

    except Exception as e:
        logger.exception("Failed to get duplicate groups")
        raise InternalError("Failed to get duplicate groups")


@router.post(
    "/duplicate-groups/{group_id}/confirm",
    response_model=DuplicateGroupActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Confirm duplicate group",
    description="Mark a duplicate group as confirmed by the user.",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Group not found"},
    },
)
async def confirm_duplicate_group(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    group_id: Annotated[UUID, Path(..., description="Duplicate group ID")],
) -> DuplicateGroupActionResponse:
    """Confirm a duplicate group."""

    logger.info(
        "Duplicate group confirmation requested",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "group_id": str(group_id),
        },
    )

    duplicate_service = get_duplicate_detection_service()

    try:
        # Confirm the group
        await duplicate_service.confirm_duplicate_group(
            workspace_id=workspace_id,
            group_id=group_id,
            user_id=current_user.user_id,
        )

        return DuplicateGroupActionResponse(
            group_id=group_id,
            status="confirmed",
            reviewed_at=datetime.now(timezone.utc),
            message=f"Duplicate group {group_id} confirmed successfully",
        )

    except ValueError as e:
        if "not found" in str(e).lower():
            raise NotFoundError("Duplicate group", str(group_id))
        raise ValidationAppError(str(e))
    except Exception as e:
        logger.exception("Failed to confirm duplicate group")
        raise InternalError("Failed to confirm duplicate group")


@router.post(
    "/duplicate-groups/{group_id}/dismiss",
    response_model=DuplicateGroupActionResponse,
    status_code=status.HTTP_200_OK,
    summary="Dismiss duplicate group",
    description="Mark a duplicate group as dismissed (false positive).",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
        404: {"model": ErrorResponse, "description": "Group not found"},
    },
)
async def dismiss_duplicate_group(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    group_id: Annotated[UUID, Path(..., description="Duplicate group ID")],
) -> DuplicateGroupActionResponse:
    """Dismiss a duplicate group."""

    logger.info(
        "Duplicate group dismissal requested",
        extra={
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
            "group_id": str(group_id),
        },
    )

    duplicate_service = get_duplicate_detection_service()

    try:
        # Dismiss the group
        await duplicate_service.dismiss_duplicate_group(
            workspace_id=workspace_id,
            group_id=group_id,
            user_id=current_user.user_id,
        )

        return DuplicateGroupActionResponse(
            group_id=group_id,
            status="dismissed",
            reviewed_at=datetime.now(timezone.utc),
            message=f"Duplicate group {group_id} dismissed successfully",
        )

    except ValueError as e:
        if "not found" in str(e).lower():
            raise NotFoundError("Duplicate group", str(group_id))
        raise ValidationAppError(str(e))
    except Exception as e:
        logger.exception("Failed to dismiss duplicate group")
        raise InternalError("Failed to dismiss duplicate group")
