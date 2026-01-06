"""Proofing schemas for real-time gallery interactions."""

from typing import Optional, List
from pydantic import BaseModel, Field


class ProofingActionRequest(BaseModel):
    """Request to perform a proofing action (favorite/select)."""

    asset_id: str = Field(..., description="Asset ID to act on")
    action: str = Field(..., pattern=r"^(favorite|select)$", description="Action type")
    value: bool = Field(..., description="True to add, False to remove")


class ProofingActionResponse(BaseModel):
    """Response from a proofing action."""

    asset_id: str
    action: str
    value: bool
    favorites_count: Optional[int] = None
    is_selected: Optional[bool] = None


class ProofingCommentRequest(BaseModel):
    """Request to add a comment to an asset."""

    asset_id: str
    comment: str = Field(..., min_length=1, max_length=2000)


class ProofingCommentResponse(BaseModel):
    """Response from adding a comment."""

    comment_id: str
    asset_id: str
    comment: str
    visitor_id: Optional[str] = None
    visitor_name: Optional[str] = None
    created_at: str


class FaceSearchRequest(BaseModel):
    """Request to search for similar faces in a gallery."""

    image_data: str = Field(..., description="Base64 encoded face image")
    threshold: float = Field(default=0.6, ge=0.0, le=1.0, description="Similarity threshold")
    limit: int = Field(default=50, ge=1, le=200, description="Maximum results")


class FaceSearchResponse(BaseModel):
    """Response from face search."""

    results: List["FaceSearchResult"]
    total: int


class FaceSearchResult(BaseModel):
    """Single face search result."""

    asset_id: str
    similarity: float = Field(..., ge=0.0, le=1.0)
    thumbnail_url: Optional[str] = None


# WebSocket message schemas
class WebSocketMessage(BaseModel):
    """Base WebSocket message."""

    type: str
    payload: dict


class ProofingUpdateMessage(BaseModel):
    """WebSocket message for proofing updates."""

    type: str = "proofing_update"
    gallery_id: str
    asset_id: str
    action: str  # favorite, select, comment
    value: Optional[bool] = None
    data: Optional[dict] = None
    visitor_id: Optional[str] = None
    timestamp: str


class ViewerCountMessage(BaseModel):
    """WebSocket message for viewer count updates."""

    type: str = "viewer_count"
    gallery_id: str
    count: int
    timestamp: str


class HeartbeatMessage(BaseModel):
    """WebSocket heartbeat message."""

    type: str = "heartbeat"
    timestamp: str


# Batch operations
class BatchProofingRequest(BaseModel):
    """Request to perform batch proofing actions."""

    actions: List[ProofingActionRequest] = Field(..., min_length=1, max_length=100)


class BatchProofingResponse(BaseModel):
    """Response from batch proofing actions."""

    results: List[ProofingActionResponse]
    success_count: int
    error_count: int


# Gallery download/export
class DownloadRequest(BaseModel):
    """Request to download gallery assets."""

    asset_ids: Optional[List[str]] = Field(None, description="Specific assets to download, null for all")
    include_favorites_only: bool = Field(default=False)
    include_selections_only: bool = Field(default=False)
    format: str = Field(default="zip", pattern=r"^(zip|original)$")


class DownloadResponse(BaseModel):
    """Response with download URL."""

    download_url: str
    expires_at: str
    total_files: int
    total_size_bytes: int


# Update forward references
FaceSearchResponse.model_rebuild()
