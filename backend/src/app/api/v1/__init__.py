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
router.include_router(
    recycle_bin_router,
    prefix="/api/v1/workspaces/{workspace_id}/recycle-bin",
    tags=["recycle-bin"],
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
