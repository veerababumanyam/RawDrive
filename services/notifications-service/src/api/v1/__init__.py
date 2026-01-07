"""API v1 Router - Aggregates all notification service API endpoints.

This module combines all API routers for the Notifications & Communication Microservice:
- Notifications: Send, list, cancel, retry notifications
- Preferences: User notification preferences and workspace defaults
- Templates: Notification template management
- Webhooks: Email provider callback handling (SendGrid)

All workspace-specific endpoints are prefixed with:
    /api/v1/workspaces/{workspace_id}/...

Webhooks are prefixed with:
    /api/v1/webhooks/...

Feature: Notifications & Communication Microservice
Task: T030 - Create API router init with all routes
"""

from fastapi import APIRouter

from src.api.v1.notifications import router as notifications_router
from src.api.v1.preferences import router as preferences_router
from src.api.v1.templates import router as templates_router
from src.api.v1.webhooks import router as webhooks_router

# Create the main API v1 router
# Note: Individual routers already have their full prefix paths:
# - notifications: /api/v1/workspaces/{workspace_id}/notifications
# - preferences: /api/v1/workspaces/{workspace_id}/preferences
# - templates: /api/v1/workspaces/{workspace_id}/templates
# - webhooks: /api/v1/webhooks
#
# We include them without additional prefix since they define their own paths
router = APIRouter()

# =============================================================================
# Workspace-scoped endpoints (require authentication)
# =============================================================================

# Notification endpoints: send, list, get, cancel, retry, stats
router.include_router(
    notifications_router,
    tags=["notifications"],
)

# Preference endpoints: user preferences, workspace defaults, unsubscribe
router.include_router(
    preferences_router,
    tags=["preferences"],
)

# Template endpoints: CRUD, versioning, rendering, preview
router.include_router(
    templates_router,
    tags=["templates"],
)

# =============================================================================
# Provider webhooks (no auth, signature verification)
# =============================================================================

# Webhook endpoints: SendGrid callbacks, delivery status updates
router.include_router(
    webhooks_router,
    tags=["webhooks"],
)


# =============================================================================
# Module Exports
# =============================================================================

__all__ = [
    "router",
    "notifications_router",
    "preferences_router",
    "templates_router",
    "webhooks_router",
]
