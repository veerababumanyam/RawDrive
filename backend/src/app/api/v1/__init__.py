"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.workspaces import router as workspaces_router
from app.api.v1.billing import router as billing_router
from app.api.v1.health import router as health_router
from app.api.v1.roles import router as roles_router
from app.api.v1.admin import router as admin_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.galleries import router as galleries_router
from app.api.v1.gallery_assets import router as gallery_assets_router
from app.api.v1.media import router as media_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.websocket import router as websocket_router
from app.api.v1.recycle_bin import router as recycle_bin_router
from app.api.v1.clients import router as clients_router
from app.api.v1.tags import router as tags_router
from app.api.v1.comments import router as comments_router
from app.api.v1.people import router as people_router
from app.api.v1.search import router as search_router

from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.company_profile import router as company_profile_router
from app.api.v1.company_profile import public_router as public_profile_router
from app.api.v1.public_galleries import router as public_galleries_router
from app.api.v1.profile_editor import router as profile_editor_router
from app.api.v1.profile_editor import public_router as themes_router
from app.api.v1.faces import router as faces_router
from app.api.v1.face_groups import router as face_groups_router
from app.api.v1.magic_links import router as magic_links_router
from app.api.v1.magic_links import public_router as public_magic_links_router
from app.api.v1.shared import router as shared_router
from app.api.v1.storage import router as storage_router
from app.api.v1.smart_tagging import router as smart_tagging_router
from app.api.v1.curation_sessions import router as curation_sessions_router
from app.api.v1.subscription import (
    router as subscription_router,
    plans_router as subscription_plans_router,
    webhook_router as subscription_webhook_router,
)
from app.api.v1.gemini_settings import router as gemini_settings_router
from app.api.v1.gemini_settings import models_router as gemini_models_router
from app.api.v1.admin_gemini_models import router as admin_gemini_models_router
from app.api.v1.client_favorites import router as client_favorites_router
from app.api.v1.favorites_analytics import router as favorites_analytics_router
from app.api.v1.digital_invitations import router as digital_invitations_router
from app.api.v1.public_invitations import router as public_invitations_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(workspaces_router)
router.include_router(billing_router)
router.include_router(health_router)
router.include_router(roles_router)
router.include_router(admin_router)
router.include_router(tasks_router)
router.include_router(
    galleries_router,
    prefix="/api/v1/workspaces/{workspace_id}/galleries",
    tags=["galleries"],
)
router.include_router(
    gallery_assets_router,
    prefix="/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets",
    tags=["gallery-assets"],
)
# Media router is intentionally mounted at two prefixes (route aliasing):
# 1. /api/v1/media - Public media streaming (thumbnails, previews)
# 2. /api/v1/workspaces/{workspace_id}/assets - Workspace-scoped asset operations
# This allows semantic flexibility: public access via /media, scoped access via /assets
router.include_router(media_router, prefix="/api/v1/media", tags=["media"])
router.include_router(
    media_router,
    prefix="/api/v1/workspaces/{workspace_id}/assets",
    tags=["workspace-assets"],
)
router.include_router(
    uploads_router,
    prefix="/api/v1/workspaces/{workspace_id}/uploads",
    tags=["uploads"],
)
router.include_router(websocket_router, tags=["websocket"])
router.include_router(
    recycle_bin_router,
    prefix="/api/v1/workspaces/{workspace_id}/recycle-bin",
    tags=["recycle-bin"],
)
router.include_router(
    dashboard_router,
    prefix="/api/v1/workspaces/{workspace_id}/dashboard",
    tags=["dashboard"],
)
router.include_router(
    clients_router,
    prefix="/api/v1/workspaces/{workspace_id}/clients",
    tags=["clients"],
)
router.include_router(
    tags_router,
    prefix="/api/v1/workspaces/{workspace_id}/tags",
    tags=["tags"],
)
router.include_router(
    comments_router,
    prefix="/api/v1/workspaces/{workspace_id}/comments",
    tags=["comments"],
)
router.include_router(
    company_profile_router,
    prefix="/api/v1/workspaces/{workspace_id}/company-profile",
    tags=["company-profile"],
)
router.include_router(
    people_router,
    prefix="/api/v1/workspaces/{workspace_id}/people",
    tags=["people"],
)
router.include_router(
    search_router,
    prefix="/api/v1/workspaces/{workspace_id}/search",
    tags=["search"],
)

router.include_router(
    public_profile_router,
    prefix="/api/v1/public/profiles",
    tags=["public-profiles"],
)
router.include_router(
    public_galleries_router,
    prefix="/api/v1/public/galleries",
    tags=["public-galleries"],
)
router.include_router(
    profile_editor_router,
    prefix="/api/v1/workspaces/{workspace_id}/profile-editor",
    tags=["profile-editor"],
)
router.include_router(
    themes_router,
    prefix="/api/v1/themes",
    tags=["themes"],
)
router.include_router(
    faces_router,
    prefix="/api/v1",
    tags=["faces"],
)
router.include_router(
    face_groups_router,
    prefix="/api/v1",
    tags=["face-groups"],
)

