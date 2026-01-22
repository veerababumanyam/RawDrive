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
from src.schemas.asset_metadata import (
    AssetFlag,
    ColorLabel,
    AssetMetadataUpdateRequest,
    BatchAssetMetadataItem,
    BatchAssetMetadataUpdateRequest,
    AssetFilterRequest,
    AssetMetadataResponse,
    AssetMetadataUpdateResponse,
    BatchAssetMetadataUpdateResponse,
    FilteredAssetsResponse,
)
from src.schemas.sync_api_key import (
    SyncKeyPermission,
    SyncApiKeyCreateRequest,
    SyncApiKeyUpdateRequest,
    SyncApiKeyValidateRequest,
    SyncApiKeyResponse,
    SyncApiKeyCreateResponse,
    SyncApiKeyListResponse,
    SyncApiKeyValidateResponse,
    SyncApiKeyUsageStats,
)
from src.schemas.sync_audit import (
    SyncAuditAction,
    SyncAuditSource,
    SyncActorType,
    SyncAuditStatus,
    SyncAuditLogCreateRequest,
    SyncAuditLogQuery,
    SyncAuditLogResponse,
    SyncAuditLogListResponse,
    SyncAuditSummary,
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
    # Asset Metadata (Pro Review Mode)
    "AssetFlag",
    "ColorLabel",
    "AssetMetadataUpdateRequest",
    "BatchAssetMetadataItem",
    "BatchAssetMetadataUpdateRequest",
    "AssetFilterRequest",
    "AssetMetadataResponse",
    "AssetMetadataUpdateResponse",
    "BatchAssetMetadataUpdateResponse",
    "FilteredAssetsResponse",
    # Sync API Key
    "SyncKeyPermission",
    "SyncApiKeyCreateRequest",
    "SyncApiKeyUpdateRequest",
    "SyncApiKeyValidateRequest",
    "SyncApiKeyResponse",
    "SyncApiKeyCreateResponse",
    "SyncApiKeyListResponse",
    "SyncApiKeyValidateResponse",
    "SyncApiKeyUsageStats",
    # Sync Audit
    "SyncAuditAction",
    "SyncAuditSource",
    "SyncActorType",
    "SyncAuditStatus",
    "SyncAuditLogCreateRequest",
    "SyncAuditLogQuery",
    "SyncAuditLogResponse",
    "SyncAuditLogListResponse",
    "SyncAuditSummary",
]
