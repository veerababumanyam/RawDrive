"""
API v1 endpoints for LiveSync Service.

Provides endpoints for:
- LiveSync mappings (folder-to-gallery mappings)
- LiveSync sessions (active sync sessions)
- WebSocket for real-time updates
"""

from fastapi import APIRouter

from src.api.v1.mappings import router as mappings_router
from src.api.v1.sessions import router as sessions_router

router = APIRouter()

# LiveSync mapping endpoints
router.include_router(
    mappings_router,
    prefix="/livesync/mappings",
    tags=["livesync-mappings"],
)

# LiveSync session endpoints
router.include_router(
    sessions_router,
    prefix="/livesync/sessions",
    tags=["livesync-sessions"],
)


# Service status endpoint
@router.get("/livesync/status", tags=["livesync"])
async def livesync_service_status():
    """
    Get livesync service status.

    Returns service health and available endpoints.
    """
    return {
        "service": "livesync-service",
        "status": "operational",
        "version": "1.0.0",
        "endpoints": {
            "mappings": "/api/v1/livesync/mappings",
            "sessions": "/api/v1/livesync/sessions",
            "websocket": "/api/v1/livesync/ws",
        },
    }


__all__ = ["router"]
