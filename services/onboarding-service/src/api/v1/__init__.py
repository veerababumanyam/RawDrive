"""API v1 router."""

from fastapi import APIRouter

from src.api.v1.onboarding import router as onboarding_router

router = APIRouter()

# Include onboarding routes
router.include_router(onboarding_router, prefix="/onboarding", tags=["onboarding"])
