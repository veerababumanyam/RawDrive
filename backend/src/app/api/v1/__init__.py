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

router = APIRouter()
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(workspaces_router)
router.include_router(billing_router)
router.include_router(health_router)
router.include_router(roles_router)
router.include_router(admin_router)
router.include_router(tasks_router)
