"""API v1 endpoints for AI Processing Service.

Aggregates all v1 API routers.
"""

from fastapi import APIRouter

from api.v1.faces import router as faces_router

router = APIRouter()

# Face detection and embedding endpoints
router.include_router(
    faces_router,
    prefix="/faces",
    tags=["faces"],
)

__all__ = ["router"]
