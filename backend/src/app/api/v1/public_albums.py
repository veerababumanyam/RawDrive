"""Public Album Proofing API endpoints.

Provides public endpoints for client album proofing:
- Album proof viewing via share link
- Comment submission
- Album approval
- PDF download

These endpoints require only a valid share link token, no authentication.

Feature: 026-album-proofing
"""
from __future__ import annotations

import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Path, Query, status

from app.api.exceptions import AppError, NotFoundError, ForbiddenError
from app.schemas.album import (
    AlbumProofResponse,
    ApproveAlbumRequest,
    ApproveAlbumResponse,
)
from app.schemas.album_comment import (
    AlbumCommentCreate,
    AlbumCommentResponse,
    AlbumCommentPublic,
)
from app.schemas.album_render import (
    DownloadResponse,
    DownloadGeneratingResponse,
)
from app.services.album_proof_service import AlbumProofService
from app.services.album_exceptions import (
    AlbumNotFoundError,
    InvalidShareLinkError,
    ShareLinkExpiredError,
    ShareLinkAccessLimitError,
    AlbumAlreadyApprovedError,
    UnresolvedCommentsError,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_proof_service() -> AlbumProofService:
    """Get album proof service instance."""
    return AlbumProofService()


# =========================================================================
# ALBUM PROOF VIEWING
# =========================================================================


@router.get(
    "/{token}",
    response_model=AlbumProofResponse,
    status_code=status.HTTP_200_OK,
    summary="Get album proof",
    description="Access album via share link token for client review.",
    responses={
        403: {"description": "Link expired or revoked"},
        404: {"description": "Album not found"},
    },
)
async def get_album_proof(
    token: Annotated[str, Path(..., description="Share link token")],
) -> AlbumProofResponse:
    """Get album proof for client viewing.

    Validates the share link token and returns the album with all spreads
    for client review.
    """
    service = _get_proof_service()

    try:
        proof = await service.get_album_proof(token)
        return AlbumProofResponse(**proof)
    except InvalidShareLinkError as e:
        raise ForbiddenError(e.message)
    except ShareLinkExpiredError:
        raise ForbiddenError("Share link has expired")
    except ShareLinkAccessLimitError:
        raise ForbiddenError("Access limit reached for this link")
    except AlbumNotFoundError:
        raise NotFoundError("Album not found")
    except Exception as e:
        logger.exception("Failed to get album proof")
        raise AppError(
            message="Failed to load album",
            code="INTERNAL_ERROR",
            status_code=500,
        )


# =========================================================================
# PUBLIC COMMENTS
# =========================================================================


@router.get(
    "/{token}/comments",
    status_code=status.HTTP_200_OK,
    summary="List public comments",
    description="List all public comments on an album (excludes internal notes).",
)
async def list_public_comments(
    token: Annotated[str, Path(..., description="Share link token")],
    spread_id: Annotated[Optional[UUID], Query(description="Filter by spread")] = None,
) -> dict:
    """List public comments for client view.

    Returns only comments visible to clients (excludes internal notes).
    """
    service = _get_proof_service()

    try:
        # Validate link first
        link_info = await service.validate_share_link(token)
        album_id = link_info["album_id"]
        workspace_id = link_info["workspace_id"]

        # Get public comments
        comments = await service.comment_repo.list_public_comments_by_album(
            album_id=album_id,
            workspace_id=workspace_id,
            spread_id=spread_id,
        )

        return {"data": comments}
    except InvalidShareLinkError as e:
        raise ForbiddenError(e.message)
    except ShareLinkExpiredError:
        raise ForbiddenError("Share link has expired")
    except Exception as e:
        logger.exception("Failed to list public comments")
        raise AppError(
            message="Failed to load comments",
            code="INTERNAL_ERROR",
            status_code=500,
        )


@router.post(
    "/{token}/comments",
    response_model=AlbumCommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add comment",
    description="Submit a positioned comment on an album spread.",
    responses={
        400: {"description": "Validation error"},
        403: {"description": "Link expired or commenting not allowed"},
    },
)
async def create_public_comment(
    token: Annotated[str, Path(..., description="Share link token")],
    request: AlbumCommentCreate,
) -> AlbumCommentResponse:
    """Create a comment as a client.

    Places a positioned comment on an album spread for the photographer
    to review.
    """
    service = _get_proof_service()

    try:
        comment = await service.create_public_comment(
            token=token,
            spread_id=request.spread_id,
            body=request.body,
            position_x=request.position_x,
            position_y=request.position_y,
            author_name=request.author_name,
            author_email=request.author_email,
            parent_comment_id=request.parent_comment_id,
        )

        return AlbumCommentResponse(**comment)
    except InvalidShareLinkError as e:
        raise ForbiddenError(e.message)
    except ShareLinkExpiredError:
        raise ForbiddenError("Share link has expired")
    except Exception as e:
        logger.exception("Failed to create public comment")
        raise AppError(
            message="Failed to add comment",
            code="INTERNAL_ERROR",
            status_code=500,
        )


# =========================================================================
# ALBUM APPROVAL
# =========================================================================


@router.post(
    "/{token}/approve",
    response_model=ApproveAlbumResponse,
    status_code=status.HTTP_200_OK,
    summary="Approve album",
    description="Client approves album design for printing.",
    responses={
        400: {"description": "Unresolved comments exist"},
        403: {"description": "Link expired or album already approved"},
        409: {"description": "Album modified since proof sent"},
    },
)
async def approve_album_public(
    token: Annotated[str, Path(..., description="Share link token")],
    request: ApproveAlbumRequest,
) -> ApproveAlbumResponse:
    """Approve album for print.

    Records client approval and notifies the photographer.
    """
    service = _get_proof_service()

    try:
        result = await service.approve_album_public(
            token=token,
            client_name=request.client_name,
            client_email=request.client_email,
            acknowledge_unresolved=request.acknowledge_unresolved,
        )

        return ApproveAlbumResponse(**result)
    except InvalidShareLinkError as e:
        raise ForbiddenError(e.message)
    except ShareLinkExpiredError:
        raise ForbiddenError("Share link has expired")
    except AlbumAlreadyApprovedError:
        raise ForbiddenError("Album has already been approved")
    except UnresolvedCommentsError as e:
        raise AppError(
            message=f"Album has {e.comment_count} unresolved comments",
            code="UNRESOLVED_COMMENTS",
            status_code=400,
            details=[{
                "field": "acknowledge_unresolved",
                "message": "Set to true to approve with unresolved comments",
            }],
        )
    except Exception as e:
        logger.exception("Failed to approve album")
        raise AppError(
            message="Failed to approve album",
            code="INTERNAL_ERROR",
            status_code=500,
        )


# =========================================================================
# PDF DOWNLOAD
# =========================================================================


@router.get(
    "/{token}/download",
    status_code=status.HTTP_200_OK,
    summary="Download preview PDF",
    description="Get download URL for watermarked preview PDF.",
    responses={
        200: {"description": "Download URL ready"},
        202: {"description": "PDF generation in progress"},
        403: {"description": "Download not permitted"},
    },
)
async def download_album_preview(
    token: Annotated[str, Path(..., description="Share link token")],
) -> dict:
    """Download preview PDF.

    Returns a signed download URL if ready, or generation status
    if the PDF is being created.
    """
    service = _get_proof_service()

    try:
        result = await service.get_download_url(token)

        if "status" in result and result["status"] == "generating":
            # Return 202 for in-progress
            return result

        return result
    except InvalidShareLinkError as e:
        raise ForbiddenError(e.message)
    except ShareLinkExpiredError:
        raise ForbiddenError("Share link has expired")
    except Exception as e:
        logger.exception("Failed to get download URL")
        raise AppError(
            message="Failed to get download URL",
            code="INTERNAL_ERROR",
            status_code=500,
        )
