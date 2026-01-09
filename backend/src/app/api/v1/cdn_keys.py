"""
CDN Key Sync API

Internal endpoints for syncing workspace encryption keys to Cloudflare Workers KV.
This enables edge decryption of assets while maintaining full encryption at rest.

Security:
- Admin-only access required
- Keys are encrypted before storage in Workers KV
- Audit logging for all key operations (SOC2 compliance)
- Workspace existence validation
- Sanitized error messages (no information disclosure)
"""

import logging
import os
import hashlib
import hmac
from datetime import datetime
from typing import Optional
from uuid import UUID

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app.api.dependencies.auth import require_platform_permission, CurrentUser
from app.db.postgres import get_connection
from app.config.settings import get_settings

settings = get_settings()

# Admin dependency - requires platform:admins:write permission
get_current_admin_user = require_platform_permission("platform:admins:write")

# Standard logger for operational messages
logger = logging.getLogger(__name__)

# Audit logger for SOC2 compliance - key operations must be auditable
audit_logger = logging.getLogger("audit.cdn_keys")

# Constants - avoid magic numbers
KEY_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 days
ID_TRUNCATE_LENGTH = 8  # For displaying truncated IDs in status
MAX_BULK_SYNC_SIZE = 100  # Maximum workspaces per bulk sync request
CLOUDFLARE_API_TIMEOUT = 30.0  # HTTP timeout in seconds

router = APIRouter(
    prefix="/api/v1/admin/cdn-keys",
    tags=["cdn-keys"],
)


# Cloudflare configuration
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_KV_NAMESPACE_ID = os.getenv("CLOUDFLARE_KV_NAMESPACE_ID", "")
KV_ENCRYPTION_KEY = os.getenv("KV_ENCRYPTION_KEY", "").encode()[:32]  # 256 bits


class KeySyncRequest(BaseModel):
    """Request to sync workspace key to CDN."""
    workspace_id: UUID = Field(..., description="Workspace ID to sync key for")


class KeySyncResponse(BaseModel):
    """Response after key sync operation."""
    success: bool
    workspace_id: UUID
    synced_at: datetime
    message: str


class KeyDeleteRequest(BaseModel):
    """Request to delete workspace key from CDN."""
    workspace_id: UUID = Field(..., description="Workspace ID to delete key for")


class BulkSyncRequest(BaseModel):
    """Request to sync multiple workspace keys."""
    workspace_ids: list[UUID] = Field(
        ...,
        description="List of workspace IDs to sync",
        max_length=MAX_BULK_SYNC_SIZE,
    )

    @field_validator("workspace_ids")
    @classmethod
    def validate_workspace_ids(cls, v: list[UUID]) -> list[UUID]:
        """Ensure bulk sync doesn't exceed maximum size."""
        if len(v) > MAX_BULK_SYNC_SIZE:
            raise ValueError(f"Maximum {MAX_BULK_SYNC_SIZE} workspaces per request")
        if len(v) == 0:
            raise ValueError("At least one workspace ID required")
        # Remove duplicates while preserving order
        seen = set()
        unique = []
        for workspace_id in v:
            if workspace_id not in seen:
                seen.add(workspace_id)
                unique.append(workspace_id)
        return unique


class CDNStatusResponse(BaseModel):
    """CDN configuration status."""
    configured: bool
    cloudflare_account_id: str
    kv_namespace_id: str
    kv_encryption_configured: bool


def _validate_cloudflare_config() -> None:
    """
    Validate Cloudflare configuration is complete.
    Raises HTTPException if CDN is not configured.
    """
    if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_API_TOKEN or not CLOUDFLARE_KV_NAMESPACE_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CDN service not configured"
        )


def encrypt_key_for_kv(workspace_key: bytes) -> bytes:
    """
    Encrypt a workspace key for storage in Workers KV.

    Uses AES-256-GCM with a random IV prepended to the ciphertext.
    """
    if len(KV_ENCRYPTION_KEY) < 32:
        raise ValueError("KV encryption key not properly configured")

    # Generate random IV (12 bytes for GCM)
    iv = os.urandom(12)

    # Encrypt with AES-GCM
    aesgcm = AESGCM(KV_ENCRYPTION_KEY)
    ciphertext = aesgcm.encrypt(iv, workspace_key, None)

    # Return IV + ciphertext
    return iv + ciphertext


async def validate_workspace_exists(workspace_id: UUID) -> bool:
    """
    Validate that a workspace exists in the database.
    Returns True if workspace exists, False otherwise.
    """
    async with get_connection() as conn:
        result = await conn.fetchval(
            "SELECT workspace_id FROM workspaces WHERE workspace_id = $1",
            workspace_id
        )
        return result is not None


