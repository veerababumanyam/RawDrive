"""API v1 endpoints for AI Processing Service.

Aggregates all v1 API routers.
"""

from fastapi import APIRouter

from api.v1.faces import router as faces_router
from api.v1.embeddings import router as embeddings_router
from api.v1.clustering import router as clustering_router

router = APIRouter()

# Face detection and embedding endpoints
router.include_router(
    faces_router,
    prefix="/faces",
    tags=["faces"],
)

# CLIP embedding endpoints
router.include_router(
    embeddings_router,
    prefix="/embed",
    tags=["embeddings"],
)

# DBSCAN clustering endpoints
router.include_router(
    clustering_router,
    prefix="/clustering",
    tags=["clustering"],
)

__all__ = ["router"]
