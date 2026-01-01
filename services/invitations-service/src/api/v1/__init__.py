"""
API v1 Router - aggregates all API endpoints.
"""

from fastapi import APIRouter

from src.api.v1.invitations import router as invitations_router
from src.api.v1.guests import router as guests_router
from src.api.v1.rsvp import router as rsvp_router
from src.api.v1.analytics import router as analytics_router
from src.api.v1.audit import router as audit_router

router = APIRouter()

# Include sub-routers
router.include_router(
    invitations_router,
    prefix="/invitations",
    tags=["invitations"],
)

router.include_router(
    guests_router,
    tags=["guests"],
)

router.include_router(
    rsvp_router,
    tags=["rsvp"],
)

router.include_router(
    analytics_router,
    tags=["analytics"],
)

router.include_router(
    audit_router,
    tags=["audit"],
)
