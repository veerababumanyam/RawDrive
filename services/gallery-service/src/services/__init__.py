# Services module - Business logic layer
from src.services.gallery_service import (
    GalleryService,
    get_gallery_service,
    GalleryError,
    GalleryNotFoundError,
)
from src.services.magic_link_service import (
    MagicLinkService,
    get_magic_link_service,
)
from src.services.proofing_service import (
    ProofingService,
    get_proofing_service,
)
from src.services.sync_key_service import (
    SyncKeyService,
    get_sync_key_service,
    SyncKeyError,
    SyncKeyNotFoundError,
    SyncKeyRevokedError,
    SyncKeyExpiredError,
    SyncKeyInvalidError,
    SyncKeyPermissionDeniedError,
    SyncKeyGalleryScopeError,
)
from src.services.audit_service import (
    AuditService,
    get_audit_service,
    AuditLogError,
    AuditLogNotFoundError,
)

__all__ = [
    # Gallery
    "GalleryService",
    "get_gallery_service",
    "GalleryError",
    "GalleryNotFoundError",
    # Magic Link
    "MagicLinkService",
    "get_magic_link_service",
    # Proofing
    "ProofingService",
    "get_proofing_service",
    # Sync API Key
    "SyncKeyService",
    "get_sync_key_service",
    "SyncKeyError",
    "SyncKeyNotFoundError",
    "SyncKeyRevokedError",
    "SyncKeyExpiredError",
    "SyncKeyInvalidError",
    "SyncKeyPermissionDeniedError",
    "SyncKeyGalleryScopeError",
    # Audit
    "AuditService",
    "get_audit_service",
    "AuditLogError",
    "AuditLogNotFoundError",
]
