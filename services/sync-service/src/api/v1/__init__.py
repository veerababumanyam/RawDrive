"""
API v1 endpoints for Sync Service.

Provides endpoints for:
- Sync mappings (folder-to-gallery mappings)
- Sync sessions (active sync sessions)
- WebSocket for real-time updates
"""

from fastapi import APIRouter

from src.api.v1.mappings import router as mappings_router
from src.api.v1.sessions import router as sessions_router

router = APIRouter()

# Sync mapping endpoints
router.include_router(
    mappings_router,
    prefix="/sync/mappings",
    tags=["sync-mappings"],
)

# Sync session endpoints
router.include_router(
    sessions_router,
    prefix="/sync/sessions",
    tags=["sync-sessions"],
)


# Service status endpoint
@router.get("/sync/status", tags=["sync"])
async def sync_service_status():
    """
    Get sync service status.

    Returns service health and available endpoints.
    """
    return {
        "service": "sync-service",
        "status": "operational",
        "version": "1.0.0",
        "endpoints": {
            "mappings": "/api/v1/sync/mappings",
            "sessions": "/api/v1/sync/sessions",
            "websocket": "/api/v1/sync/ws",
        },
    }


__all__ = ["router"]
