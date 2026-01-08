"""AI Service - API v1 module."""

from fastapi import APIRouter

try:
    from src.api.v1.smart_tagging import router as smart_tagging_router
    
    router = APIRouter()
    
    # Smart Tagging routes
    router.include_router(
        smart_tagging_router,
        prefix="/workspaces/{workspace_id}/smart-tagging",
        tags=["smart-tagging"],
    )
except ImportError as e:
    # Fallback if import fails
    import logging
    logger = logging.getLogger(__name__)
    logger.error(f"Failed to import smart_tagging router: {e}", exc_info=True)
    router = APIRouter()

__all__ = ["router"]
