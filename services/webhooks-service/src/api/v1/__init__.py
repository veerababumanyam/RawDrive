"""API v1 router."""
from fastapi import APIRouter

from src.api.v1.subscriptions import router as subscriptions_router
from src.api.v1.events import router as events_router
from src.api.v1.event_types import router as event_types_router
from src.api.v1.admin import router as admin_router
from src.api.v1.templates import router as templates_router, workflow_router

router = APIRouter()

# Include all routers
router.include_router(subscriptions_router)
router.include_router(events_router)
router.include_router(event_types_router)
router.include_router(admin_router)
router.include_router(templates_router)
router.include_router(workflow_router)
