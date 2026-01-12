"""
API v1 Router - aggregates all API endpoints.
"""

from fastapi import APIRouter

from src.api.v1.invitations import router as invitations_router
from src.api.v1.invitation_templates import router as invitation_templates_router
from src.api.v1.invitation_exports import router as invitation_exports_router
from src.api.v1.invitation_media import router as invitation_media_router
from src.api.v1.invitation_sub_events import router as invitation_sub_events_router
from src.api.v1.invitation_ai import router as invitation_ai_router
from src.api.v1.invitation_fonts import router as invitation_fonts_router
from src.api.v1.guests import router as guests_router
from src.api.v1.rsvp import router as rsvp_router
from src.api.v1.analytics import router as analytics_router
from src.api.v1.audit import router as audit_router

router = APIRouter()

# Invitation Templates routes (must be registered BEFORE invitations router
# so /templates is matched before /{invitation_id} catch-all route)
router.include_router(
    invitation_templates_router,
    prefix="/workspaces/{workspace_id}/digital-invitations",
    tags=["invitation-templates"],
)

# Invitation Exports routes (must be before /{invitation_id} routes)
router.include_router(
    invitation_exports_router,
    prefix="/workspaces/{workspace_id}/digital-invitations",
    tags=["invitation-exports"],
)

# Invitation Media routes (must be before /{invitation_id} routes)
router.include_router(
    invitation_media_router,
    prefix="/workspaces/{workspace_id}/digital-invitations",
    tags=["invitation-media"],
)

# Invitation Sub-Events routes (must be before /{invitation_id} routes)
router.include_router(
    invitation_sub_events_router,
    prefix="/workspaces/{workspace_id}/digital-invitations",
    tags=["invitation-sub-events"],
)

# Invitation AI routes (must be before /{invitation_id} routes)
router.include_router(
    invitation_ai_router,
    prefix="/workspaces/{workspace_id}/digital-invitations",
    tags=["invitation-ai"],
)

# Invitation Fonts routes
router.include_router(
    invitation_fonts_router,
    prefix="/workspaces/{workspace_id}/digital-invitations",
    tags=["invitation-fonts"],
)

# Digital Invitations routes (main CRUD endpoints - must be last due to catch-all route)
router.include_router(
    invitations_router,
    prefix="/workspaces/{workspace_id}/digital-invitations",
    tags=["digital-invitations"],
)

# Guest management routes
router.include_router(
    guests_router,
    tags=["guests"],
)

# RSVP routes (public-facing)
router.include_router(
    rsvp_router,
    tags=["rsvp"],
)

# Analytics routes
router.include_router(
    analytics_router,
    tags=["analytics"],
)

# Audit routes
router.include_router(
    audit_router,
    tags=["audit"],
)
