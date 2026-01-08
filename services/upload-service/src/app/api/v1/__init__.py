"""API v1 router aggregation.

This module aggregates all v1 API routes for the upload service.
Routes are prefixed with /v1 and organized by resource type.

Available routes:
- /v1/upload/* - File upload endpoints (TUS protocol)
"""

from fastapi import APIRouter

from app.api.v1.upload import router as upload_router

router = APIRouter(prefix="/v1")

# Upload routes - POST /uploads, PATCH /uploads/{id}/chunks, POST /uploads/{id}/complete, etc.
router.include_router(upload_router, prefix="/uploads", tags=["uploads"])
