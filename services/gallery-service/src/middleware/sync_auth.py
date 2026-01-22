"""Sync API Key Authentication Middleware for Gallery Service.

Handles authentication for desktop sync applications using API keys
instead of JWT tokens. This is separate from regular JWT auth.

API keys are passed via:
- X-Api-Key header (preferred)
- Authorization: Bearer <api_key> header
"""

from typing import Optional, Dict, Any
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, APIKeyHeader

from src.log_config import get_logger
from src.services.sync_key_service import (
    get_sync_key_service,
    SyncKeyError,
    SyncKeyInvalidError,
    SyncKeyRevokedError,
    SyncKeyExpiredError,
    SyncKeyPermissionDeniedError,
    SyncKeyGalleryScopeError,
)
from src.schemas.sync_api_key import SyncKeyPermission

logger = get_logger(__name__)

# Security schemes
api_key_header = APIKeyHeader(name="X-Api-Key", auto_error=False)
bearer_security = HTTPBearer(auto_error=False)


async def get_api_key_from_request(
    request: Request,
    api_key_header_value: Optional[str] = Security(api_key_header),
    bearer_token: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
) -> Optional[str]:
    """Extract API key from request headers.

    Checks in order:
    1. X-Api-Key header
    2. Authorization: Bearer header (if starts with rds_)

    Args:
        request: FastAPI request
        api_key_header_value: Value from X-Api-Key header
        bearer_token: Value from Authorization header

    Returns:
        API key string or None
    """
    # Try X-Api-Key header first
    if api_key_header_value:
        return api_key_header_value

    # Try Bearer token if it looks like an API key (starts with rds_)
    if bearer_token and bearer_token.credentials.startswith("rds_"):
        return bearer_token.credentials

    return None


async def get_sync_context(
    request: Request,
    api_key_header_value: Optional[str] = Security(api_key_header),
    bearer_token: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
) -> Dict[str, Any]:
    """Authenticate via sync API key and return context.

    This dependency validates the API key and returns the sync context
    containing workspace_id, user_id, permissions, and scoped galleries.

    Use this for endpoints that require sync API key authentication.

    Args:
        request: FastAPI request
        api_key_header_value: Value from X-Api-Key header
        bearer_token: Value from Authorization header

    Returns:
        Dictionary with sync context:
        - key_id: API key ID
        - workspace_id: Workspace ID
        - user_id: User ID who created the key
        - permissions: List of granted permissions
        - scoped_gallery_ids: List of accessible gallery IDs (empty = all)

    Raises:
        HTTPException: If authentication fails
    """
    api_key = await get_api_key_from_request(request, api_key_header_value, bearer_token)

    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key. Provide via X-Api-Key header or Authorization: Bearer header",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )

    try:
        sync_key_service = get_sync_key_service()
        result = await sync_key_service.validate_key(api_key)

        # Store in request state for downstream use
        request.state.sync_context = result
        request.state.api_key = api_key

        return result

    except SyncKeyInvalidError:
        logger.warning(
            "Invalid sync API key",
            extra={"key_prefix": api_key[:12] if len(api_key) >= 12 else api_key},
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )
    except SyncKeyRevokedError:
        logger.warning(
            "Revoked sync API key used",
            extra={"key_prefix": api_key[:12] if len(api_key) >= 12 else api_key},
        )
        raise HTTPException(
            status_code=401,
            detail="This API key has been revoked",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )
    except SyncKeyExpiredError:
        logger.warning(
            "Expired sync API key used",
            extra={"key_prefix": api_key[:12] if len(api_key) >= 12 else api_key},
        )
        raise HTTPException(
            status_code=401,
            detail="This API key has expired",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )
    except SyncKeyError as e:
        logger.error(f"Sync key authentication error: {e}")
        raise HTTPException(status_code=e.status, detail=str(e))


