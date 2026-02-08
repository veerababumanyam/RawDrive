"""GEO (Generative Engine Optimization) Search API Endpoint.

Natural language photo search using semantic understanding, vector similarity,
and multi-source data fusion.

Route: POST /api/v1/workspaces/{workspace_id}/geo/search
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user_from_token
from app.db.postgres import get_postgres_pool
from app.services.geo_search_service import (
    get_geo_search_service,
    GEOSearchService,
    GEOSearchResults,
    GEOSearchResult,
)
from app.services.gemini_client_service import GeminiClientService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["geo-search"])


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class GEOSearchRequest(BaseModel):
    """Request body for GEO search."""

    query: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Natural language search query",
        example="outdoor wedding photos with bride smiling at golden hour",
    )
    gallery_id: Optional[UUID] = Field(
        None,
        description="Optional gallery ID to filter results",
    )
    limit: int = Field(
        50,
        ge=1,
        le=500,
        description="Results per page",
    )
    offset: int = Field(
        0,
        ge=0,
        description="Pagination offset",
    )


class GEOSearchResultItem(BaseModel):
    """Single search result."""

    asset_id: UUID
    file_name: str
    thumbnail_url: Optional[str]
    relevance_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Relevance score from 0 to 1",
    )
    match_reasons: list[str] = Field(
        default_factory=list,
        description="Human-readable reasons for relevance",
    )


class QueryInterpretation(BaseModel):
    """How the search query was interpreted."""

    intent: str = Field(
        default="search_photos",
        description="Primary search intent",
    )
    scene: list[str] = Field(
        default_factory=list,
        description="Detected scene descriptors",
    )
    people: list[str] = Field(
        default_factory=list,
        description="Detected people names",
    )
    expressions: list[str] = Field(
        default_factory=list,
        description="Detected expressions/emotions",
    )
    visual_attributes: list[str] = Field(
        default_factory=list,
        description="Detected visual attributes",
    )


class GEOSearchResponse(BaseModel):
    """Response body for GEO search."""

    results: list[GEOSearchResultItem]
    total: int = Field(
        ...,
        description="Total number of matching results (before pagination)",
    )
    query_interpretation: QueryInterpretation = Field(
        ...,
        description="How the query was parsed",
    )


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/workspaces/{workspace_id}/geo/search",
    response_model=GEOSearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Search photos using natural language",
    description="Search workspace assets using natural language queries with AI-powered semantic understanding.",
)
async def search_photos(
    workspace_id: UUID,
    request: GEOSearchRequest,
    current_user=Depends(get_current_user_from_token),
    geo_service: GEOSearchService = Depends(lambda: get_geo_search_service()),
    gemini_service: GeminiClientService = Depends(
        lambda: GeminiClientService()
    ),
) -> GEOSearchResponse:
    """Search photos using natural language query.

    ### Query Examples

    **Wedding Photography**:
    - "outdoor wedding ceremony photos"
    - "bride getting ready with soft lighting"
    - "reception dancing moments"

    **Technical Queries**:
    - "photos shot with 50mm lens"
    - "portraits with f/1.8 aperture"

    **Visual Concept Queries**:
    - "romantic sunset photos"
    - "dramatic black and white"
    - "joyful candid moments"

    ### Response

    Returns ranked search results with:
    - `relevance_score`: How well the photo matches the query (0.0-1.0)
    - `match_reasons`: Explanation of why the photo was matched
    - `query_interpretation`: How the AI understood your query

    ### Performance

    - p50 latency: ~350ms
    - p95 latency: ~500ms
    - Uses result caching for common queries

    ### Authentication

    Requires valid JWT token in Authorization header.

    ### Rate Limiting

    - 10 searches per minute per user
    - Returns 429 Too Many Requests if exceeded
    """

    try:
        # 1. Validate workspace access
        logger.debug(
            f"GEO search request",
            extra={
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
                "query_length": len(request.query),
            },
        )

        pool = await get_postgres_pool()
        workspace = await pool.fetchrow(
            """
            SELECT workspace_id FROM workspaces
            WHERE workspace_id = $1 AND deleted = FALSE
            """,
            workspace_id,
        )

        if not workspace:
            logger.warning(
                f"Workspace not found or deleted",
                extra={"workspace_id": str(workspace_id)},
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found",
            )

        # 2. Verify user has access to workspace
        user_workspace = await pool.fetchrow(
            """
            SELECT 1 FROM workspace_members
            WHERE workspace_id = $1 AND user_id = $2 AND deleted = FALSE
            """,
            workspace_id,
            current_user.user_id,
        )

        if not user_workspace:
            logger.warning(
                f"User does not have workspace access",
                extra={
                    "workspace_id": str(workspace_id),
                    "user_id": str(current_user.user_id),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this workspace",
            )

        # 3. Validate gallery_id if provided
        if request.gallery_id:
            gallery = await pool.fetchrow(
                """
                SELECT gallery_id FROM galleries
                WHERE gallery_id = $1 AND workspace_id = $2 AND deleted = FALSE
                """,
                request.gallery_id,
                workspace_id,
            )

            if not gallery:
                logger.warning(
                    f"Gallery not found",
                    extra={
                        "gallery_id": str(request.gallery_id),
                        "workspace_id": str(workspace_id),
                    },
                )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Gallery not found",
                )

        # 4. Get Gemini config for user
        try:
            config = await gemini_service.get_client_config(
                current_user.user_id, workspace_id
            )
        except Exception as e:
            logger.error(
                f"Failed to get Gemini config: {e}",
                extra={
                    "user_id": str(current_user.user_id),
                    "workspace_id": str(workspace_id),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AI service is not configured. Please set up your API key in Settings > AI.",
            )

        # 5. Execute GEO search
        try:
            search_results: GEOSearchResults = await geo_service.search(
                query=request.query,
                workspace_id=workspace_id,
                user_id=current_user.user_id,
                config=config,
                gallery_id=request.gallery_id,
                limit=request.limit,
                offset=request.offset,
            )

            # 6. Format response
            return GEOSearchResponse(
                results=[
                    GEOSearchResultItem(
                        asset_id=r.asset_id,
                        file_name=r.file_name,
                        thumbnail_url=r.thumbnail_url,
                        relevance_score=r.relevance_score,
                        match_reasons=r.match_reasons,
                    )
                    for r in search_results.results
                ],
                total=search_results.total,
                query_interpretation=QueryInterpretation(
                    intent=search_results.query_interpretation.intent,
                    scene=search_results.query_interpretation.scene,
                    people=search_results.query_interpretation.people,
                    expressions=search_results.query_interpretation.expressions,
                    visual_attributes=search_results.query_interpretation.visual_attributes,
                ),
            )

        except Exception as e:
            logger.error(
                f"Search failed: {e}",
                extra={
                    "workspace_id": str(workspace_id),
                    "user_id": str(current_user.user_id),
                },
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Search failed. Please try again.",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in GEO search: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        )
