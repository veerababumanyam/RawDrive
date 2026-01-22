"""
Sync API Key Endpoints
CRUD operations for managing desktop sync API keys.
Feature: 029-pro-review-xmp-sync
Task: T058

These endpoints are authenticated via JWT (regular user auth) and allow
users to manage their sync API keys for the desktop application.

Endpoints:
- POST /sync/keys - Create a new API key
- GET /sync/keys - List user's API keys
- GET /sync/keys/{key_id} - Get a specific key
- PATCH /sync/keys/{key_id} - Update a key
- DELETE /sync/keys/{key_id} - Revoke a key
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query

from src.middleware.auth import get_current_user, get_workspace_id
from src.services.sync_key_service import (
    get_sync_key_service,
    SyncKeyService,
    SyncKeyNotFoundError,
    SyncKeyError,
)
from src.schemas.sync_api_key import (
    SyncApiKeyCreateRequest,
    SyncApiKeyUpdateRequest,
    SyncApiKeyResponse,
    SyncApiKeyCreateResponse,
    SyncApiKeyListResponse,
    SyncKeyPermission,
)
from src.log_config import get_logger

logger = get_logger(__name__)
router = APIRouter()


def get_service() -> SyncKeyService:
    """Dependency to get sync key service."""
    return get_sync_key_service()


@router.post(
    "/sync/keys",
    response_model=SyncApiKeyCreateResponse,
    summary="Create a new sync API key",
    description="""
    Creates a new API key for desktop sync application.

    The full API key is returned ONLY in this response and cannot be
    retrieved later. Make sure to save it securely.

    Permissions:
    - read: View galleries and assets
    - write: Update metadata (rating, flag, color_label)
    - export: Export XMP files
    - import: Import XMP files
    """,
    tags=["sync-keys"],
)
async def create_sync_key(
    request: SyncApiKeyCreateRequest,
    user: dict = Depends(get_current_user),
    workspace_id: str = Depends(get_workspace_id),
    service: SyncKeyService = Depends(get_service),
) -> SyncApiKeyCreateResponse:
    """Create a new sync API key."""
    user_id = user.get("user_id") or user.get("sub")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        result = await service.create_key(
            workspace_id=workspace_id,
            user_id=user_id,
            name=request.name,
            scoped_gallery_ids=request.scoped_gallery_ids,
            permissions=request.permissions,
            expires_in_days=request.expires_in_days,
        )

        logger.info(
            "Sync API key created",
            extra={
                "key_id": result["key_id"],
                "workspace_id": workspace_id,
                "user_id": user_id,
                "key_prefix": result["key_prefix"],
            },
        )

        return SyncApiKeyCreateResponse(**result)

    except Exception as e:
        logger.error(f"Failed to create sync key: {e}")
        raise HTTPException(status_code=500, detail="Failed to create API key")


@router.get(
    "/sync/keys",
    response_model=SyncApiKeyListResponse,
    summary="List sync API keys",
    description="List all sync API keys for the current workspace. Optionally filter by user or include revoked keys.",
    tags=["sync-keys"],
)
async def list_sync_keys(
    include_revoked: bool = Query(False, description="Include revoked keys"),
    user_only: bool = Query(False, description="Only show keys created by current user"),
    user: dict = Depends(get_current_user),
    workspace_id: str = Depends(get_workspace_id),
    service: SyncKeyService = Depends(get_service),
) -> SyncApiKeyListResponse:
    """List sync API keys for the workspace."""
    user_id = user.get("user_id") or user.get("sub")

    try:
        keys = await service.list_keys(
            workspace_id=workspace_id,
            user_id=user_id if user_only else None,
            include_revoked=include_revoked,
        )

        return SyncApiKeyListResponse(
            data=[SyncApiKeyResponse(**k) for k in keys],
            total=len(keys),
        )

    except Exception as e:
        logger.error(f"Failed to list sync keys: {e}")
        raise HTTPException(status_code=500, detail="Failed to list API keys")


@router.get(
    "/sync/keys/{key_id}",
    response_model=SyncApiKeyResponse,
    summary="Get a sync API key",
    description="Get details of a specific sync API key. The full key value is never returned.",
    tags=["sync-keys"],
)
async def get_sync_key(
    key_id: str,
    user: dict = Depends(get_current_user),
    workspace_id: str = Depends(get_workspace_id),
    service: SyncKeyService = Depends(get_service),
) -> SyncApiKeyResponse:
    """Get a specific sync API key."""
    try:
        key = await service.get_key(workspace_id=workspace_id, key_id=key_id)
        return SyncApiKeyResponse(**key)

    except SyncKeyNotFoundError:
        raise HTTPException(status_code=404, detail="API key not found")
    except Exception as e:
        logger.error(f"Failed to get sync key: {e}")
        raise HTTPException(status_code=500, detail="Failed to get API key")


@router.patch(
    "/sync/keys/{key_id}",
    response_model=SyncApiKeyResponse,
    summary="Update a sync API key",
    description="Update the name, permissions, or gallery scope of an API key.",
    tags=["sync-keys"],
)
async def update_sync_key(
    key_id: str,
    request: SyncApiKeyUpdateRequest,
    user: dict = Depends(get_current_user),
    workspace_id: str = Depends(get_workspace_id),
    service: SyncKeyService = Depends(get_service),
) -> SyncApiKeyResponse:
    """Update a sync API key."""
    try:
        key = await service.update_key(
            workspace_id=workspace_id,
            key_id=key_id,
            name=request.name,
            scoped_gallery_ids=request.scoped_gallery_ids,
            permissions=request.permissions,
        )

        logger.info(
            "Sync API key updated",
            extra={
                "key_id": key_id,
                "workspace_id": workspace_id,
            },
        )

        return SyncApiKeyResponse(**key)

    except SyncKeyNotFoundError:
        raise HTTPException(status_code=404, detail="API key not found")
    except Exception as e:
        logger.error(f"Failed to update sync key: {e}")
        raise HTTPException(status_code=500, detail="Failed to update API key")


@router.delete(
    "/sync/keys/{key_id}",
    response_model=SyncApiKeyResponse,
    summary="Revoke a sync API key",
    description="Revoke (soft delete) a sync API key. The key will no longer be valid for authentication.",
    tags=["sync-keys"],
)
async def revoke_sync_key(
    key_id: str,
    user: dict = Depends(get_current_user),
    workspace_id: str = Depends(get_workspace_id),
    service: SyncKeyService = Depends(get_service),
) -> SyncApiKeyResponse:
    """Revoke a sync API key."""
    user_id = user.get("user_id") or user.get("sub")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user token")

    try:
        key = await service.revoke_key(
            workspace_id=workspace_id,
            key_id=key_id,
            revoked_by_user_id=user_id,
        )

        logger.info(
            "Sync API key revoked",
            extra={
                "key_id": key_id,
                "workspace_id": workspace_id,
                "revoked_by": user_id,
            },
        )

        return SyncApiKeyResponse(**key)

    except SyncKeyNotFoundError:
        raise HTTPException(status_code=404, detail="API key not found")
    except Exception as e:
        logger.error(f"Failed to revoke sync key: {e}")
        raise HTTPException(status_code=500, detail="Failed to revoke API key")
