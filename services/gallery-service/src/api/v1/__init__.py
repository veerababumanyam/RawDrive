# API v1 endpoints
from fastapi import APIRouter

from src.api.v1.galleries import router as galleries_router
from src.api.v1.magic_links import router as magic_links_router
from src.api.v1.public import router as public_router
from src.api.v1.websocket import router as websocket_router
from src.api.v1.agents import router as agents_router
from src.api.v1.websocket_agents import router as websocket_agents_router

router = APIRouter()

# Authenticated gallery endpoints
router.include_router(
    galleries_router,
    prefix="/galleries",
    tags=["galleries"],
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

__all__ = ["router"]