from app.api.v1.admin_ai_providers import router as admin_ai_providers_router
router.include_router(admin_ai_providers_router)

# Magic Links routes
router.include_router(
    magic_links_router,
    prefix="/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/magic-links",
    tags=["magic-links"],
)
router.include_router(
    public_magic_links_router,
    prefix="/api/v1/public/magic-links",
    tags=["public-magic-links"],
)

# Shared Dashboard routes (Security & Sharing Dashboard)
router.include_router(
    shared_router,
    prefix="/api/v1/workspaces/{workspace_id}/shared",
    tags=["shared-dashboard"],
)

# Storage routes
router.include_router(storage_router)

# Smart Tagging routes (AI-powered content analysis)
router.include_router(
    smart_tagging_router,
    prefix="/api/v1/workspaces/{workspace_id}/smart-tagging",
    tags=["smart-tagging"],
)

# Curation Sessions routes (023-enhanced-smart-curate)
# AI-powered photo culling and curation workflow
router.include_router(
    curation_sessions_router,
    prefix="/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/curation-sessions",
    tags=["curation-sessions"],
)

# Subscription management routes (006-user-profile-sidebar)
router.include_router(subscription_router)
router.include_router(subscription_plans_router)
router.include_router(subscription_webhook_router)

# Gemini Settings routes (per-user AI configuration)
router.include_router(gemini_settings_router)

# Gemini Models catalogue route (T023)
router.include_router(gemini_models_router)

# Admin Gemini Models route (T039 - admin catalogue management)
router.include_router(admin_gemini_models_router)

# Client Favorites routes (012-client-favorites)
# Public endpoints for gallery visitors to manage their favorites
router.include_router(
    client_favorites_router,
    prefix="/api/v1/public/galleries/{gallery_id}/favorites",
    tags=["client-favorites"],
)

# Favorites Analytics routes (012-client-favorites US5)
# Private endpoints for photographers to view favorites analytics
router.include_router(
    favorites_analytics_router,
    prefix="/api/v1",
    tags=["favorites-analytics"],
)



# Public Invitations routes (016-save-the-date)
# Public endpoints for guest access to invitations and RSVP submission
router.include_router(
    public_invitations_router,
    prefix="/api/v1/public/invitations",
    tags=["public-invitations"],
)

from app.api.v1.invitation_media import router as invitation_media_router
router.include_router(
    invitation_media_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations",
    tags=["invitation-media"],
)

from app.api.v1.invitation_ai import router as invitation_ai_router
router.include_router(
    invitation_ai_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations",
    tags=["invitation-ai"],
)

from app.api.v1.invitation_sub_events import router as invitation_sub_events_router
router.include_router(
    invitation_sub_events_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations/{invitation_id}/sub-events",
    tags=["invitation-sub-events"],
)

from app.api.v1.image_generation import router as image_generation_router
router.include_router(
    image_generation_router,
    prefix="/api/v1/image-generation",
    tags=["image-generation"],
)

from app.api.v1.invitation_exports import router as invitation_exports_router
router.include_router(
    invitation_exports_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations/{invitation_id}/exports",
    tags=["invitation-exports"],
)

from app.api.v1.invitation_analytics import router as invitation_analytics_router
router.include_router(
    invitation_analytics_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations/{invitation_id}/analytics",
    tags=["invitation-analytics"],
)

# Invitation Templates routes (016-save-the-date)
# CRUD endpoints for managing invitation templates
from app.api.v1.invitation_templates import router as invitation_templates_router
router.include_router(
    invitation_templates_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations",
    tags=["invitation-templates"],
)

# Invitations Microservice Proxy Routes (018-invitations-production-readiness)
# Proxies requests to the dedicated invitations microservice for production-ready features:
# - Guest management with rate limiting
# - RSVP with HMAC-signed edit tokens
# - Analytics with Redis caching
# - Bulk invite with Celery workers
from app.api.v1.invitations_microservice_proxy import router as invitations_microservice_proxy_router
router.include_router(
    invitations_microservice_proxy_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations/{invitation_id}/microservice",
    tags=["invitations-microservice"],
)
# Also add public RSVP proxy routes
router.include_router(
    invitations_microservice_proxy_router,
    prefix="/api/v1/invitations-microservice",
    tags=["invitations-microservice-public"],
)

# Invitation Custom Fonts routes (019-invitation-indian-languages)
# Endpoints for uploading and managing custom fonts for invitations
from app.api.v1.invitation_fonts import router as invitation_fonts_router
router.include_router(
    invitation_fonts_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations/fonts",
    tags=["invitation-fonts"],
)

# Digital Invitations routes (016-save-the-date)
# Host endpoints for managing digital event invitations
# NOTE: Using /digital-invitations to avoid conflict with workspace member invitations
# in workspaces.py which uses /{workspace_id}/invitations
router.include_router(
    digital_invitations_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations",
    tags=["digital-invitations"],
)