async def get_workspace_encryption_key(workspace_id: UUID) -> Optional[bytes]:
    """
    Retrieve the encryption key for a workspace.

    In production, this would fetch from a secure key management service.
    For RawDrive, workspace keys are derived from a master key + workspace_id.
    """
    # Derive workspace key from master key
    # In production, use a proper KMS (AWS KMS, Google Cloud KMS, etc.)
    master_key = os.getenv("ENCRYPTION_MASTER_KEY", settings.SECRET_KEY).encode()

    # HKDF-like derivation: HMAC-SHA256(master_key, workspace_id)
    workspace_key = hmac.new(
        master_key,
        str(workspace_id).encode(),
        hashlib.sha256
    ).digest()

    return workspace_key


async def sync_key_to_cloudflare(workspace_id: UUID, encrypted_key: bytes) -> bool:
    """
    Sync an encrypted workspace key to Cloudflare Workers KV.
    """
    _validate_cloudflare_config()

    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}"
        f"/storage/kv/namespaces/{CLOUDFLARE_KV_NAMESPACE_ID}/values/workspace:{workspace_id}"
    )

    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/octet-stream",
    }

    params = {
        "expiration_ttl": KEY_TTL_SECONDS
    }

    async with httpx.AsyncClient() as client:
        response = await client.put(
            url,
            headers=headers,
            params=params,
            content=encrypted_key,
            timeout=CLOUDFLARE_API_TIMEOUT
        )

        if response.status_code != 200:
            # Log the actual error for debugging but don't expose to client
            logger.error(
                f"Cloudflare KV sync failed for workspace {workspace_id}: "
                f"status={response.status_code}"
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="CDN key sync failed"
            )

        return True


async def delete_key_from_cloudflare(workspace_id: UUID) -> bool:
    """
    Delete a workspace key from Cloudflare Workers KV.
    """
    _validate_cloudflare_config()

    url = (
        f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}"
        f"/storage/kv/namespaces/{CLOUDFLARE_KV_NAMESPACE_ID}/values/workspace:{workspace_id}"
    )

    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
    }

    async with httpx.AsyncClient() as client:
        response = await client.delete(
            url,
            headers=headers,
            timeout=CLOUDFLARE_API_TIMEOUT
        )

        # 200 = deleted, 404 = didn't exist (also success)
        if response.status_code not in (200, 404):
            logger.error(
                f"Cloudflare KV delete failed for workspace {workspace_id}: "
                f"status={response.status_code}"
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="CDN key revocation failed"
            )

        return True


