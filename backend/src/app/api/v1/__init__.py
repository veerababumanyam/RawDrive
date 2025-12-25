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
router.include_router(media_router, prefix="/api/v1/media", tags=["media"])
router.include_router(
    media_router,
    prefix="/api/v1/workspaces/{workspace_id}/assets",
    tags=["media"],
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
