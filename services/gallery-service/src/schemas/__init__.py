# Schemas module - Pydantic models for request/response validation
from src.schemas.gallery import (
    GalleryResponse,
    GalleryListResponse,
    GalleryCreateRequest,
    GalleryUpdateRequest,
    SubGalleryResponse,
    SubGalleryCreateRequest,
    GalleryAssetResponse,
    GalleryAssetsListResponse,
    GalleryStatsResponse,
)
from src.schemas.magic_link import (
    MagicLinkResponse,
    MagicLinkCreateRequest,
    MagicLinkValidateResponse,
    PinVerifyRequest,
    PinVerifyResponse,
)
from src.schemas.proofing import (
    ProofingActionRequest,
    ProofingActionResponse,
    FaceSearchRequest,
    FaceSearchResponse,
)
from src.schemas.common import (
    PaginationMeta,
    ErrorResponse,
)

__all__ = [
    # Gallery
    "GalleryResponse",
    "GalleryListResponse",
    "GalleryCreateRequest",
    "GalleryUpdateRequest",
    "SubGalleryResponse",
    "SubGalleryCreateRequest",
    "GalleryAssetResponse",
    "GalleryAssetsListResponse",
    "GalleryStatsResponse",
    # Magic Link
    "MagicLinkResponse",
    "MagicLinkCreateRequest",
    "MagicLinkValidateResponse",
    "PinVerifyRequest",
    "PinVerifyResponse",
    # Proofing
    "ProofingActionRequest",
    "ProofingActionResponse",
    "FaceSearchRequest",
    "FaceSearchResponse",
    # Common
    "PaginationMeta",
    "ErrorResponse",
]
