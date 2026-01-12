"""
Gallery link API endpoints.

Provides REST API for client-gallery associations and proofing statistics.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status

from src.services.gallery_link_service import GalleryLinkService, get_gallery_link_service
from src.schemas.gallery_link import (
    GalleryLinkCreate,
    GalleryLinkUpdate,
    GalleryLinkResponse,
    GalleryLinkListResponse,
    ProofingSummaryResponse,
)
from src.schemas.common import ErrorResponse
from src.middleware.auth import get_current_user, JWTPayload
from src.middleware.workspace_auth import verify_workspace_access
from src.log_config import get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/workspaces/{workspace_id}/clients/{client_id}/galleries",
    tags=["gallery-links"],
)


# =============================================================================
# Gallery Link Endpoints
# =============================================================================


@router.get("", response_model=GalleryLinkListResponse)
async def list_client_galleries(
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: GalleryLinkService = Depends(get_gallery_link_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> GalleryLinkListResponse:
    """
    List all galleries linked to a client.

    Includes proofing statistics for each gallery link.

    Args:
        client_id: Client ID
        workspace_id: Workspace ID
        service: GalleryLinkService instance
        current_user: Current user from JWT

    Returns:
        GalleryLinkListResponse: List of gallery links with proofing stats
    """
    links = await service.list_client_galleries(
        workspace_id=str(workspace_id),
        client_id=str(client_id),
    )

    logger.debug(
        "Client galleries listed",
        extra={
            "client_id": str(client_id),
            "workspace_id": str(workspace_id),
            "count": len(links),
        },
    )

    return GalleryLinkListResponse(links=[GalleryLinkResponse(**link) for link in links])


@router.post("", response_model=GalleryLinkResponse, status_code=status.HTTP_201_CREATED)
async def link_gallery_to_client(
    data: GalleryLinkCreate,
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: GalleryLinkService = Depends(get_gallery_link_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> GalleryLinkResponse:
    """
    Link a gallery to a client.

    Args:
        data: Gallery link creation data
        client_id: Client ID
        workspace_id: Workspace ID
        service: GalleryLinkService instance
        current_user: Current user from JWT

    Returns:
        GalleryLinkResponse: Created gallery link

    Raises:
        HTTPException: 400 if link already exists or validation fails
    """
    try:
        link = await service.create_gallery_link(
            workspace_id=str(workspace_id),
            client_id=str(client_id),
            data=data,
        )

        logger.info(
            "Gallery linked to client",
            extra={
                "link_id": str(link["link_id"]),
                "client_id": str(client_id),
                "gallery_id": str(data.gallery_id),
                "workspace_id": str(workspace_id),
                "user_id": str(current_user.user_id),
            },
        )

        return GalleryLinkResponse(**link)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="VALIDATION_ERROR",
                message=str(e),
            ).model_dump(),
        )
    except Exception as e:
        logger.error(
            "Gallery link creation failed",
            extra={
                "client_id": str(client_id),
                "gallery_id": str(data.gallery_id),
                "workspace_id": str(workspace_id),
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="GALLERY_LINK_FAILED",
                message="Failed to link gallery to client",
            ).model_dump(),
        )


@router.get("/{gallery_id}", response_model=GalleryLinkResponse)
async def get_gallery_link(
    gallery_id: UUID = Path(..., description="Gallery ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: GalleryLinkService = Depends(get_gallery_link_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> GalleryLinkResponse:
    """
    Get gallery link details.

    Args:
        gallery_id: Gallery ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: GalleryLinkService instance
        current_user: Current user from JWT

    Returns:
        GalleryLinkResponse: Gallery link with proofing stats

    Raises:
        HTTPException: 404 if link not found
    """
    # Find link by client and gallery
    from src.repositories.gallery_link_repository import GalleryLinkRepository

    repo = GalleryLinkRepository()
    link = await repo.get_by_client_and_gallery(
        str(workspace_id), str(client_id), str(gallery_id)
    )

    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="GALLERY_LINK_NOT_FOUND",
                message=f"Gallery {gallery_id} is not linked to client {client_id}",
            ).model_dump(),
        )

    return GalleryLinkResponse(**link)


@router.patch("/{gallery_id}", response_model=GalleryLinkResponse)
async def update_gallery_link(
    data: GalleryLinkUpdate,
    gallery_id: UUID = Path(..., description="Gallery ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: GalleryLinkService = Depends(get_gallery_link_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> GalleryLinkResponse:
    """
    Update gallery link.

    Args:
        data: Gallery link update data
        gallery_id: Gallery ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: GalleryLinkService instance
        current_user: Current user from JWT

    Returns:
        GalleryLinkResponse: Updated gallery link

    Raises:
        HTTPException: 404 if link not found
    """
    # Find link by client and gallery
    from src.repositories.gallery_link_repository import GalleryLinkRepository

    repo = GalleryLinkRepository()
    existing = await repo.get_by_client_and_gallery(
        str(workspace_id), str(client_id), str(gallery_id)
    )

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="GALLERY_LINK_NOT_FOUND",
                message=f"Gallery {gallery_id} is not linked to client {client_id}",
            ).model_dump(),
        )

    # Update using link_id
    link = await service.update_gallery_link(
        workspace_id=str(workspace_id),
        link_id=str(existing["link_id"]),
        data=data,
    )

    logger.info(
        "Gallery link updated",
        extra={
            "link_id": str(existing["link_id"]),
            "client_id": str(client_id),
            "gallery_id": str(gallery_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return GalleryLinkResponse(**link)


@router.delete("/{gallery_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_gallery(
    gallery_id: UUID = Path(..., description="Gallery ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: GalleryLinkService = Depends(get_gallery_link_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> None:
    """
    Unlink a gallery from a client.

    Args:
        gallery_id: Gallery ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: GalleryLinkService instance
        current_user: Current user from JWT

    Raises:
        HTTPException: 404 if link not found
    """
    deleted = await service.unlink_gallery(
        str(workspace_id), str(client_id), str(gallery_id)
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse(
                error="GALLERY_LINK_NOT_FOUND",
                message=f"Gallery {gallery_id} is not linked to client {client_id}",
            ).model_dump(),
        )

    logger.info(
        "Gallery unlinked from client",
        extra={
            "client_id": str(client_id),
            "gallery_id": str(gallery_id),
            "workspace_id": str(workspace_id),
            "user_id": str(current_user.user_id),
        },
    )

    return None


# =============================================================================
# Proofing Statistics Endpoint
# =============================================================================


@router.get("/{gallery_id}/proofing-summary", response_model=ProofingSummaryResponse)
async def get_proofing_summary(
    gallery_id: UUID = Path(..., description="Gallery ID"),
    client_id: UUID = Path(..., description="Client ID"),
    workspace_id: UUID = Depends(verify_workspace_access),
    service: GalleryLinkService = Depends(get_gallery_link_service),
    current_user: JWTPayload = Depends(get_current_user),
) -> ProofingSummaryResponse:
    """
    Get proofing summary for a client-gallery pair.

    Returns engagement statistics:
    - Favorites count
    - Selections count
    - Comments count
    - Last viewed timestamp
    - Total engagement

    Args:
        gallery_id: Gallery ID
        client_id: Client ID
        workspace_id: Workspace ID
        service: GalleryLinkService instance
        current_user: Current user from JWT

    Returns:
        ProofingSummaryResponse: Proofing summary with engagement stats
    """
    summary = await service.get_proofing_summary(
        workspace_id=str(workspace_id),
        client_id=str(client_id),
        gallery_id=str(gallery_id),
    )

    logger.debug(
        "Proofing summary retrieved",
        extra={
            "client_id": str(client_id),
            "gallery_id": str(gallery_id),
            "workspace_id": str(workspace_id),
            "total_engagement": summary["total_engagement"],
        },
    )

    return ProofingSummaryResponse(**summary)
