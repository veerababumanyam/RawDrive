# Public API endpoints (no auth required)
from fastapi import APIRouter

from src.api.v1.public.galleries import router as galleries_router
from src.api.v1.public.proofing import router as proofing_router
from src.api.v1.public.magic_links import router as magic_links_router

router = APIRouter()

router.include_router(galleries_router, prefix="/galleries", tags=["public-galleries"])
router.include_router(proofing_router, prefix="/galleries", tags=["public-proofing"])
router.include_router(magic_links_router, prefix="/magic-links", tags=["public-magic-links"])

__all__ = ["router"]
