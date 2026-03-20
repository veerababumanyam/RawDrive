# API v1 endpoints
from fastapi import APIRouter

from src.api.v1.galleries import router as galleries_router
from src.api.v1.magic_links import router as magic_links_router
from src.api.v1.public import router as public_router
from src.api.v1.websocket import router as websocket_router
from src.api.v1.agents import router as agents_router
from src.api.v1.websocket_agents import router as websocket_agents_router
from src.api.v1.batch import router as batch_router
from src.api.v1.gallery_design_recommendations import router as gallery_design_recommendations_router
from src.api.v1.gallery_analytics import router as gallery_analytics_router
from src.api.v1.assets import router as assets_router
# XMP sync and desktop sync endpoints
from src.api.v1.xmp_sync import router as xmp_sync_router
from src.api.v1.sync_keys import router as sync_keys_router
from src.api.v1.desktop_sync import router as desktop_sync_router

router = APIRouter()

# Authenticated gallery endpoints
router.include_router(
    galleries_router,
    prefix="/galleries",
    tags=["galleries"],
)

# Pro Review Mode asset metadata endpoints (authenticated)
router.include_router(
    assets_router,
    prefix="/galleries",
    tags=["galleries", "review-mode"],
)

# Magic link management (authenticated)
router.include_router(
    magic_links_router,
    prefix="/magic-links",
    tags=["magic-links"],
)

# Public endpoints (no auth required)
router.include_router(
    public_router,
    prefix="/public",
    tags=["public"],
)

# WebSocket for real-time proofing
router.include_router(
    websocket_router,
    prefix="/ws",
    tags=["websocket"],
)

# WebSocket for AI agent notifications
router.include_router(
    websocket_agents_router,
    prefix="/ws",
    tags=["websocket", "agents"],
)

# Google A2A Agent endpoints (authenticated)
router.include_router(
    agents_router,
    prefix="/agents",
    tags=["agents", "a2a"],
)

# Batch operations endpoints (authenticated)
router.include_router(
    batch_router,
    prefix="/batch",
    tags=["batch"],
)

# Gallery design AI recommendations endpoints (authenticated)
router.include_router(
    gallery_design_recommendations_router,
    prefix="/design",
    tags=["design", "ai-recommendations"],
)

# Gallery analytics endpoints (authenticated)
router.include_router(
    gallery_analytics_router,
    prefix="/galleries",
    tags=["galleries", "analytics"],
)

# XMP sync endpoints (authenticated + desktop sync API key)
router.include_router(
    xmp_sync_router,
    tags=["xmp-sync"],
)

# Sync API key management endpoints (JWT authenticated)
router.include_router(
    sync_keys_router,
    prefix="/sync-keys",
    tags=["sync-keys"],
)

# Desktop sync endpoints (API key authenticated)
router.include_router(
    desktop_sync_router,
    prefix="/sync",
    tags=["desktop-sync"],
)

__all__ = ["router"]
