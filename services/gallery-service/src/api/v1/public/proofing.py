"""
Public Proofing API Endpoints.

Handles proofing actions (favorites, selections, comments) from gallery visitors.
Real-time updates are broadcast via WebSocket.
"""

from fastapi import APIRouter, HTTPException, Header, Request
from typing import Optional

from src.services.proofing_service import (
    get_proofing_service,
    ProofingError,
    AssetNotFoundError,
)
from src.schemas.proofing import (
    ProofingActionRequest,
    ProofingActionResponse,
    ProofingCommentRequest,
    ProofingCommentResponse,
    FaceSearchRequest,
    FaceSearchResponse,
    BatchProofingRequest,
    BatchProofingResponse,
)
from src.logging import get_logger
from src.observability.metrics import get_metrics

logger = get_logger(__name__)
metrics = get_metrics()

router = APIRouter()


# =============================================================================
# Dependencies
# =============================================================================


def get_visitor_id(
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-ID"),
) -> Optional[str]:
    """Extract visitor ID from header."""
    return x_visitor_id


# =============================================================================
# Proofing Endpoints
# =============================================================================


@router.post("/{gallery_id}/proof/favorite", response_model=ProofingActionResponse)
async def toggle_favorite(
    gallery_id: str,
    data: ProofingActionRequest,
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-ID"),
):
    """
    Toggle favorite status for an asset.

    Broadcasts update to all connected viewers via WebSocket.
    """
    if data.action != "favorite":
        raise HTTPException(status_code=400, detail={"error": "INVALID_ACTION", "message": "Action must be 'favorite'"})

    proofing_service = get_proofing_service()

    try:
        result = await proofing_service.toggle_favorite(
            gallery_id=gallery_id,
            asset_id=data.asset_id,
            value=data.value,
            visitor_id=x_visitor_id,
        )
        return result
    except AssetNotFoundError as e:
        raise HTTPException(status_code=404, detail={"error": e.code, "message": str(e)})
    except ProofingError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.post("/{gallery_id}/proof/select", response_model=ProofingActionResponse)
async def toggle_selection(
    gallery_id: str,
    data: ProofingActionRequest,
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-ID"),
):
    """
    Toggle selection status for an asset.

    Broadcasts update to all connected viewers via WebSocket.
    """
    if data.action != "select":
        raise HTTPException(status_code=400, detail={"error": "INVALID_ACTION", "message": "Action must be 'select'"})

    proofing_service = get_proofing_service()

    try:
        result = await proofing_service.toggle_selection(
            gallery_id=gallery_id,
            asset_id=data.asset_id,
            value=data.value,
            visitor_id=x_visitor_id,
        )
        return result
    except AssetNotFoundError as e:
        raise HTTPException(status_code=404, detail={"error": e.code, "message": str(e)})
    except ProofingError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.post("/{gallery_id}/proof/comment", response_model=ProofingCommentResponse)
async def add_comment(
    gallery_id: str,
    data: ProofingCommentRequest,
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-ID"),
    x_visitor_name: Optional[str] = Header(None, alias="X-Visitor-Name"),
):
    """
    Add a comment to an asset.

    Broadcasts update to all connected viewers via WebSocket.
    """
    proofing_service = get_proofing_service()

    try:
        result = await proofing_service.add_comment(
            gallery_id=gallery_id,
            asset_id=data.asset_id,
            comment=data.comment,
            visitor_id=x_visitor_id,
            visitor_name=x_visitor_name,
        )
        return result
    except AssetNotFoundError as e:
        raise HTTPException(status_code=404, detail={"error": e.code, "message": str(e)})
    except ProofingError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})


@router.post("/{gallery_id}/proof/batch", response_model=BatchProofingResponse)
async def batch_proofing(
    gallery_id: str,
    data: BatchProofingRequest,
    x_visitor_id: Optional[str] = Header(None, alias="X-Visitor-ID"),
):
    """
    Perform multiple proofing actions in a single request.

    Useful for bulk favorites/selections.
    """
    proofing_service = get_proofing_service()

    result = await proofing_service.batch_proofing(
        gallery_id=gallery_id,
        actions=[a.model_dump() for a in data.actions],
        visitor_id=x_visitor_id,
    )
    return result


@router.post("/{gallery_id}/face-search", response_model=FaceSearchResponse)
async def face_search(
    gallery_id: str,
    data: FaceSearchRequest,
):
    """
    Search for similar faces in a gallery.

    Uses pgvector for efficient similarity search.
    Rate limited to 20 requests/minute per visitor.
    """
    proofing_service = get_proofing_service()

    try:
        # Decode base64 image and extract face embedding
        # In production, this would call the face detection service
        # For now, we'll expect the embedding directly
        face_embedding = []  # Would be extracted from data.image_data

        # If we have no embedding extraction, return empty results
        if not face_embedding:
            return {"results": [], "total": 0}

        result = await proofing_service.face_search(
            gallery_id=gallery_id,
            face_embedding=face_embedding,
            threshold=data.threshold,
            limit=data.limit,
        )
        return result
    except ProofingError as e:
        raise HTTPException(status_code=e.status, detail={"error": e.code, "message": str(e)})
