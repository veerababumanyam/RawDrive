"""
Visitor Conversion API endpoints.

Provides REST API for:
- Convert visitor to client with history migration
- Auto-match visitors to existing clients
- Bulk visitor conversion
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Body, status

from src.services.visitor_conversion_service import (
    VisitorConversionService,
    get_visitor_conversion_service,
)
from src.schemas.visitor import (
    VisitorConversionRequest,
    VisitorConversionResult,
    AutoMatchRequest,
    AutoMatchResult,
    BulkConversionRequest,
    BulkConversionResult,
)
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}",
    tags=["visitor-conversion"],
)


# =============================================================================
# Conversion Endpoints
# =============================================================================


@router.post("/visitors/convert", response_model=VisitorConversionResult)
async def convert_visitor_to_client(
    request: VisitorConversionRequest = Body(...),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: VisitorConversionService = Depends(get_visitor_conversion_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> VisitorConversionResult:
    """
    Convert visitor to client with full history migration.

    Conversion Process:
    1. Fetch visitor data (name, email, phone, gallery access history)
    2. Duplicate detection (exact email match, fuzzy name match)
    3. Create new client OR use existing (if merge_if_duplicate=true)
    4. Migrate contacts (email, phone)
    5. Link all accessed galleries (with role='visitor')
    6. Migrate analytics events (update client_id in analytics_events table)
    7. Mark visitor as converted (converted_to_client_id field)
    8. Record conversion activity in client timeline

    Duplicate Handling:
    - If duplicate found and merge_if_duplicate=false: Return existing client ID without conversion
    - If duplicate found and merge_if_duplicate=true: Use existing client and migrate data
    - If skip_duplicate_check=true: Always create new client (not recommended)

    Args:
        request: Conversion request with visitor ID and options
        workspace_id: Workspace ID
        service: VisitorConversionService instance
        current_user: Current user from JWT

    Returns:
        VisitorConversionResult: Conversion summary with client ID and counts

    Raises:
        HTTPException: 404 if visitor not found
        HTTPException: 400 if visitor already converted
        HTTPException: 409 if duplicate found and merge not allowed
    """
    try:
        result = await service.convert_visitor_to_client(
            workspace_id=str(workspace_id),
            visitor_id=str(request.visitor_id),
            skip_duplicate_check=request.skip_duplicate_check,
            merge_if_duplicate=request.merge_if_duplicate,
        )

        logger.info(
            "Visitor converted successfully",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "visitor_id": str(request.visitor_id),
                "client_id": str(result["client_id"]),
                "is_new_client": result["is_new_client"],
            },
        )

        return VisitorConversionResult(**result)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="VISITOR_NOT_FOUND",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        logger.error(
            "Visitor conversion failed",
            extra={
                "workspace_id": str(workspace_id),
                "visitor_id": str(request.visitor_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="CONVERSION_FAILED",
                message="Failed to convert visitor to client",
            ).model_dump(),
        )


@router.post("/visitors/auto-match", response_model=AutoMatchResult)
async def auto_match_visitor(
    request: AutoMatchRequest = Body(...),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: VisitorConversionService = Depends(get_visitor_conversion_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> AutoMatchResult:
    """
    Auto-match visitor to existing client using fuzzy logic.

    Matching Algorithm:
    - Email exact match (confidence 1.0) - Highest priority
    - Email domain match (confidence 0.8) - Same domain different local part
    - Name fuzzy match using Levenshtein distance (confidence 0.6-0.95)
    - Phone exact match (confidence 0.95) - Normalized phone comparison

    Use Cases:
    - Pre-conversion check to see if visitor already exists as client
    - Auto-linking during gallery registration (before visitor record created)
    - Duplicate prevention in visitor creation workflow

    Args:
        request: Match request with email, name, phone, threshold
        workspace_id: Workspace ID
        service: VisitorConversionService instance
        current_user: Current user from JWT

    Returns:
        AutoMatchResult: Match status with client ID and confidence

    Raises:
        HTTPException: 400 if invalid parameters
    """
    try:
        client_id, confidence, match_reasons = await service.auto_match_visitor(
            workspace_id=str(workspace_id),
            email=request.email,
            name=request.name,
            phone=request.phone,
            threshold=request.threshold,
        )

        matched = client_id is not None

        logger.info(
            "Auto-match completed",
            extra={
                "workspace_id": str(workspace_id),
                "matched": matched,
                "confidence": confidence,
            },
        )

        return AutoMatchResult(
            matched=matched,
            client_id=UUID(client_id) if client_id else None,
            confidence=confidence,
            match_reasons=match_reasons,
        )

    except Exception as e:
        logger.error(
            "Auto-match failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="AUTO_MATCH_FAILED",
                message="Failed to perform auto-match",
            ).model_dump(),
        )


@router.post("/visitors/bulk-convert", response_model=BulkConversionResult)
async def bulk_convert_visitors(
    request: BulkConversionRequest = Body(...),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: VisitorConversionService = Depends(get_visitor_conversion_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> BulkConversionResult:
    """
    Convert multiple visitors to clients in bulk.

    Process:
    - Iterates through visitor_ids list
    - Converts each visitor using same logic as single conversion
    - Continues on errors (doesn't fail entire batch)
    - Returns detailed results with success/error breakdown

    Performance:
    - Processes sequentially (not parallelized) to avoid database contention
    - Recommended batch size: 100 visitors
    - For larger batches, use background job or queue

    Args:
        request: Bulk conversion request with visitor IDs and options
        workspace_id: Workspace ID
        service: VisitorConversionService instance
        current_user: Current user from JWT

    Returns:
        BulkConversionResult: Conversion summary with per-visitor results

    Raises:
        HTTPException: 400 if invalid parameters
    """
    if not request.visitor_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="EMPTY_VISITOR_LIST",
                message="At least one visitor ID must be provided",
            ).model_dump(),
        )

    try:
        result = await service.bulk_convert_visitors(
            workspace_id=str(workspace_id),
            visitor_ids=[str(vid) for vid in request.visitor_ids],
            skip_duplicate_check=request.skip_duplicate_check,
            merge_if_duplicate=request.merge_if_duplicate,
        )

        logger.info(
            "Bulk conversion completed",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "total_visitors": result["total_visitors"],
                "converted": result["converted_count"],
                "duplicates": result["duplicate_count"],
                "errors": result["error_count"],
            },
        )

        return BulkConversionResult(**result)

    except Exception as e:
        logger.error(
            "Bulk conversion failed",
            extra={
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="BULK_CONVERSION_FAILED",
                message="Failed to perform bulk conversion",
            ).model_dump(),
        )
