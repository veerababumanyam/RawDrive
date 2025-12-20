"""Search API endpoints.

All routes prefixed with /api/v1/workspaces/{workspace_id}/search.
"""

from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUserDep, WorkspaceAccessDep
from app.api.schemas import ErrorResponse
from app.api.exceptions import InternalError
from app.services.search_service import get_search_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request/Response Schemas
# ---------------------------------------------------------------------------


class SearchRequest(BaseModel):
    """Search request body."""

    query: str = Field(..., min_length=1, max_length=200, description="Search query")
    entity_types: Optional[list[str]] = Field(
        None,
        description="Entity types to search (galleries, assets, tags, people, comments)",
    )
    gallery_id: Optional[UUID] = Field(None, description="Scope search to a specific gallery")


class GallerySearchResult(BaseModel):
    """Gallery search result."""

    gallery_id: str
    title: str
    description: Optional[str] = None
    client_name: Optional[str] = None
    status: str
    created_at: str
    match_type: str = "gallery"


class AssetSearchResult(BaseModel):
    """Asset search result."""

    asset_id: str
    file_name: str
    mime_type: str
    size_bytes: int
    gallery_id: Optional[str] = None
    created_at: str
    match_type: str


class TagSearchResult(BaseModel):
    """Tag search result."""

    tag_id: str
    name: str
    type: str
    color: Optional[str] = None
    usage_count: int = 0
    match_type: str = "tag"


class PersonSearchResult(BaseModel):
    """Person search result."""

    person_id: str
    display_name: Optional[str] = None
    status: str
    face_count: int = 0
    cover_asset_id: Optional[str] = None
    match_type: str = "person"


class CommentSearchResult(BaseModel):
    """Comment search result."""

    comment_id: str
    gallery_id: str
    asset_id: Optional[str] = None
    body: str
    author_name: str
    created_at: str
    match_type: str = "comment"


class SearchResults(BaseModel):
    """Search results grouped by type."""

    galleries: Optional[list[GallerySearchResult]] = None
    assets: Optional[list[AssetSearchResult]] = None
    tags: Optional[list[TagSearchResult]] = None
    people: Optional[list[PersonSearchResult]] = None
    comments: Optional[list[CommentSearchResult]] = None


class SearchResponse(BaseModel):
    """Unified search response."""

    query: str
    results: SearchResults
    total: int


class AssetListMeta(BaseModel):
    page: int
    limit: int
    total: int
    totalPages: int


class AssetResult(BaseModel):
    """Asset result."""

    asset_id: str
    file_name: str
    mime_type: str
    size_bytes: int
    gallery_id: Optional[str] = None
    created_at: str


class AssetListResponse(BaseModel):
    """Asset list response."""

    data: list[AssetResult]
    meta: AssetListMeta


# ---------------------------------------------------------------------------
# Search Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Unified search",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def search(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    request: SearchRequest,
) -> SearchResponse:
    """
    Unified search across galleries, assets, tags, people, and comments.
    
    Results are grouped by entity type and limited to top matches.
    """
    service = get_search_service()
    try:
        result = await service.search(
            workspace_id=workspace_id,
            query=request.query,
            entity_types=request.entity_types,
            gallery_id=request.gallery_id,
        )
        return SearchResponse(
            query=result["query"],
            results=SearchResults(**result["results"]),
            total=result["total"],
        )
    except Exception as e:
        logger.exception("Failed to search")
        raise InternalError("Failed to search")


@router.get(
    "",
    response_model=SearchResponse,
    status_code=status.HTTP_200_OK,
    summary="Quick search",
    responses={
        400: {"model": ErrorResponse, "description": "Validation error"},
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def quick_search(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    q: Annotated[str, Query(min_length=1, max_length=200, description="Search query")],
    types: Annotated[Optional[str], Query(description="Comma-separated entity types")] = None,
    gallery_id: Annotated[Optional[UUID], Query(description="Scope to gallery")] = None,
) -> SearchResponse:
    """
    Quick search via GET request with query parameters.
    
    Useful for search-as-you-type functionality.
    """
    service = get_search_service()
    try:
        entity_types = types.split(",") if types else None
        result = await service.search(
            workspace_id=workspace_id,
            query=q,
            entity_types=entity_types,
            gallery_id=gallery_id,
        )
        return SearchResponse(
            query=result["query"],
            results=SearchResults(**result["results"]),
            total=result["total"],
        )
    except Exception as e:
        logger.exception("Failed to quick search")
        raise InternalError("Failed to search")


@router.get(
    "/by-tag/{tag_id}",
    response_model=AssetListResponse,
    status_code=status.HTTP_200_OK,
    summary="Search assets by tag",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def search_assets_by_tag(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    tag_id: Annotated[UUID, Path(..., description="Tag ID")],
    gallery_id: Annotated[Optional[UUID], Query(description="Scope to gallery")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> AssetListResponse:
    """Get all assets with a specific tag."""
    service = get_search_service()
    try:
        result = await service.search_assets_by_tag(
            workspace_id=workspace_id,
            tag_id=tag_id,
            gallery_id=gallery_id,
            page=page,
            limit=limit,
        )
        return AssetListResponse(**result)
    except Exception as e:
        logger.exception("Failed to search assets by tag")
        raise InternalError("Failed to search assets by tag")


@router.get(
    "/by-person/{person_id}",
    response_model=AssetListResponse,
    status_code=status.HTTP_200_OK,
    summary="Search assets by person",
    responses={
        403: {"model": ErrorResponse, "description": "Access denied"},
    },
)
async def search_assets_by_person(
    workspace_id: Annotated[UUID, Path(..., description="Workspace ID")],
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    person_id: Annotated[UUID, Path(..., description="Person ID")],
    gallery_id: Annotated[Optional[UUID], Query(description="Scope to gallery")] = None,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    limit: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 50,
) -> AssetListResponse:
    """Get all assets containing a specific person."""
    service = get_search_service()
    try:
        result = await service.search_assets_by_person(
            workspace_id=workspace_id,
            person_id=person_id,
            gallery_id=gallery_id,
            page=page,
            limit=limit,
        )
        return AssetListResponse(**result)
    except Exception as e:
        logger.exception("Failed to search assets by person")
        raise InternalError("Failed to search assets by person")