async def require_sync_permission(
    permission: SyncKeyPermission,
    request: Request,
    api_key_header_value: Optional[str] = Security(api_key_header),
    bearer_token: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
) -> Dict[str, Any]:
    """Authenticate and require a specific permission.

    Use this as a dependency factory for endpoints that need specific permissions.

    Example:
        @router.get("/export")
        async def export(
            ctx: dict = Depends(lambda r, h=Security(api_key_header), b=Security(bearer_security):
                require_sync_permission(SyncKeyPermission.EXPORT, r, h, b))
        ):
            ...

    Args:
        permission: Required permission
        request: FastAPI request
        api_key_header_value: Value from X-Api-Key header
        bearer_token: Value from Authorization header

    Returns:
        Sync context dictionary

    Raises:
        HTTPException: If authentication fails or permission denied
    """
    api_key = await get_api_key_from_request(request, api_key_header_value, bearer_token)

    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )

    try:
        sync_key_service = get_sync_key_service()
        result = await sync_key_service.validate_key(
            api_key,
            required_permission=permission,
        )

        request.state.sync_context = result
        request.state.api_key = api_key

        return result

    except SyncKeyPermissionDeniedError as e:
        logger.warning(
            f"Permission denied for sync API key: {permission.value}",
            extra={"key_prefix": api_key[:12] if len(api_key) >= 12 else api_key},
        )
        raise HTTPException(
            status_code=403,
            detail=str(e),
        )
    except SyncKeyInvalidError:
        raise HTTPException(status_code=401, detail="Invalid API key")
    except SyncKeyRevokedError:
        raise HTTPException(status_code=401, detail="This API key has been revoked")
    except SyncKeyExpiredError:
        raise HTTPException(status_code=401, detail="This API key has expired")
    except SyncKeyError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


async def require_gallery_access(
    gallery_id: str,
    permission: Optional[SyncKeyPermission] = None,
    request: Request = None,
    api_key_header_value: Optional[str] = None,
    bearer_token: Optional[HTTPAuthorizationCredentials] = None,
) -> Dict[str, Any]:
    """Authenticate and verify access to a specific gallery.

    Use this to check both API key validity and gallery scope.

    Args:
        gallery_id: Gallery ID to check access for
        permission: Optional permission to require
        request: FastAPI request
        api_key_header_value: Value from X-Api-Key header
        bearer_token: Value from Authorization header

    Returns:
        Sync context dictionary

    Raises:
        HTTPException: If authentication fails or gallery access denied
    """
    api_key = await get_api_key_from_request(request, api_key_header_value, bearer_token)

    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key",
            headers={"WWW-Authenticate": "Bearer, ApiKey"},
        )

    try:
        sync_key_service = get_sync_key_service()
        result = await sync_key_service.validate_key(
            api_key,
            required_permission=permission,
            gallery_id=gallery_id,
        )

        if request:
            request.state.sync_context = result
            request.state.api_key = api_key

        return result

    except SyncKeyGalleryScopeError as e:
        logger.warning(
            f"Gallery access denied for sync API key",
            extra={
                "key_prefix": api_key[:12] if len(api_key) >= 12 else api_key,
                "gallery_id": gallery_id,
            },
        )
        raise HTTPException(
            status_code=403,
            detail=str(e),
        )
    except SyncKeyPermissionDeniedError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except SyncKeyInvalidError:
        raise HTTPException(status_code=401, detail="Invalid API key")
    except SyncKeyRevokedError:
        raise HTTPException(status_code=401, detail="This API key has been revoked")
    except SyncKeyExpiredError:
        raise HTTPException(status_code=401, detail="This API key has expired")
    except SyncKeyError as e:
        raise HTTPException(status_code=e.status, detail=str(e))


# =============================================================================
# Dependency Factories
# =============================================================================


def require_read_permission():
    """Dependency factory for endpoints requiring read permission."""
    async def dependency(
        request: Request,
        api_key_header_value: Optional[str] = Security(api_key_header),
        bearer_token: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
    ) -> Dict[str, Any]:
        return await require_sync_permission(
            SyncKeyPermission.READ, request, api_key_header_value, bearer_token
        )
    return dependency


def require_write_permission():
    """Dependency factory for endpoints requiring write permission."""
    async def dependency(
        request: Request,
        api_key_header_value: Optional[str] = Security(api_key_header),
        bearer_token: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
    ) -> Dict[str, Any]:
        return await require_sync_permission(
            SyncKeyPermission.WRITE, request, api_key_header_value, bearer_token
        )
    return dependency


def require_export_permission():
    """Dependency factory for endpoints requiring export permission."""
    async def dependency(
        request: Request,
        api_key_header_value: Optional[str] = Security(api_key_header),
        bearer_token: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
    ) -> Dict[str, Any]:
        return await require_sync_permission(
            SyncKeyPermission.EXPORT, request, api_key_header_value, bearer_token
        )
    return dependency


def require_import_permission():
    """Dependency factory for endpoints requiring import permission."""
    async def dependency(
        request: Request,
        api_key_header_value: Optional[str] = Security(api_key_header),
        bearer_token: Optional[HTTPAuthorizationCredentials] = Security(bearer_security),
    ) -> Dict[str, Any]:
        return await require_sync_permission(
            SyncKeyPermission.IMPORT, request, api_key_header_value, bearer_token
        )
    return dependency
