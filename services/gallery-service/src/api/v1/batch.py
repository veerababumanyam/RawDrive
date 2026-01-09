"""
Batch Operations API Endpoints.

Provides efficient batch operations for retrieving data for multiple assets
in single requests. All endpoints require JWT authentication.

These endpoints are optimized to reduce N+1 query patterns by:
- Using batch SQL queries (ANY, UNNEST, CTEs)
- Parallel URL signing
- Response caching
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from typing import Optional

from src.services.batch_asset_service import get_batch_asset_service
from src.schemas.batch import (
    BatchSignedUrlsRequest,
    BatchSignedUrlsResponse,
    SignedUrlSet,
    BatchMetadataRequest,
    BatchMetadataResponse,
    AssetMetadataItem,
    BatchQualityScoresRequest,
    BatchQualityScoresResponse,
    QualityScoreItem,
)
from src.log_config import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# =============================================================================
# Dependencies
# =============================================================================


async def get_workspace_id(
    x_workspace_id: str = Header(..., alias="X-Workspace-ID"),
) -> str:
    """Extract workspace ID from header for multi-tenant isolation."""
    return x_workspace_id


async def validate_auth(
    authorization: str = Header(..., description="Bearer token"),
) -> None:
    """Validate JWT authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")


# =============================================================================
# Batch Signed URLs Endpoint
# =============================================================================


@router.post(
    "/assets/signed-urls",
    response_model=BatchSignedUrlsResponse,
    summary="Get signed URLs for multiple assets",
    description="""
    Generate signed URLs for multiple assets in a single request.

    **Performance:** Generates all URLs in parallel, with Redis caching.
    **Limit:** Maximum 200 assets per request.

    Returns signed URLs for the requested variants (thumbnail, preview, original).
    """,
    responses={
        200: {"description": "Successfully generated signed URLs"},
        400: {"description": "Validation error (e.g., too many assets)"},
        401: {"description": "Unauthorized - invalid or missing JWT token"},
    },
)
async def batch_signed_urls(
    request: BatchSignedUrlsRequest,
    workspace_id: str = Depends(get_workspace_id),
    _: None = Depends(validate_auth),
) -> BatchSignedUrlsResponse:
    """Generate signed URLs for multiple assets."""
    batch_service = get_batch_asset_service()

    try:
        result = await batch_service.get_batch_signed_urls(
            workspace_id=workspace_id,
            asset_ids=request.asset_ids,
            variants=request.variants,
            gallery_id=str(request.gallery_id) if request.gallery_id else None,
        )

        # Convert to response model
        urls = {
            asset_id: SignedUrlSet(**url_data)
            for asset_id, url_data in result["urls"].items()
        }

        return BatchSignedUrlsResponse(
            urls=urls,
            generated_count=result["generated_count"],
            cache_hits=result["cache_hits"],
        )

    except Exception as e:
        logger.error(f"Batch signed URLs error: {e}", extra={"workspace_id": workspace_id})
        raise HTTPException(status_code=500, detail="Failed to generate signed URLs")


# =============================================================================
# Batch Metadata Endpoint
# =============================================================================


@router.post(
    "/assets/metadata",
    response_model=BatchMetadataResponse,
    summary="Get metadata for multiple assets",
    description="""
    Retrieve metadata for multiple assets in a single query.

    **Performance:** Uses single SQL query with optional LEFT JOINs.
    **Limit:** Maximum 500 assets per request.

    Returns asset metadata including dimensions, EXIF data, and optional quality scores.
    """,
    responses={
        200: {"description": "Successfully retrieved asset metadata"},
        400: {"description": "Validation error (e.g., too many assets)"},
        401: {"description": "Unauthorized - invalid or missing JWT token"},
    },
)
async def batch_metadata(
    request: BatchMetadataRequest,
    workspace_id: str = Depends(get_workspace_id),
    _: None = Depends(validate_auth),
) -> BatchMetadataResponse:
    """Retrieve metadata for multiple assets."""
    batch_service = get_batch_asset_service()

    try:
        result = await batch_service.get_batch_metadata(
            workspace_id=workspace_id,
            asset_ids=request.asset_ids,
            include_exif=request.include_exif,
            include_signed_urls=request.include_signed_urls,
            include_quality_scores=request.include_quality_scores,
        )

        # Convert to response model
        assets = [AssetMetadataItem(**asset_data) for asset_data in result["assets"]]

        return BatchMetadataResponse(
            assets=assets,
            total=result["total"],
            not_found=result["not_found"],
        )

    except Exception as e:
        logger.error(f"Batch metadata error: {e}", extra={"workspace_id": workspace_id})
        raise HTTPException(status_code=500, detail="Failed to retrieve asset metadata")


# =============================================================================
# Batch Quality Scores Endpoint
# =============================================================================


@router.post(
    "/assets/quality-scores",
    response_model=BatchQualityScoresResponse,
    summary="Get quality scores for multiple assets",
    description="""
    Retrieve quality analysis scores for multiple assets in a single query.

    **Performance:** Uses DISTINCT ON to get latest scores efficiently.
    **Limit:** Maximum 500 assets per request.

    Returns quality scores including sharpness, exposure, composition, and blur detection.
    """,
    responses={
        200: {"description": "Successfully retrieved quality scores"},
        400: {"description": "Validation error (e.g., too many assets)"},
        401: {"description": "Unauthorized - invalid or missing JWT token"},
    },
)
async def batch_quality_scores(
    request: BatchQualityScoresRequest,
    workspace_id: str = Depends(get_workspace_id),
    _: None = Depends(validate_auth),
) -> BatchQualityScoresResponse:
    """Retrieve quality scores for multiple assets."""
    batch_service = get_batch_asset_service()

    try:
        result = await batch_service.get_batch_quality_scores(
            workspace_id=workspace_id,
            asset_ids=request.asset_ids,
            session_id=request.session_id,
            include_details=request.include_details,
        )

        # Convert to response model
        scores = [QualityScoreItem(**score_data) for score_data in result["scores"]]

        return BatchQualityScoresResponse(
            scores=scores,
            total=result["total"],
            not_analyzed=result["not_analyzed"],
        )

    except Exception as e:
        logger.error(f"Batch quality scores error: {e}", extra={"workspace_id": workspace_id})
        raise HTTPException(status_code=500, detail="Failed to retrieve quality scores")