def _audit_log(
    action: str,
    workspace_id: UUID,
    admin_user_id: UUID,
    success: bool,
    details: Optional[str] = None
) -> None:
    """
    Log CDN key operations for SOC2 audit trail.
    """
    audit_logger.info(
        f"CDN_KEY_OPERATION",
        extra={
            "action": action,
            "workspace_id": str(workspace_id),
            "admin_user_id": str(admin_user_id),
            "success": success,
            "details": details,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )


@router.get("/status", response_model=CDNStatusResponse)
async def get_cdn_status(
    current_user: CurrentUser = Depends(get_current_admin_user),
):
    """
    Get CDN configuration status.

    Returns whether Cloudflare CDN is properly configured.
    """
    return CDNStatusResponse(
        configured=bool(CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN and CLOUDFLARE_KV_NAMESPACE_ID),
        cloudflare_account_id=(
            CLOUDFLARE_ACCOUNT_ID[:ID_TRUNCATE_LENGTH] + "..."
            if CLOUDFLARE_ACCOUNT_ID else ""
        ),
        kv_namespace_id=(
            CLOUDFLARE_KV_NAMESPACE_ID[:ID_TRUNCATE_LENGTH] + "..."
            if CLOUDFLARE_KV_NAMESPACE_ID else ""
        ),
        kv_encryption_configured=len(KV_ENCRYPTION_KEY) >= 32,
    )


@router.post("/sync", response_model=KeySyncResponse)
async def sync_workspace_key(
    request: KeySyncRequest,
    current_user: CurrentUser = Depends(get_current_admin_user),
):
    """
    Sync a workspace encryption key to Cloudflare Workers KV.

    This enables edge decryption for the workspace's assets.
    Admin access required.
    """
    # Validate workspace exists
    if not await validate_workspace_exists(request.workspace_id):
        _audit_log("sync", request.workspace_id, current_user.user_id, False, "Workspace not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )

    # Get workspace key
    workspace_key = await get_workspace_encryption_key(request.workspace_id)
    if not workspace_key:
        _audit_log("sync", request.workspace_id, current_user.user_id, False, "Key derivation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Key generation failed"
        )

    # Encrypt key for KV storage
    encrypted_key = encrypt_key_for_kv(workspace_key)

    # Sync to Cloudflare
    await sync_key_to_cloudflare(request.workspace_id, encrypted_key)

    _audit_log("sync", request.workspace_id, current_user.user_id, True)

    return KeySyncResponse(
        success=True,
        workspace_id=request.workspace_id,
        synced_at=datetime.utcnow(),
        message="Workspace key synced to CDN successfully",
    )


@router.post("/sync/bulk", response_model=list[KeySyncResponse])
async def sync_workspace_keys_bulk(
    request: BulkSyncRequest,
    current_user: CurrentUser = Depends(get_current_admin_user),
):
    """
    Sync multiple workspace keys to Cloudflare Workers KV.

    Useful for initial setup or key rotation.
    Admin access required. Maximum 100 workspaces per request.
    """
    results = []

    for workspace_id in request.workspace_ids:
        try:
            # Validate workspace exists
            if not await validate_workspace_exists(workspace_id):
                _audit_log("bulk_sync", workspace_id, current_user.user_id, False, "Workspace not found")
                results.append(KeySyncResponse(
                    success=False,
                    workspace_id=workspace_id,
                    synced_at=datetime.utcnow(),
                    message="Workspace not found",
                ))
                continue

            # Get workspace key
            workspace_key = await get_workspace_encryption_key(workspace_id)
            if not workspace_key:
                _audit_log("bulk_sync", workspace_id, current_user.user_id, False, "Key derivation failed")
                results.append(KeySyncResponse(
                    success=False,
                    workspace_id=workspace_id,
                    synced_at=datetime.utcnow(),
                    message="Key generation failed",
                ))
                continue

            # Encrypt key for KV storage
            encrypted_key = encrypt_key_for_kv(workspace_key)

            # Sync to Cloudflare
            await sync_key_to_cloudflare(workspace_id, encrypted_key)

            _audit_log("bulk_sync", workspace_id, current_user.user_id, True)
            results.append(KeySyncResponse(
                success=True,
                workspace_id=workspace_id,
                synced_at=datetime.utcnow(),
                message="Synced successfully",
            ))

        except HTTPException as e:
            # Re-raise HTTP exceptions (already sanitized)
            _audit_log("bulk_sync", workspace_id, current_user.user_id, False, "HTTP error")
            results.append(KeySyncResponse(
                success=False,
                workspace_id=workspace_id,
                synced_at=datetime.utcnow(),
                message="Sync failed",
            ))
        except Exception as e:
            # Log the actual error but return sanitized message
            logger.exception(f"Bulk sync failed for workspace {workspace_id}")
            _audit_log("bulk_sync", workspace_id, current_user.user_id, False, "Internal error")
            results.append(KeySyncResponse(
                success=False,
                workspace_id=workspace_id,
                synced_at=datetime.utcnow(),
                message="Internal error during sync",
            ))

    return results


@router.delete("/revoke", response_model=KeySyncResponse)
async def revoke_workspace_key(
    request: KeyDeleteRequest,
    current_user: CurrentUser = Depends(get_current_admin_user),
):
    """
    Revoke a workspace's CDN access by deleting its key from Workers KV.

    This immediately disables edge decryption for the workspace.
    Admin access required.
    """
    # Note: We don't validate workspace exists here because we want to be able
    # to revoke keys even for deleted workspaces (security measure)

    await delete_key_from_cloudflare(request.workspace_id)

    _audit_log("revoke", request.workspace_id, current_user.user_id, True)

    return KeySyncResponse(
        success=True,
        workspace_id=request.workspace_id,
        synced_at=datetime.utcnow(),
        message="Workspace key revoked from CDN",
    )


@router.post("/rotate/{workspace_id}", response_model=KeySyncResponse)
async def rotate_workspace_key(
    workspace_id: UUID,
    current_user: CurrentUser = Depends(get_current_admin_user),
):
    """
    Rotate a workspace's encryption key in the CDN.

    This is useful for periodic key rotation or after a security incident.
    Admin access required.

    Note: This only updates the CDN key. The actual workspace key rotation
    (re-encrypting all assets) is handled by a separate process.
    """
    # Validate workspace exists
    if not await validate_workspace_exists(workspace_id):
        _audit_log("rotate", workspace_id, current_user.user_id, False, "Workspace not found")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace not found"
        )

    # Get workspace key
    workspace_key = await get_workspace_encryption_key(workspace_id)
    if not workspace_key:
        _audit_log("rotate", workspace_id, current_user.user_id, False, "Key derivation failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Key generation failed"
        )

    # Encrypt key for KV storage
    encrypted_key = encrypt_key_for_kv(workspace_key)

    # Sync to Cloudflare (overwrites existing key)
    await sync_key_to_cloudflare(workspace_id, encrypted_key)

    _audit_log("rotate", workspace_id, current_user.user_id, True)

    return KeySyncResponse(
        success=True,
        workspace_id=workspace_id,
        synced_at=datetime.utcnow(),
        message="Workspace key rotated in CDN",
    )
