"""
API v1 router aggregation.

Combines all v1 endpoint routers into a single router for the application.
"""

from fastapi import APIRouter

# Import routers from endpoint modules (will be created in subsequent phases)
from src.api.v1.clients import router as clients_router
from src.api.v1.contacts import router as contacts_router
from src.api.v1.addresses import router as addresses_router
from src.api.v1.tags import router as tags_router
from src.api.v1.galleries import router as galleries_router
from src.api.v1.activities import router as activities_router
from src.api.v1.communications import router as communications_router
from src.api.v1.smart_lists import router as smart_lists_router
from src.api.v1.bulk_ops import router as bulk_ops_router
from src.api.v1.import_export import router as import_export_router
from src.api.v1.duplicates import router as duplicates_router
from src.api.v1.visitors import router as visitors_router
from src.api.v1.analytics import router as analytics_router
from src.api.v1.gdpr import router as gdpr_router

# Create main API v1 router
router = APIRouter()

# Include all endpoint routers (will be uncommented as they are implemented)
# NOTE: Analytics router must come before clients_router to avoid route matching conflicts
# The clients_router has /{client_id} which would catch /analytics paths otherwise
router.include_router(analytics_router)
router.include_router(clients_router)
router.include_router(contacts_router)
router.include_router(addresses_router)
router.include_router(tags_router)
router.include_router(galleries_router)
router.include_router(activities_router)
router.include_router(communications_router)
router.include_router(smart_lists_router)
router.include_router(import_export_router)
router.include_router(bulk_ops_router, prefix="/workspaces/{workspace_id}/clients/bulk", tags=["bulk-operations"])
router.include_router(duplicates_router)
router.include_router(visitors_router)
router.include_router(gdpr_router)


# Temporary ping endpoint to verify service is running
@router.get("/ping")
async def ping():
    """Temporary ping endpoint for testing."""
    return {"message": "pong", "service": "client-service"}
