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

__all__ = [
    "GalleryService",
    "get_gallery_service",
    "GalleryError",
    "GalleryNotFoundError",
    "MagicLinkService",
    "get_magic_link_service",
    "ProofingService",
    "get_proofing_service",
]
