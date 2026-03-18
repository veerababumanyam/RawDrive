"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.version import router as version_router
from app.api.v1.users import router as users_router
from app.api.v1.workspaces import router as workspaces_router
from app.api.v1.billing import router as billing_router
from app.api.v1.health import router as health_router
from app.api.v1.roles import router as roles_router
from app.api.v1.admin import router as admin_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.config import router as config_router
# from app.api.v1.galleries import router as galleries_router  # Moved to gallery-service
from app.api.v1.gallery_assets import router as gallery_assets_router  # Re-enabled for asset operations
from app.api.v1.media import router as media_router
from app.api.v1.uploads import router as uploads_router
from app.api.v1.websocket import router as websocket_router
from app.api.v1.recycle_bin import router as recycle_bin_router
# from app.api.v1.clients import router as clients_router  # Moved to client-service
from app.api.v1.client_avatars import router as client_avatars_router  # Avatar endpoints stay in backend
from app.api.v1.tags import router as tags_router
from app.api.v1.comments import router as comments_router
from app.api.v1.people import router as people_router
from app.api.v1.search import router as search_router
from app.api.v1.geo_search import router as geo_search_router

from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.company_profile import router as company_profile_router
from app.api.v1.company_profile import public_router as public_profile_router
from app.api.v1.personal_profile import router as personal_profile_router
from app.api.v1.personal_profile import public_router as public_personal_profile_router
from app.api.v1.personal_profile_ai import router as personal_profile_ai_router
from app.api.v1.public_galleries import router as public_galleries_router  # Re-enabled for public access
from app.api.v1.profile_editor import router as profile_editor_router
from app.api.v1.profile_editor import public_router as themes_router
from app.api.v1.faces import router as faces_router
from app.api.v1.face_groups import router as face_groups_router
from app.api.v1.biometric_consent import router as biometric_consent_router
from app.api.v1.face_retention import router as face_retention_router
from app.api.v1.face_rate_limits import router as face_rate_limits_router
from app.api.v1.magic_links import router as magic_links_router
from app.api.v1.magic_links import public_router as public_magic_links_router
from app.api.v1.shared import router as shared_router
from app.api.v1.storage import router as storage_router
# from app.api.v1.smart_tagging import router as smart_tagging_router  # Moved to ai-service microservice
from app.api.v1.curation_sessions import router as curation_sessions_router
from app.api.v1.culling_workflow import router as culling_workflow_router
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
from app.api.v1.i18n import router as i18n_router
from app.api.v1.invitations import router as invitations_router
# Temporarily commented out until all invitation types are generated
# Moved to invitations-service microservice:
# from app.api.v1.digital_invitations import router as digital_invitations_router
# from app.api.v1.public_invitations import router as public_invitations_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(version_router)
router.include_router(config_router)  # Central config service for microservices
router.include_router(users_router)
router.include_router(workspaces_router)
router.include_router(billing_router)
router.include_router(health_router)
router.include_router(roles_router)
router.include_router(admin_router)
router.include_router(tasks_router)
# router.include_router(
#     galleries_router,
#     prefix="/api/v1/workspaces/{workspace_id}/galleries",
#     tags=["galleries"],
# )
# Re-enabled gallery_assets_router for workspace-scoped asset operations
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
# router.include_router(  # Moved to client-service
#     clients_router,
#     prefix="/api/v1/workspaces/{workspace_id}/clients",
#     tags=["clients"],
# )
# Client avatar endpoints remain in backend (requires asset processing)
router.include_router(
    client_avatars_router,
    prefix="/api/v1/workspaces/{workspace_id}/clients",
    tags=["client-avatars"],
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

# GEO (Generative Engine Optimization) Search routes
# Natural language photo search using query parsing, metadata matching, and vector similarity
router.include_router(
    geo_search_router,
    prefix="/api/v1/workspaces/{workspace_id}/geo",
    tags=["geo-search"],
)

router.include_router(
    public_profile_router,
    prefix="/api/v1/public/profiles",
    tags=["public-profiles"],
)

# Personal Profile routes (Digital Visiting Cards)
# Workspace-scoped endpoints for managing personal photographer profiles
router.include_router(
    personal_profile_router,
    prefix="/api/v1/workspaces/{workspace_id}/personal-profiles",
    tags=["personal-profiles"],
)
# Public endpoints for viewing personal profiles at /u/{slug}
router.include_router(
    public_personal_profile_router,
    prefix="/api/v1/public/personal-profiles",
    tags=["public-personal-profiles"],
)
# Personal Profile AI routes (AI-powered content generation)
router.include_router(
    personal_profile_ai_router,
    prefix="/api/v1/workspaces/{workspace_id}/personal-profiles",
    tags=["personal-profile-ai"],
)
# Re-enabled public_galleries_router for password/PIN verification and public access
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
# Biometric Consent routes (002-face-audit-remediation COM-001)
# GDPR Article 9 compliant biometric consent management
router.include_router(biometric_consent_router, tags=["biometric-consent"])

# Face Retention routes (002-face-audit-remediation COM-002)
# Face data retention policy enforcement and job management
router.include_router(face_retention_router, tags=["face-retention"])

# Face Rate Limits routes (002-face-audit-remediation SEC-001)
# Configurable per-workspace rate limits for face operations
router.include_router(face_rate_limits_router, tags=["face-rate-limits"])

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

# #region agent log
import json
try:
    with open(r'c:\Users\admin\Desktop\RawDrive\.cursor\debug.log', 'a', encoding='utf-8') as f:
        f.write(json.dumps({
            "location": "backend/src/app/api/v1/__init__.py:189",
            "message": "Smart tagging routes moved to ai-service - router removed from backend",
            "data": {"smart_tagging_in": "ai-service", "routed_via_traefik": True, "hypothesisId": "A"},
            "timestamp": int(__import__('time').time() * 1000),
            "sessionId": "debug-session",
            "runId": "post-fix"
        }) + '\n')
except Exception:
    pass
# #endregion agent log

# Smart Tagging routes (AI-powered content analysis) - Moved to ai-service microservice
# router.include_router(
#     smart_tagging_router,
#     prefix="/api/v1/workspaces/{workspace_id}/smart-tagging",
#     tags=["smart-tagging"],
# )

# Curation Sessions routes (023-enhanced-smart-curate)
# AI-powered photo culling and curation workflow
router.include_router(
    curation_sessions_router,
    prefix="/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/curation-sessions",
    tags=["curation-sessions"],
)

# Culling Workflow routes (Bulk Photo Culling)
# AI-powered bulk photo culling with quality scoring integration
router.include_router(
    culling_workflow_router,
    prefix="/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/culling",
    tags=["culling-workflow"],
)

# Subscription management routes (006-user-profile-sidebar)
router.include_router(subscription_router)
# router.include_router(subscription_plans_router)  # Moved to billing-service
router.include_router(subscription_webhook_router)

# Gemini Settings routes (per-user AI configuration)
router.include_router(gemini_settings_router)

# Gemini Models catalogue route (T023)
router.include_router(gemini_models_router)

# Admin Gemini Models route (T039 - admin catalogue management)
router.include_router(admin_gemini_models_router)

# AI Provider Settings routes (Unified AI Provider Settings)
# Per-user API credentials for Cloud Vision, Gemini, Video Intelligence, OpenAI
from app.api.v1.ai_provider_settings import router as ai_provider_settings_router
router.include_router(ai_provider_settings_router)

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

# Internationalization routes (Localization & Regional Features)
# Language preference management, locale resolution, and supported languages API
router.include_router(i18n_router)

# Team Member Invitations routes (Team Management & Multi-User Workspaces)
# Public endpoints for accepting and previewing workspace member invitations
# Includes: GET /invitations/{token} (preview), POST /invitations/accept (accept)
router.include_router(invitations_router)

# Public Invitations routes - MOVED TO invitations-service microservice
# Public endpoints for guest access to invitations and RSVP submission
from app.api.v1.public_invitations_proxy import router as public_invitations_proxy_router

router.include_router(
    public_invitations_proxy_router,
    prefix="/api/v1/public/invitations",
    tags=["public-invitations"],
)

# from app.api.v1.invitation_media import router as invitation_media_router  # Temporarily disabled
# router.include_router(  # Temporarily disabled
#     invitation_media_router,  # Temporarily disabled
#     prefix="/api/v1/workspaces/{workspace_id}/digital-invitations",  # Temporarily disabled
#     tags=["invitation-media"],  # Temporarily disabled
# )  # Temporarily disabled

# from app.api.v1.invitation_ai import router as invitation_ai_router  # Temporarily disabled
# router.include_router(  # Temporarily disabled
#     invitation_ai_router,  # Temporarily disabled
#     prefix="/api/v1/workspaces/{workspace_id}/digital-invitations",  # Temporarily disabled
#     tags=["invitation-ai"],  # Temporarily disabled
# )  # Temporarily disabled

# from app.api.v1.invitation_sub_events import router as invitation_sub_events_router  # Temporarily disabled
# router.include_router(  # Temporarily disabled
#     invitation_sub_events_router,  # Temporarily disabled
#     prefix="/api/v1/workspaces/{workspace_id}/digital-invitations/{invitation_id}/sub-events",  # Temporarily disabled
#     tags=["invitation-sub-events"],  # Temporarily disabled
# )  # Temporarily disabled

from app.api.v1.image_generation import router as image_generation_router
router.include_router(
    image_generation_router,
    prefix="/api/v1/image-generation",
    tags=["image-generation"],
)

# from app.api.v1.invitation_exports import router as invitation_exports_router  # Temporarily disabled
# router.include_router(  # Temporarily disabled
#     invitation_exports_router,  # Temporarily disabled
#     prefix="/api/v1/workspaces/{workspace_id}/digital-invitations/{invitation_id}/exports",  # Temporarily disabled
#     tags=["invitation-exports"],  # Temporarily disabled
# )  # Temporarily disabled

# from app.api.v1.invitation_analytics import router as invitation_analytics_router  # Temporarily disabled
# router.include_router(  # Temporarily disabled
#     invitation_analytics_router,  # Temporarily disabled
#     prefix="/api/v1/workspaces/{workspace_id}/digital-invitations/{invitation_id}/analytics",  # Temporarily disabled
#     tags=["invitation-analytics"],  # Temporarily disabled
# )  # Temporarily disabled

# Event Analytics Views routes (api-analytics-views)
# Comprehensive analytics endpoint with 10-minute caching for view counts,
# unique visitors, device breakdown, geographic distribution, and RSVP rates
from app.api.v1.event_analytics_views import router as event_analytics_views_router
# router.include_router(  # Temporarily disabled
#     event_analytics_views_router,  # Temporarily disabled
#     prefix="/api/v1/workspaces/{workspace_id}/digital-invitations/{invitation_id}/analytics",  # Temporarily disabled
#     tags=["event-analytics-views"],  # Temporarily disabled
# )  # Temporarily disabled

# Invitations Microservice Proxy Routes
# ALL invitation-related routes are now proxied to the invitations-service microservice
# This includes: CRUD, templates, drafts, exports, media, fonts, sub-events, AI integrations
from app.api.v1.invitations_proxy_router import router as invitations_proxy_router

router.include_router(
    invitations_proxy_router,
    prefix="/api/v1/workspaces/{workspace_id}/digital-invitations",
    tags=["digital-invitations", "invitation-templates", "invitation-exports", "invitation-media", "invitation-fonts", "invitation-sub-events", "invitation-ai"],
)

# NOTE: The following routes have been moved to invitations-service microservice:
# - digital_invitations_router (invitation CRUD)
# - invitation_templates_router (template management)
# - invitation_exports, invitation_media, invitation_fonts, invitation_sub_events, invitation_ai
# All requests are now proxied via invitations_proxy_router above

# Engagement Scoring routes (Automated Engagement Scoring System)
# Tracks client interaction patterns and provides predictive scoring
from app.api.v1.engagement import router as engagement_router
router.include_router(
    engagement_router,
    prefix="/api/v1/workspaces/{workspace_id}/engagement",
    tags=["engagement-scoring"],
)

# Churn Prevention routes (Automated Churn Prediction and Prevention System)
# ML-based churn prediction, intervention campaigns, A/B testing
from app.api.v1.churn_prevention import router as churn_prevention_router
router.include_router(
    churn_prevention_router,
    prefix="/api/v1/workspaces/{workspace_id}/churn-prevention",
    tags=["churn-prevention"],
)

# Collaborative Editing routes
# Real-time multi-user gallery editing with presence, actions, and conflict resolution
from app.api.v1.collaboration import router as collaboration_router
router.include_router(collaboration_router, tags=["collaboration"])

# Calendar & Booking Management routes (Calendar Integrations & Booking Management feature)
# Booking management for photographers
from app.api.v1.bookings import router as bookings_router
router.include_router(
    bookings_router,
    prefix="/api/v1/workspaces/{workspace_id}/bookings",
    tags=["bookings"],
)

# Service Types management
from app.api.v1.service_types import router as service_types_router
router.include_router(
    service_types_router,
    prefix="/api/v1/workspaces/{workspace_id}/service-types",
    tags=["service-types"],
)

# Public Booking routes (no auth required for client self-service)
from app.api.v1.public_bookings import router as public_bookings_router
router.include_router(
    public_bookings_router,
    prefix="/api/v1/public/book",
    tags=["public-booking"],
)

# Asset Cleanup routes (Automatic Asset Cleanup feature)
# Storage optimization with duplicate detection and cleanup recommendations
from app.api.v1.cleanup import router as cleanup_router
router.include_router(
    cleanup_router,
    prefix="/api/v1/workspaces/{workspace_id}/cleanup",
    tags=["asset-cleanup"],
)

# Gallery Export routes (Multi-format Gallery Export feature)
# ZIP archives, PDF albums, slideshows, and cloud sync
from app.api.v1.gallery_exports import router as gallery_exports_router
router.include_router(
    gallery_exports_router,
    prefix="/api/v1/workspaces/{workspace_id}",
    tags=["gallery-exports"],
)

# Granular Permissions routes (Expanded RBAC feature)
# Conditional permissions, time-based access, role audit trails
from app.api.v1.permissions import router as permissions_router
router.include_router(permissions_router)

# Audit Logs routes (Audit & Compliance System)
# Query, search, and export audit log entries for compliance
from app.api.v1.audit_logs import router as audit_logs_router
router.include_router(
    audit_logs_router,
    prefix="/api/v1/workspaces/{workspace_id}/audit-logs",
    tags=["audit-logs"],
)

# Data Subject Requests routes (Audit & Compliance System)
# GDPR/CCPA/DPDP data subject request management
from app.api.v1.compliance import router as compliance_router
router.include_router(
    compliance_router,
    prefix="/api/v1/workspaces/{workspace_id}/compliance/data-subject-requests",
    tags=["data-subject-requests"],
)

# Legal Holds routes (Audit & Compliance System)
# Legal hold management for litigation and compliance
from app.api.v1.legal_holds import router as legal_holds_router
router.include_router(
    legal_holds_router,
    prefix="/api/v1/workspaces/{workspace_id}/legal-holds",
    tags=["legal-holds"],
)

# Incidents routes (Audit & Compliance System)
# Security incident and data breach management
from app.api.v1.incidents import router as incidents_router
router.include_router(
    incidents_router,
    prefix="/api/v1/workspaces/{workspace_id}/incidents",
    tags=["incidents"],
)

# Analytics & Reporting routes (Analytics & Reporting feature)
# Comprehensive workspace analytics: dashboard metrics, gallery/client analytics,
# custom reports, and data exports
from app.api.v1.analytics import router as analytics_router
router.include_router(
    analytics_router,
    prefix="/api/v1/workspaces/{workspace_id}/analytics",
    tags=["analytics"],
)

# AI Duplicate Detection routes (Phase 2: AI Duplicate Detection)
# Photo duplicate detection using perceptual hashing
# Client duplicate detection using Gemini semantic embeddings
# Duplicate group management (confirm/dismiss)
from app.api.v1.ai_duplicates import router as ai_duplicates_router
router.include_router(
    ai_duplicates_router,
    prefix="/api/v1/workspaces/{workspace_id}",
    tags=["ai-duplicates"],
)

# Agent API Keys routes (Phase 4: Google A2A ADKS Integration)
# API key management for external agent authentication
# Service-to-service authentication and authorization
from app.api.v1.agent_api_keys import router as agent_api_keys_router
router.include_router(agent_api_keys_router)

# CDN Key Sync routes (Phase 3: Edge Decryption CDN)
# Admin endpoints for syncing workspace encryption keys to Cloudflare Workers KV
# Enables edge decryption while maintaining full encryption at rest
from app.api.v1.cdn_keys import router as cdn_keys_router
router.include_router(cdn_keys_router)

# SEO routes (Sitemap and Search Console integration)
# Public sitemap.xml endpoint for search engine crawlers
# Search Console integration for workspace indexing management
from app.api.v1.sitemap import router as sitemap_router
from app.api.v1.search_console import router as search_console_router
router.include_router(sitemap_router, tags=["seo"])
router.include_router(
    search_console_router,
    prefix="/api/v1/workspaces/{workspace_id}",
    tags=["seo"],
)

# Album Proofing routes (026-album-proofing)
# Album management, versioning, comments, and export rendering
from app.api.v1.albums import router as albums_router
from app.api.v1.public_albums import router as public_albums_router
router.include_router(
    albums_router,
    prefix="/api/v1/workspaces/{workspace_id}/albums",
    tags=["albums"],
)
# Public album proofing endpoints for client review and approval
router.include_router(
    public_albums_router,
    prefix="/api/v1/public/albums",
    tags=["public-albums"],
)

# Gallery Design Template routes (Enhancement 3 - Custom Templates)
# Template management for reusable Gallery Design Studio configurations
# Supports system templates and workspace-specific custom templates
from app.api.v1.gallery_design_templates import router as gallery_design_templates_router
router.include_router(
    gallery_design_templates_router,
    tags=["gallery-design-templates"],
)

# Portfolio Recommendations routes (AI Portfolio Recommendation Engine)
# AI-powered portfolio recommendations using CLIP embeddings, engagement scoring,
# client preference learning, and A/B testing for algorithm optimization
from app.api.v1.portfolio_recommendations import router as portfolio_recommendations_router
router.include_router(
    portfolio_recommendations_router,
    prefix="/api/v1/workspaces/{workspace_id}/portfolio-recommendations",
    tags=["portfolio-recommendations"],
)

# Album Collaboration routes (Real-time Collaborative Album Design)
# Multi-user album editing with CRDT-based conflict resolution, presence tracking,
# version history with rollback, and commenting with @mentions
from app.api.v1.album_collaboration import router as album_collaboration_router
router.include_router(
    album_collaboration_router,
    prefix="/api/v1/workspaces/{workspace_id}",
    tags=["album-collaboration"],
)

# Postal webhook endpoint (Phase 02: Email Infrastructure)
# Receives delivery status callbacks from self-hosted Postal mail server
from app.api.v1.webhooks.postal_webhook import router as postal_webhook_router
router.include_router(
    postal_webhook_router,
    prefix="/api/v1",
    tags=["webhooks"],
)

